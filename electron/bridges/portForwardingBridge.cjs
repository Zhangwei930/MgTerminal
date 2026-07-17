/**
 * Port Forwarding Bridge - Handles SSH port forwarding tunnels
 * Extracted from main.cjs for single responsibility
 */

const net = require("node:net");
require("./boringSslDhCompat.cjs").installBoringSslDhCompat();
const { Client: SSHClient } = require("ssh2");
const { MagiesTerminalAgent } = require("./magiesTerminalAgent.cjs");
const keyboardInteractiveHandler = require("./keyboardInteractiveHandler.cjs");
const { connectThroughChain, buildAlgorithms } = require("./sshBridge.cjs");
const {
  acquireConnectionRef,
  releaseConnectionRef,
  findReusableSessionByEndpoint,
} = require("./sshConnectionPool.cjs");
const hostKeyVerifier = require("./hostKeyVerifier.cjs");
const { createProxySocket } = require("./proxyUtils.cjs");
const { 
  buildAuthHandler, 
  createKeyboardInteractiveHandler, 
  applyAuthToConnOpts,
  findAllDefaultPrivateKeys: findAllDefaultPrivateKeysFromHelper,
  preparePrivateKeyForAuth,
  loadFirstIdentityFileForAuth,
  isPassphraseCancelledError,
} = require("./sshAuthHelper.cjs");
const {
  createPortForwardChannelTracker,
  formatSocketAddress,
} = require("./portForwardChannelTracker.cjs");

// Active port forwarding tunnels
const portForwardingTunnels = new Map();

function broadcastChannelSnapshot(channels) {
  try {
    const { BrowserWindow } = require("electron");
    const payload = { channels };
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send("magiesTerminal:portforward:channels", payload);
      } catch {
        /* ignore */
      }
    }
  } catch {
    // electron may be unavailable in unit tests
  }
}

const channelTracker = createPortForwardChannelTracker({
  onChange: broadcastChannelSnapshot,
});

// Shared terminal-session map (sshBridge/terminalBridge), injected via
// registerHandlers so local/dynamic tunnels can piggyback on an existing
// authenticated SSH connection instead of re-authenticating (2FA hosts).
let sharedSessions = null;

function cleanupChainConnections(connections) {
  if (!Array.isArray(connections)) return;
  for (const chainConn of connections) {
    try { chainConn.end(); } catch { /* ignore */ }
  }
}

function isTunnelCancelled(tunnelState) {
  return Boolean(tunnelState?.cancelled);
}

function cancelTunnel(tunnelId, tunnel, sendStatus, { deleteEntry = false } = {}) {
  if (!tunnel) return;
  tunnel.cancelled = true;
  tunnel.status = 'inactive';
  if (tunnel.server) {
    try { tunnel.server.close(); } catch { /* ignore */ }
  }
  if (tunnel.passphraseAbortController && !tunnel.passphraseAbortController.signal.aborted) {
    try { tunnel.passphraseAbortController.abort(); } catch { /* ignore */ }
  }
  if (tunnel.pendingConn) {
    try { tunnel.pendingConn.end(); } catch { /* ignore */ }
  }
  cleanupChainConnections(tunnel.chainConnections);
  if (tunnel.connRef) {
    // Tunnel borrowed a shared terminal connection: drop our reference (the
    // transport only ends when the last holder releases) and stop listening
    // for its close events. Never end() the shared conn directly.
    tunnel.removeSharedConnListener?.();
    releaseConnectionRef(tunnel);
  } else if (tunnel.conn) {
    try { tunnel.conn.end(); } catch { /* ignore */ }
  }
  sendStatus?.('inactive');
  channelTracker.clearTunnel(tunnelId);
  if (deleteEntry) {
    portForwardingTunnels.delete(tunnelId);
  }
}

const { safeSend } = require("./ipcUtils.cjs");

/**
 * Local forwarding server: accept local TCP clients and pipe each through a
 * forwardOut channel on the (possibly shared) SSH connection.
 */
function createLocalForwardServer({
  conn,
  bindAddress,
  localPort,
  remoteHost,
  remotePort,
  tunnelId,
  ruleId,
}) {
  return net.createServer((socket) => {
    const source = formatSocketAddress(socket);
    const destination = `${remoteHost || "?"}:${remotePort || "?"}`;
    conn.forwardOut(
      bindAddress,
      localPort,
      remoteHost,
      remotePort,
      (err, stream) => {
        if (err) {
          console.error(`[PortForward] Forward error:`, err.message);
          socket.end();
          return;
        }
        if (tunnelId) {
          channelTracker.attach({
            tunnelId,
            ruleId,
            type: "local",
            source,
            destination,
            socket,
            stream,
          });
        }
        socket.pipe(stream).pipe(socket);

        socket.on('error', (e) => console.warn('[PortForward] Socket error:', e.message));
        stream.on('error', (e) => console.warn('[PortForward] Stream error:', e.message));
      }
    );
  });
}

/**
 * Dynamic forwarding server: minimal SOCKS5 endpoint whose CONNECT requests
 * are carried over forwardOut channels on the (possibly shared) SSH connection.
 */
function createSocksProxyServer({ conn, bindAddress, tunnelId, ruleId }) {
  return net.createServer((socket) => {
    // Simple SOCKS5 handshake
    socket.once('data', (data) => {
      if (data[0] !== 0x05) {
        socket.end();
        return;
      }

      // Reply: version, no auth required
      socket.write(Buffer.from([0x05, 0x00]));

      // Wait for connection request
      socket.once('data', (request) => {
        if (request[0] !== 0x05 || request[1] !== 0x01) {
          socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socket.end();
          return;
        }

        let targetHost, targetPort;
        const addressType = request[3];

        if (addressType === 0x01) {
          // IPv4
          targetHost = `${request[4]}.${request[5]}.${request[6]}.${request[7]}`;
          targetPort = request.readUInt16BE(8);
        } else if (addressType === 0x03) {
          // Domain name
          const domainLength = request[4];
          targetHost = request.slice(5, 5 + domainLength).toString();
          targetPort = request.readUInt16BE(5 + domainLength);
        } else if (addressType === 0x04) {
          // IPv6 - simplified handling
          socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socket.end();
          return;
        } else {
          socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          socket.end();
          return;
        }

        // Forward through SSH tunnel
        conn.forwardOut(
          bindAddress,
          0,
          targetHost,
          targetPort,
          (err, stream) => {
            if (err) {
              socket.write(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
              socket.end();
              return;
            }

            // Success reply
            const reply = Buffer.alloc(10);
            reply[0] = 0x05;
            reply[1] = 0x00;
            reply[2] = 0x00;
            reply[3] = 0x01;
            reply.writeUInt16BE(0, 8);
            socket.write(reply);

            if (tunnelId) {
              channelTracker.attach({
                tunnelId,
                ruleId,
                type: "dynamic",
                source: formatSocketAddress(socket),
                destination: `${targetHost}:${targetPort}`,
                socket,
                stream,
              });
            }

            socket.pipe(stream).pipe(socket);

            socket.on('error', () => stream.end());
            stream.on('error', () => socket.end());
          }
        );
      });
    });
  });
}

/**
 * Start a local/dynamic tunnel on an already-authenticated SSH connection
 * borrowed from a live terminal session (no second auth / 2FA prompt).
 *
 * The tunnel takes a reference on the shared transport, so it survives the
 * source terminal tab closing; the transport is only torn down when the last
 * holder releases it. Remote forwards are excluded: their `tcp connection`
 * listener and forwardIn state on a shared Client would clash with siblings.
 */
function startTunnelOnSharedConnection({
  source, type, ruleId, tunnelId, sender, sendStatus,
  bindAddress, localPort, remoteHost, remotePort,
}) {
  const conn = source.connRef.conn;
  const tunnelState = {
    type,
    conn,
    pendingConn: null,
    server: null,
    chainConnections: [],
    passphraseAbortController: null,
    ruleId,
    status: 'connecting',
    webContentsId: sender.id,
    cancelled: false,
  };
  acquireConnectionRef(tunnelState, source.connRef);
  portForwardingTunnels.set(tunnelId, tunnelState);
  sendStatus('connecting');

  return new Promise((resolve, reject) => {
    let settled = false;

    const onSharedConnClose = () => {
      console.log(`[PortForward] Shared SSH connection closed for tunnel ${tunnelId}`);
      const tunnel = portForwardingTunnels.get(tunnelId) || tunnelState;
      if (tunnel.server) {
        try { tunnel.server.close(); } catch { /* ignore */ }
      }
      releaseConnectionRef(tunnel);
      sendStatus('inactive');
      channelTracker.clearTunnel(tunnelId);
      portForwardingTunnels.delete(tunnelId);
      if (!settled) {
        settled = true;
        reject(new Error(`Tunnel ${tunnelId} closed before it was established`));
      }
    };
    conn.on('close', onSharedConnClose);
    tunnelState.removeSharedConnListener = () => {
      try { conn.removeListener('close', onSharedConnClose); } catch { /* ignore */ }
    };

    const server = type === 'local'
      ? createLocalForwardServer({
        conn, bindAddress, localPort, remoteHost, remotePort, tunnelId, ruleId,
      })
      : createSocksProxyServer({ conn, bindAddress, tunnelId, ruleId });

    server.on('error', (err) => {
      console.error(`[PortForward] Server error (shared connection):`, err.message);
      try { server.close(); } catch { /* ignore */ }
      tunnelState.removeSharedConnListener?.();
      releaseConnectionRef(tunnelState);
      portForwardingTunnels.delete(tunnelId);
      sendStatus('error', err.message);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    server.listen(localPort, bindAddress, () => {
      const label = type === 'local'
        ? `${bindAddress}:${localPort} -> ${remoteHost}:${remotePort}`
        : `SOCKS5 on ${bindAddress}:${localPort}`;
      console.log(`[PortForward] ${label} active on shared SSH connection (tunnel ${tunnelId})`);
      tunnelState.server = server;
      tunnelState.status = 'active';
      sendStatus('active');
      settled = true;
      resolve({ tunnelId, success: true });
    });
  });
}

/**
 * Start a port forwarding tunnel
 */
async function startPortForward(event, payload) {
  const {
    ruleId,
    tunnelId,
    type, // 'local' | 'remote' | 'dynamic'
    localPort,
    bindAddress = '127.0.0.1',
    remoteHost,
    remotePort,
    hostname,
    port = 22,
    username,
    password,
    privateKey,
    certificate,
    keyId,
    passphrase,
    knownHosts,
    verifyHostKeys,
    proxy,
    jumpHosts = [],
    identityFilePaths,
    legacyAlgorithms,
    skipEcdsaHostKey,
    algorithmOverrides,
    keepaliveInterval: resolvedKeepaliveInterval,
    keepaliveCountMax: resolvedKeepaliveCountMax,
  } = payload;

  const sender = event.sender;

  const sendStatus = (status, error = null) => {
    if (!sender.isDestroyed()) {
      sender.send("magiesTerminal:portforward:status", { tunnelId, status, error });
    }
  };

  // Local/dynamic tunnels prefer an existing authenticated terminal connection
  // to the same endpoint over dialing (and re-authenticating) a fresh one.
  // Remote forwards always dial fresh — see startTunnelOnSharedConnection.
  if (type === 'local' || type === 'dynamic') {
    const source = findReusableSessionByEndpoint(sharedSessions, {
      hostname,
      port,
      username: username || 'root',
    });
    if (source) {
      console.log(`[PortForward] Reusing authenticated SSH connection for tunnel ${tunnelId}`);
      try {
        return await startTunnelOnSharedConnection({
          source, type, ruleId, tunnelId, sender, sendStatus,
          bindAddress, localPort, remoteHost, remotePort,
        });
      } catch (err) {
        console.warn(`[PortForward] Shared-connection tunnel failed, dialing fresh:`, err?.message || err);
      }
    }
  }

  const conn = new SSHClient();
  const hasJumpHosts = jumpHosts.length > 0;
  const hasProxy = !!proxy;
  let chainConnections = [];
  let connectionSocket = null;
  const passphraseAbortController = new AbortController();
  const tunnelState = {
    type,
    conn,
    pendingConn: null,
    server: null,
    chainConnections,
    passphraseAbortController,
    ruleId,
    status: 'connecting',
    webContentsId: sender.id,
    cancelled: false,
  };

  // Keepalive policy:
  //   - positive value: honor it
  //   - explicit 0: truly disabled (host opted out via per-host override —
  //     a router/switch that doesn't reply to keepalive@openssh.com would
  //     otherwise be killed by ssh2 after countMax unanswered probes)
  //   - undefined: legacy caller path, fall back to 10s/3 so an idle
  //     forwarded TCP tunnel doesn't get dropped by NAT state tables.
  const tunnelKeepaliveMs = resolvedKeepaliveInterval == null
    ? 10000
    : (resolvedKeepaliveInterval > 0 ? resolvedKeepaliveInterval * 1000 : 0);
  const tunnelKeepaliveCountMax = resolvedKeepaliveInterval == null
    ? 3
    : (resolvedKeepaliveInterval > 0 ? (resolvedKeepaliveCountMax ?? 3) : 0);
  const connectOpts = {
    host: hostname,
    port: port,
    username: username || 'root',
    readyTimeout: 120000, // 2 minutes for 2FA input
    keepaliveInterval: tunnelKeepaliveMs,
    keepaliveCountMax: tunnelKeepaliveCountMax,
    // Enable keyboard-interactive authentication (required for 2FA/MFA)
    tryKeyboard: true,
    algorithms: buildAlgorithms(legacyAlgorithms, { skipEcdsaHostKey, algorithmOverrides }),
  };
  connectOpts.hostVerifier = hostKeyVerifier.createHostVerifier({
    sender,
    sessionId: tunnelId,
    hostname,
    port,
    knownHosts,
    verifyHostKeys,
  });

  const hasCertificate = typeof certificate === "string" && certificate.trim().length > 0;
  sendStatus('connecting');
  portForwardingTunnels.set(tunnelId, tunnelState);

  let defaultKeys = [];
  try {
    const identityFile = !privateKey
      ? await loadFirstIdentityFileForAuth({
        sender,
        identityFilePaths,
        hostname,
        initialPassphrase: passphrase,
        passphraseSignal: passphraseAbortController.signal,
        logPrefix: "[PortForward]",
        onError: (err, keyPath) => {
          console.warn(`[PortForward] Failed to read identity file ${keyPath}:`, err.message);
        },
      })
      : null;
    const inlineKey = privateKey
      ? await preparePrivateKeyForAuth({
        sender,
        privateKey,
        keyId,
        keyName: keyId || username,
        hostname,
        initialPassphrase: passphrase,
        passphraseSignal: passphraseAbortController.signal,
        logPrefix: "[PortForward]",
      })
      : null;
    const effectivePrivateKey = inlineKey?.privateKey || identityFile?.privateKey;
    const effectivePassphrase = inlineKey?.passphrase || identityFile?.passphrase;

    if (isTunnelCancelled(tunnelState)) {
      portForwardingTunnels.delete(tunnelId);
      return { tunnelId, success: false, cancelled: true };
    }

    if (hasCertificate) {
      connectOpts.agent = new MagiesTerminalAgent({
        mode: "certificate",
        webContents: sender,
        meta: {
          label: keyId || username || "",
          certificate,
          privateKey: effectivePrivateKey,
          passphrase: effectivePassphrase,
        },
      });
    } else if (effectivePrivateKey) {
      connectOpts.privateKey = effectivePrivateKey;
      if (effectivePassphrase) {
        connectOpts.passphrase = effectivePassphrase;
      }
    }
    if (password) {
      connectOpts.password = password;
    }

    // Get default keys
    defaultKeys = await findAllDefaultPrivateKeysFromHelper();
    if (isTunnelCancelled(tunnelState)) {
      portForwardingTunnels.delete(tunnelId);
      return { tunnelId, success: false, cancelled: true };
    }

    // Build auth handler using shared helper
    const authConfig = buildAuthHandler({
      privateKey: connectOpts.privateKey,
      password,
      passphrase: connectOpts.passphrase,
      agent: connectOpts.agent,
      username: connectOpts.username,
      logPrefix: "[PortForward]",
      defaultKeys,
    });
    applyAuthToConnOpts(connectOpts, authConfig);
    if (isTunnelCancelled(tunnelState)) {
      portForwardingTunnels.delete(tunnelId);
      return { tunnelId, success: false, cancelled: true };
    }

    if (hasJumpHosts) {
      const chainResult = await connectThroughChain(
        event,
        {
          hostname,
          port,
          username,
          password,
          privateKey,
          passphrase,
          proxy,
          knownHosts,
          verifyHostKeys,
          jumpHosts,
          legacyAlgorithms,
          skipEcdsaHostKey,
          algorithmOverrides,
          _defaultKeys: defaultKeys,
          _connectionsRef: chainConnections,
          _tunnelRef: tunnelState,
          _passphraseSignal: passphraseAbortController.signal,
          _keyboardInteractiveScope: "external",
        },
        jumpHosts,
        hostname,
        port,
        tunnelId,
      );
      connectionSocket = chainResult.socket;
      chainConnections = chainResult.connections;
      tunnelState.chainConnections = chainConnections;
      if (isTunnelCancelled(tunnelState)) {
        cleanupChainConnections(chainConnections);
        portForwardingTunnels.delete(tunnelId);
        return { tunnelId, success: false, cancelled: true };
      }
      connectOpts.sock = connectionSocket;
      delete connectOpts.host;
      delete connectOpts.port;
    } else if (hasProxy) {
      connectionSocket = await createProxySocket(proxy, hostname, port, {
        onSocket: (socket) => {
          tunnelState.pendingConn = socket;
        },
      });
      if (isTunnelCancelled(tunnelState)) {
        try { connectionSocket?.end?.(); } catch { /* ignore */ }
        try { connectionSocket?.destroy?.(); } catch { /* ignore */ }
        portForwardingTunnels.delete(tunnelId);
        return { tunnelId, success: false, cancelled: true };
      }
      tunnelState.pendingConn = null;
      connectOpts.sock = connectionSocket;
      delete connectOpts.host;
      delete connectOpts.port;
    }
  } catch (err) {
    if (isTunnelCancelled(tunnelState)) {
      portForwardingTunnels.delete(tunnelId);
      return { tunnelId, success: false, cancelled: true };
    }
    if (isPassphraseCancelledError(err)) {
      cancelTunnel(tunnelId, tunnelState, sendStatus, { deleteEntry: true });
      return { tunnelId, success: false, cancelled: true };
    }
    tunnelState.cancelled = true;
    if (tunnelState.pendingConn) {
      try { tunnelState.pendingConn.end(); } catch { /* ignore */ }
    }
    cleanupChainConnections(tunnelState.chainConnections);
    if (connectionSocket) {
      try { connectionSocket.end?.(); } catch { /* ignore */ }
      try { connectionSocket.destroy?.(); } catch { /* ignore */ }
    }
    portForwardingTunnels.delete(tunnelId);
    sendStatus('error', err?.message || String(err));
    throw err;
  }

  // Handle keyboard-interactive authentication (2FA/MFA)
  conn.on("keyboard-interactive", createKeyboardInteractiveHandler({
    sender,
    sessionId: tunnelId,
    hostname,
    password,
    logPrefix: "[PortForward]",
    scope: "external",
  }));

  return new Promise((resolve, reject) => {
    // Track whether the Promise has been settled so conn.on('close')
    // can reject if the tunnel was killed during SSH handshake.
    let settled = false;

    conn.once('ready', () => {
      console.log(`[PortForward] SSH connection ready for tunnel ${tunnelId}`);

      if (type === 'local') {
        // LOCAL FORWARDING: Listen on local port, forward to remote
        const server = createLocalForwardServer({
          conn, bindAddress, localPort, remoteHost, remotePort, tunnelId, ruleId,
        });

        server.on('error', (err) => {
          console.error(`[PortForward] Server error:`, err.message);
          sendStatus('error', err.message);
          conn.end();
          settled = true;
          reject(err);
        });

        server.listen(localPort, bindAddress, () => {
          console.log(`[PortForward] Local forwarding active: ${bindAddress}:${localPort} -> ${remoteHost}:${remotePort}`);
          tunnelState.type = 'local';
          tunnelState.conn = conn;
          tunnelState.server = server;
          tunnelState.chainConnections = chainConnections;
          tunnelState.status = 'active';
          tunnelState.webContentsId = sender.id;
          tunnelState.pendingConn = null;
          portForwardingTunnels.set(tunnelId, tunnelState);
          sendStatus('active');
          settled = true;
          resolve({ tunnelId, success: true });
        });

      } else if (type === 'remote') {
        // REMOTE FORWARDING: Listen on remote port, forward to local
        conn.forwardIn(bindAddress, localPort, (err) => {
          if (err) {
            console.error(`[PortForward] Remote forward error:`, err.message);
            sendStatus('error', err.message);
            conn.end();
            settled = true;
            reject(err);
            return;
          }

          console.log(`[PortForward] Remote forwarding active: remote ${bindAddress}:${localPort} -> local ${remoteHost}:${remotePort}`);
          tunnelState.type = 'remote';
          tunnelState.conn = conn;
          tunnelState.server = null;
          tunnelState.chainConnections = chainConnections;
          tunnelState.status = 'active';
          tunnelState.webContentsId = sender.id;
          tunnelState.pendingConn = null;
          portForwardingTunnels.set(tunnelId, tunnelState);
          sendStatus('active');
          settled = true;
          resolve({ tunnelId, success: true });
        });

        // Handle incoming connections from remote
        conn.on('tcp connection', (info, accept, rejectConn) => {
          const stream = accept();
          const remoteSource = info
            ? `${info.srcIP || "?"}:${info.srcPort || "?"}`
            : "remote";
          const destination = `${remoteHost || "127.0.0.1"}:${remotePort || "?"}`;
          const socket = net.connect(remotePort, remoteHost || '127.0.0.1', () => {
            channelTracker.attach({
              tunnelId,
              ruleId,
              type: "remote",
              source: remoteSource,
              destination,
              // For remote forward, stream is the remote peer (source of inbound
              // tunnel traffic) and socket is the local destination service.
              socket: stream,
              stream: socket,
            });
            stream.pipe(socket).pipe(stream);
          });

          socket.on('error', (e) => {
            console.warn('[PortForward] Local socket error:', e.message);
            stream.end();
          });
          stream.on('error', (e) => {
            console.warn('[PortForward] Remote stream error:', e.message);
            socket.end();
          });
        });

      } else if (type === 'dynamic') {
        // DYNAMIC FORWARDING (SOCKS5 Proxy)
        const server = createSocksProxyServer({ conn, bindAddress, tunnelId, ruleId });

        server.on('error', (err) => {
          console.error(`[PortForward] SOCKS server error:`, err.message);
          sendStatus('error', err.message);
          conn.end();
          settled = true;
          reject(err);
        });

        server.listen(localPort, bindAddress, () => {
          console.log(`[PortForward] Dynamic SOCKS5 proxy active on ${bindAddress}:${localPort}`);
          tunnelState.type = 'dynamic';
          tunnelState.conn = conn;
          tunnelState.server = server;
          tunnelState.chainConnections = chainConnections;
          tunnelState.status = 'active';
          tunnelState.webContentsId = sender.id;
          tunnelState.pendingConn = null;
          portForwardingTunnels.set(tunnelId, tunnelState);
          sendStatus('active');
          settled = true;
          resolve({ tunnelId, success: true });
        });
      } else {
        settled = true;
        reject(new Error(`Unknown forwarding type: ${type}`));
      }
    });

    conn.on('error', (err) => {
      console.error(`[PortForward] SSH error:`, err.message);
      if (settled) return;
      sendStatus('error', err.message);
      cleanupChainConnections(chainConnections);
      settled = true;
      reject(err);
    });

    conn.once('close', () => {
      console.log(`[PortForward] SSH connection closed for tunnel ${tunnelId}`);
      const tunnel = portForwardingTunnels.get(tunnelId) || tunnelState;
      // Capture the cancelled flag BEFORE cleanup deletes the entry.
      const wasCancelled = !!tunnel?.cancelled;
      if (tunnel) {
        if (tunnel.server) {
          try { tunnel.server.close(); } catch { }
        }
        if (Array.isArray(tunnel.chainConnections)) {
          cleanupChainConnections(tunnel.chainConnections);
        }
        if (tunnel.pendingConn) {
          try { tunnel.pendingConn.end(); } catch { /* ignore */ }
        }
        sendStatus('inactive');
        channelTracker.clearTunnel(tunnelId);
        portForwardingTunnels.delete(tunnelId);
      }
      // If the Promise was never settled (tunnel killed during
      // handshake by stopPortForwardByRuleId), settle it.
      if (!settled) {
        settled = true;
        if (wasCancelled) {
          resolve({ tunnelId, success: false, cancelled: true });
        } else {
          reject(new Error(`Tunnel ${tunnelId} closed before connection established`));
        }
      }
    });

    conn.connect(connectOpts);
  });
}

/**
 * Stop a port forwarding tunnel
 */
async function stopPortForward(event, payload) {
  const { tunnelId } = payload;
  const tunnel = portForwardingTunnels.get(tunnelId);

  if (!tunnel) {
    return { tunnelId, success: false, error: 'Tunnel not found' };
  }

  try {
    cancelTunnel(tunnelId, tunnel, null, { deleteEntry: true });
    if (!event.sender.isDestroyed()) {
      event.sender.send("magiesTerminal:portforward:status", { tunnelId, status: 'inactive', error: null });
    }
    return { tunnelId, success: true };
  } catch (err) {
    return { tunnelId, success: false, error: err.message };
  }
}

/**
 * Get status of a tunnel
 */
async function getPortForwardStatus(event, payload) {
  const { tunnelId } = payload;
  const tunnel = portForwardingTunnels.get(tunnelId);

  if (!tunnel) {
    return { tunnelId, status: 'inactive' };
  }

  return { tunnelId, status: tunnel.status || 'active', type: tunnel.type };
}

/**
 * List all active port forwards
 */
async function listPortForwards() {
  const list = [];
  for (const [tunnelId, tunnel] of portForwardingTunnels) {
    list.push({
      tunnelId,
      type: tunnel.type,
      status: tunnel.status || 'active',
      ruleId: tunnel.ruleId,
    });
  }
  return list;
}

/**
 * List live TCP channels across all tunnels (source / destination / traffic).
 */
async function listPortForwardChannels() {
  return { channels: channelTracker.list() };
}

/**
 * Stop all active port forwards (cleanup on app quit)
 */
function stopAllPortForwards() {
  console.log(`[PortForward] Stopping all ${portForwardingTunnels.size} active tunnels...`);
  for (const [tunnelId, tunnel] of portForwardingTunnels) {
      try {
        cancelTunnel(tunnelId, tunnel, null, { deleteEntry: true });
        console.log(`[PortForward] Stopped tunnel ${tunnelId}`);
    } catch (err) {
      console.warn(`[PortForward] Failed to stop tunnel ${tunnelId}:`, err.message);
    }
  }
  channelTracker.clearAll();
  console.log('[PortForward] All tunnels stopped');
}

/**
 * Stop all active port forwards for a given rule ID.
 * This catches tunnels in ANY state (connecting, active) because it
 * operates on the main-process portForwardingTunnels map directly.
 */
function stopPortForwardByRuleId(_event, { ruleId }) {
  let stopped = 0;
  for (const [tunnelId, tunnel] of portForwardingTunnels) {
    if (tunnel.ruleId === ruleId) {
      try {
        cancelTunnel(tunnelId, tunnel, null, { deleteEntry: true });
        console.log(`[PortForward] Stopped tunnel ${tunnelId} for rule ${ruleId}`);
        stopped++;
      } catch (err) {
        console.warn(`[PortForward] Failed to stop tunnel ${tunnelId}:`, err.message);
      }
    }
  }
  return { stopped };
}

/**
 * Register IPC handlers for port forwarding operations
 *
 * @param {object} ipcMain
 * @param {{ sessions?: Map }} [deps] - shared terminal-session map enabling
 *   local/dynamic tunnels to reuse authenticated SSH connections
 */
function registerHandlers(ipcMain, deps) {
  sharedSessions = deps?.sessions ?? null;
  ipcMain.handle("magiesTerminal:portforward:start", startPortForward);
  ipcMain.handle("magiesTerminal:portforward:stop", stopPortForward);
  ipcMain.handle("magiesTerminal:portforward:status", getPortForwardStatus);
  ipcMain.handle("magiesTerminal:portforward:list", listPortForwards);
  ipcMain.handle("magiesTerminal:portforward:listChannels", listPortForwardChannels);
  ipcMain.handle("magiesTerminal:portforward:stopAll", () => stopAllPortForwards());
  ipcMain.handle("magiesTerminal:portforward:stopByRuleId", stopPortForwardByRuleId);
}

module.exports = {
  registerHandlers,
  startPortForward,
  stopPortForward,
  getPortForwardStatus,
  listPortForwards,
  listPortForwardChannels,
  stopAllPortForwards,
  stopPortForwardByRuleId,
};
