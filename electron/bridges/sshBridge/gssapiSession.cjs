"use strict";

/**
 * GSSAPI / Kerberos SSH sessions via system OpenSSH (node-pty).
 * MagiesTerminal's ssh2 stack has no GSSAPI; enterprise domain auth
 * is delegated to the platform OpenSSH client with GSSAPIAuthentication=yes.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const pty = require("node-pty");
const { execFileSync } = require("child_process");
const { emitTerminalSessionData } = require("../emitTerminalSessionData.cjs");
const { resolveSshExecutable } = require("../moshHandshake.cjs");
const {
  setBufferedOutputBytes,
  shouldAcceptSessionOutput,
} = require("../terminalFlowAck.cjs");

function findExecutable(name) {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("where", [name], { encoding: "utf8" });
      const first = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      return first || name;
    }
    const out = execFileSync("which", [name], { encoding: "utf8" });
    return out.trim() || name;
  } catch {
    return name;
  }
}

function fileExists(p) {
  try {
    return Boolean(p && fs.existsSync(p));
  } catch {
    return false;
  }
}

/**
 * Hybrid post-quantum KEX algorithms supported by modern OpenSSH (9.0+ / 9.9+).
 * Older clients ignore unknown algs when the list also includes classical KEXes.
 */
const PQ_KEX_ALGORITHMS = [
  "mlkem768x25519-sha256",
  "sntrup761x25519-sha512@openssh.com",
  "sntrup761x25519-sha512",
  "curve25519-sha256",
  "curve25519-sha256@libssh.org",
  "ecdh-sha2-nistp256",
  "diffie-hellman-group-exchange-sha256",
  "diffie-hellman-group14-sha256",
].join(",");

/**
 * Build argv for system ssh GSSAPI login (no password prompts).
 */
function buildGssapiSshArgs(options = {}) {
  return buildSystemOpenSshArgs({ ...options, authMethod: "gssapi" });
}

/**
 * Validate a hostname/username destined for the -J ProxyJump list. The list
 * is comma-separated `user@host:port` tokens, so commas, whitespace and
 * option-like leading dashes must all be rejected outright.
 */
function sanitizeJumpToken(value, kind, label) {
  const token = String(value || "").trim();
  if (!token) {
    if (kind === "hostname") throw new Error(`Jump host ${label} has no hostname.`);
    return "";
  }
  if (token.startsWith("-") || /[\s,@]/.test(token)) {
    throw new Error(`Jump host ${label} has an invalid ${kind}: ${JSON.stringify(token)}`);
  }
  return token;
}

/**
 * Loopback TCP relay for HTTP/SOCKS proxies: each accepted connection dials
 * the real target through the app's proxy stack and pipes bytes both ways,
 * letting system OpenSSH connect to 127.0.0.1 without proxy support.
 */
function createLoopbackProxyRelay(proxy, targetHost, targetPort) {
  const net = require("net");
  const { createProxySocket } = require("../proxyUtils.cjs");
  return new Promise((resolve, reject) => {
    const server = net.createServer((local) => {
      createProxySocket(proxy, targetHost, targetPort, { timeoutMs: 30_000 })
        .then((remote) => {
          local.pipe(remote);
          remote.pipe(local);
          local.on("error", () => remote.destroy());
          remote.on("error", () => local.destroy());
          local.on("close", () => remote.destroy());
          remote.on("close", () => local.destroy());
        })
        .catch(() => local.destroy());
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.unref();
      resolve({
        port,
        close: () => {
          try { server.close(); } catch { /* ignore */ }
        },
      });
    });
  });
}

/** Format MagiesTerminal jump hosts as an OpenSSH -J (ProxyJump) argument. */
function formatProxyJumpArg(jumpHosts) {
  return jumpHosts
    .map((hop, index) => {
      const label = hop?.label || hop?.hostname || `#${index + 1}`;
      const rawHost = String(hop?.hostname || "").trim();
      // IPv6 literals carry colons; -J needs them bracketed.
      const isIpv6 = rawHost.includes(":");
      const hostname = isIpv6
        ? rawHost
        : sanitizeJumpToken(rawHost, "hostname", label);
      if (isIpv6 && (!rawHost || rawHost.startsWith("-") || /[\s,@[\]]/.test(rawHost))) {
        throw new Error(`Jump host ${label} has an invalid hostname: ${JSON.stringify(rawHost)}`);
      }
      if (!hostname) throw new Error(`Jump host ${label} has no hostname.`);
      const username = sanitizeJumpToken(hop?.username, "username", label);
      const port = Number(hop?.port);
      if (hop?.port !== undefined && hop?.port !== null
        && (!Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new Error(`Jump host ${label} has an invalid port: ${hop.port}`);
      }
      const hostPart = isIpv6 ? `[${hostname}]` : hostname;
      const portPart = Number.isInteger(port) && port > 0 && port !== 22 ? `:${port}` : "";
      return `${username ? `${username}@` : ""}${hostPart}${portPart}`;
    })
    .join(",");
}

/**
 * Build argv for system OpenSSH (GSSAPI and/or post-quantum KEX preference).
 */
function buildSystemOpenSshArgs(options = {}) {
  const hostname = String(options.hostname || "").trim();
  if (!hostname) {
    throw new Error("System OpenSSH requires a hostname.");
  }
  // Reject option-like values: OpenSSH would otherwise treat a leading "-"
  // target/user as a flag (e.g. -oProxyCommand=...), turning a tampered
  // CMDB/inventory hostname into code execution.
  if (hostname.startsWith("-")) {
    throw new Error("System OpenSSH hostname must not start with '-'.");
  }
  const username = String(options.username || "").trim();
  if (username.startsWith("-")) {
    throw new Error("System OpenSSH username must not start with '-'.");
  }
  const port = Number(options.port) > 0 ? Math.trunc(Number(options.port)) : 22;
  const gssapi = options.authMethod === "gssapi";
  const preferPq = Boolean(options.preferPostQuantumKex);

  const args = ["-tt"];

  if (preferPq) {
    args.push("-o", `KexAlgorithms=${PQ_KEX_ALGORITHMS}`);
  }

  if (Array.isArray(options.jumpHosts) && options.jumpHosts.length > 0) {
    args.push("-J", formatProxyJumpArg(options.jumpHosts));
  }

  if (options.proxy?.type === "command" && options.proxy.command) {
    const { substituteProxyCommand } = require("../proxyUtils.cjs");
    args.push("-o", `ProxyCommand=${substituteProxyCommand(options.proxy.command, hostname, port)}`);
  }

  if (options.hostKeyAlias) {
    // Loopback proxy relay: keep known_hosts keyed to the real host, and skip
    // the by-IP check that would always flag 127.0.0.1.
    args.push("-o", `HostKeyAlias=${String(options.hostKeyAlias).replace(/[\s,]/g, "")}`);
    args.push("-o", "CheckHostIP=no");
  }

  if (gssapi) {
    args.push(
      "-o", "GSSAPIAuthentication=yes",
      "-o", "PreferredAuthentications=gssapi-with-mic,gssapi-keyex",
      "-o", "PubkeyAuthentication=no",
      "-o", "PasswordAuthentication=no",
      "-o", "KbdInteractiveAuthentication=no",
      "-o", "NumberOfPasswordPrompts=0",
      "-o", "BatchMode=yes",
    );
  } else {
    // General system OpenSSH: allow agent/publickey; avoid hanging password prompts in batch when only keys/agent.
    // -J offers no per-hop options, so jump-hop identity files are added
    // globally; ssh simply tries each identity on every hop.
    const hopPaths = Array.isArray(options.jumpHosts)
      ? options.jumpHosts.flatMap((hop) => Array.isArray(hop?.identityFilePaths) ? hop.identityFilePaths : [])
      : [];
    const paths = [...new Set(
      [...(Array.isArray(options.identityFilePaths) ? options.identityFilePaths : []), ...hopPaths]
        .filter((p) => typeof p === "string" && p.trim()),
    )];
    for (const identityPath of paths) {
      args.push("-i", identityPath);
    }
    if (options.agentForwarding) {
      args.push("-A");
    }
    // Prefer publickey/agent; password still available interactively when not BatchMode.
    args.push("-o", "PreferredAuthentications=publickey,keyboard-interactive,password");
  }

  if (options.agentForwarding && gssapi) {
    args.push("-A");
  } else if (gssapi) {
    args.push("-a");
  }

  if (port !== 22) {
    args.push("-p", String(port));
  }

  const target = username ? `${username}@${hostname}` : hostname;
  // "--" ends option parsing so the target can never be read as a flag.
  args.push("--", target);
  return args;
}

function createStartGssapiSessionApi(ctx) {
  const {
    sessions,
    openTerminalOutputSession,
    createPtyOutputBuffer,
    sessionLogStreamManager,
    trackSessionIdlePrompt,
  } = ctx;

  /**
   * Start an interactive SSH session via system OpenSSH (GSSAPI and/or PQ KEX).
   * @returns {Promise<string>} sessionId
   */
  async function startSystemOpenSshSession(event, options = {}) {
    const gssapi = options.authMethod === "gssapi";
    const hasJumpHosts = Array.isArray(options.jumpHosts) && options.jumpHosts.length > 0;
    const hasRelayProxy = options.proxy && options.proxy.type !== "command";
    if (hasJumpHosts && options.jumpHosts.some((hop) => hop?.proxy)) {
      throw new Error(
        "System OpenSSH transport does not support per-jump-host proxies. "
        + "Remove the proxy from the jump hop or use the built-in ssh2 transport.",
      );
    }
    if (hasJumpHosts && hasRelayProxy) {
      throw new Error(
        "System OpenSSH transport does not support combining jump hosts with an "
        + "HTTP/SOCKS proxy. Use the built-in ssh2 transport for this host.",
      );
    }

    const sshExe = resolveSshExecutable({
      findExecutable,
      fileExists,
      platform: process.platform,
    });
    if (!sshExe) {
      throw new Error(
        "System OpenSSH (ssh) was not found. Install OpenSSH client to use GSSAPI or post-quantum KEX.",
      );
    }

    const sessionId = options.sessionId || randomUUID();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    // HTTP/SOCKS proxies: OpenSSH cannot speak them natively, so relay via a
    // loopback listener that dials through the app's proxy stack. HostKeyAlias
    // keeps known_hosts keyed to the real destination.
    let proxyRelay = null;
    let effectiveOptions = options;
    if (hasRelayProxy) {
      proxyRelay = await createLoopbackProxyRelay(
        options.proxy,
        String(options.hostname || "").trim(),
        Number(options.port) > 0 ? Math.trunc(Number(options.port)) : 22,
      );
      effectiveOptions = {
        ...options,
        proxy: undefined,
        hostname: "127.0.0.1",
        port: proxyRelay.port,
        hostKeyAlias: String(options.hostname || "").trim(),
      };
    }

    let sshArgs;
    try {
      sshArgs = buildSystemOpenSshArgs(effectiveOptions);
    } catch (err) {
      proxyRelay?.close();
      throw err;
    }

    const { buildTerminalProcessEnv } = require("../httpNetworkProxyBridge.cjs");
    const env = {
      ...buildTerminalProcessEnv(process.env),
      ...(options.env || {}),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };
    // Avoid leaking bare LC_* values into SendEnv LC_* on remote shells.
    for (const key of Object.keys(env)) {
      if (key.startsWith("LC_")) delete env[key];
    }
    if (process.env.SSH_AUTH_SOCK) {
      env.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;
    }
    if (process.env.KRB5CCNAME) {
      env.KRB5CCNAME = process.env.KRB5CCNAME;
    }

    let proc;
    try {
      proc = pty.spawn(sshExe, sshArgs, {
        name: env.TERM || "xterm-256color",
        cols,
        rows,
        env,
        cwd: os.homedir(),
        encoding: null,
      });
    } catch (err) {
      proxyRelay?.close();
      const message = err?.message || String(err);
      throw new Error(`Failed to start system OpenSSH: ${message}`);
    }

    const session = {
      proc,
      pty: proc,
      type: gssapi ? "gssapi-ssh" : "system-openssh",
      protocol: "ssh",
      authMethod: gssapi ? "gssapi" : (options.authMethod || "publickey"),
      preferPostQuantumKex: Boolean(options.preferPostQuantumKex),
      webContentsId: event.sender.id,
      hostname: options.hostname || "",
      username: options.username || "",
      label: options.hostLabel || options.label || options.hostname
        || (gssapi ? "SSH (GSSAPI)" : "SSH (system OpenSSH)"),
      shellExecutable: sshExe,
      shellKind: undefined,
      flushPendingData: null,
      lastIdlePrompt: "",
      lastIdlePromptAt: 0,
      _promptTrackTail: "",
      cols,
      rows,
      _reuseEndpoint: {
        hostname: options.hostname || "",
        port: options.port || 22,
        username: options.username || "",
      },
    };
    sessions.set(sessionId, session);
    if (typeof openTerminalOutputSession === "function") {
      openTerminalOutputSession(sessionId, event.sender);
    }

    let logStreamToken = null;
    if (options.sessionLog?.enabled && options.sessionLog?.directory && sessionLogStreamManager) {
      logStreamToken = sessionLogStreamManager.startStream(sessionId, {
        hostLabel: options.hostLabel || options.hostname || "",
        hostname: options.hostname || "",
        directory: options.sessionLog.directory,
        format: options.sessionLog.format || "txt",
        timestampsEnabled: Boolean(options.sessionLog.timestampsEnabled),
        startTime: Date.now(),
      });
    }
    session._logStreamToken = logStreamToken;

    const createBuffer = createPtyOutputBuffer || (() => ({
      bufferData: (data) => {
        emitTerminalSessionData(event.sender, sessionId, data, {
          cols: session.cols,
          rows: session.rows,
        });
      },
      flushPaced: () => {},
      takePendingEntry: () => null,
      discard: () => {},
    }));

    const {
      bufferData,
      flushPaced,
      takePendingEntry,
      discard,
    } = createBuffer((data, meta) => {
      const current = sessions.get(sessionId);
      emitTerminalSessionData(event.sender, sessionId, data, {
        cols: current?.cols,
        rows: current?.rows,
        meta,
      });
    }, {
      onPendingBytesChange: (bytes) => {
        if (sessions.get(sessionId) === session) setBufferedOutputBytes(session, bytes);
      },
      shouldAcceptOutput: () => shouldAcceptSessionOutput(sessions.get(sessionId)),
    });
    session.flushPendingData = flushPaced;
    session.takePendingData = takePendingEntry;
    session.discardPendingData = discard;

    proc.onData((data) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const text = buf.toString("utf8");
      if (typeof trackSessionIdlePrompt === "function") {
        trackSessionIdlePrompt(session, text);
      }
      bufferData(text);
      if (logStreamToken && sessionLogStreamManager) {
        sessionLogStreamManager.appendData(sessionId, text);
      }
    });

    proc.onExit((evt) => {
      proxyRelay?.close();
      try {
        if (logStreamToken && sessionLogStreamManager) {
          sessionLogStreamManager.stopStream(sessionId, logStreamToken);
        }
      } catch { /* ignore */ }
      const current = sessions.get(sessionId);
      if (current === session) {
        sessions.delete(sessionId);
      }
      try {
        const contents = event.sender;
        if (contents && !contents.isDestroyed?.()) {
          contents.send("magiesTerminal:exit", {
            sessionId,
            exitCode: evt?.exitCode,
            signal: evt?.signal,
          });
        }
      } catch { /* ignore */ }
    });

    return sessionId;
  }

  // Back-compat alias
  const startGssapiSshSession = startSystemOpenSshSession;

  return {
    startGssapiSshSession,
    startSystemOpenSshSession,
    buildGssapiSshArgs,
    buildSystemOpenSshArgs,
    resolveSshExecutableForGssapi: () => resolveSshExecutable({
      findExecutable,
      fileExists,
      platform: process.platform,
    }),
  };
}

module.exports = {
  createStartGssapiSessionApi,
  buildGssapiSshArgs,
  buildSystemOpenSshArgs,
  formatProxyJumpArg,
  createLoopbackProxyRelay,
  PQ_KEX_ALGORITHMS,
};
