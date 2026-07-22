// Connection Diagnostics Bridge — powers the "Test Connection" feature.
// Probes DNS → TCP → jump chain → host key → auth → SFTP for a host config
// without opening a shell or registering a terminal session. Step sequencing
// lives in connectionDiagnostics/runDiagnostics.cjs; this file wires the real
// network/ssh2 probes and the IPC surface.

const dns = require("node:dns");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { randomUUID } = require("node:crypto");
const { Client: SSHClient } = require("ssh2");

const { runDiagnosticsWithDeps } = require("./connectionDiagnostics/runDiagnostics.cjs");
const hostKeyVerifier = require("./hostKeyVerifier.cjs");
const { classifyProxyTestError, createProxySocket } = require("./proxyUtils.cjs");
const {
  expandIdentityFilePath,
  findAllDefaultPrivateKeys,
  getAvailableAgentSocket,
  isAutoFillablePasswordChallenge,
  isKeyEncrypted,
  isPasswordProvided,
  looksLikePrivateKey,
  readFileNoFollow,
} = require("./sshAuthHelper.cjs");
const { createSystemKnownHostsApi } = require("./sshBridge/systemKnownHosts.cjs");

const { isHostKeyTrustedBySystem } = createSystemKnownHostsApi({
  fs, path, os, crypto, log: () => {},
});

const DIAG_TCP_TIMEOUT_MS = 20000;
/** Shorter than a diagnostics run: this is an interactive button. */
const PROXY_TEST_TIMEOUT_MS = 12000;
const DIAG_READY_TIMEOUT_MS = 45000;
const DIAG_SFTP_TIMEOUT_MS = 15000;

// runId -> Set of cleanup callbacks, so a closed dialog can abort the probe.
const activeRuns = new Map();

const trackCleanup = (runId, cleanup) => {
  if (!activeRuns.has(runId)) activeRuns.set(runId, new Set());
  activeRuns.get(runId).add(cleanup);
  return () => activeRuns.get(runId)?.delete(cleanup);
};

const cancelRun = (runId) => {
  const cleanups = activeRuns.get(runId);
  if (!cleanups) return { cancelled: false };
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch {
      // Best-effort teardown.
    }
  }
  activeRuns.delete(runId);
  return { cancelled: true };
};

const probeTcp = (runId) => (host, port, timeoutMs) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const socket = net.connect({ host, port });
  const untrack = trackCleanup(runId, () => socket.destroy());
  const timeoutId = setTimeout(() => {
    socket.destroy();
    untrack();
    reject(new Error(`connect ETIMEDOUT ${host}:${port}`));
  }, timeoutMs || DIAG_TCP_TIMEOUT_MS);
  socket.once("connect", () => {
    clearTimeout(timeoutId);
    const ms = Date.now() - startedAt;
    socket.destroy();
    untrack();
    resolve(ms);
  });
  socket.once("error", (err) => {
    clearTimeout(timeoutId);
    untrack();
    reject(err);
  });
});

// Load the first usable inline/identity-file key. Encrypted keys without a
// saved passphrase are skipped (diagnostics never prompts) but reported.
const loadProbeKey = async (options) => {
  if (typeof options.privateKey === "string" && options.privateKey.trim()) {
    return {
      privateKey: options.privateKey,
      passphrase: options.passphrase,
      encryptedKeySkipped: false,
      hasConfiguredKey: true,
    };
  }
  let encryptedKeySkipped = false;
  const identityFilePaths = options.identityFilePaths || [];
  for (const keyPath of identityFilePaths) {
    try {
      // readFileNoFollow is async. Without the await, `content` was a Promise:
      // looksLikePrivateKey rejected it and every identity-file key was
      // silently skipped, so the probe had nothing to offer.
      const content = await readFileNoFollow(expandIdentityFilePath(keyPath), "utf8");
      if (!looksLikePrivateKey(content)) continue;
      if (isKeyEncrypted(content) && !options.passphrase) {
        encryptedKeySkipped = true;
        continue;
      }
      return {
        privateKey: content,
        passphrase: options.passphrase,
        encryptedKeySkipped,
        hasConfiguredKey: true,
      };
    } catch {
      continue;
    }
  }
  return {
    privateKey: undefined,
    passphrase: undefined,
    encryptedKeySkipped,
    hasConfiguredKey: identityFilePaths.length > 0,
  };
};

const connectTargetProbe = (runId, buildAlgorithms) => async ({
  options,
  sock,
  onHostKey,
  onAuthAttempt,
}) => {
  const port = options.port || 22;
  const connectOpts = {
    username: options.username || "root",
    timeout: DIAG_TCP_TIMEOUT_MS,
    readyTimeout: DIAG_READY_TIMEOUT_MS,
    // Enabled below when a saved password is available so PAM-style hosts
    // that only advertise keyboard-interactive (not "password") can auth.
    tryKeyboard: false,
    algorithms: buildAlgorithms(options.legacyAlgorithms, {
      skipEcdsaHostKey: options.skipEcdsaHostKey,
      algorithmOverrides: options.algorithmOverrides,
    }),
  };
  if (sock) {
    connectOpts.sock = sock;
  } else if (options.proxy) {
    connectOpts.sock = await createProxySocket(options.proxy, options.hostname, port, {
      timeoutMs: DIAG_TCP_TIMEOUT_MS,
    });
  } else {
    connectOpts.host = options.hostname;
    connectOpts.port = port;
  }

  // Host-key decision is resolved before auth methods run. Never send password
  // material to an untrusted or changed key (audit H2).
  let hostKeyStatus = "unknown";
  let hostKeyRejected = false;
  connectOpts.hostVerifier = (rawKey, callback) => {
    const keyInfo = hostKeyVerifier.describeHostKey(rawKey);
    const decision = hostKeyVerifier.classifyHostKey({
      knownHosts: options.knownHosts || [],
      hostname: options.hostname,
      port,
      keyType: keyInfo.keyType,
      fingerprint: keyInfo.fingerprint,
    });
    let status = decision.status;
    if (status === "unknown" && isHostKeyTrustedBySystem({
      hostname: options.hostname,
      port,
      fingerprint: keyInfo.fingerprint,
    })) {
      status = "trusted-system";
    }
    hostKeyStatus = status;
    try {
      onHostKey({ status, keyType: keyInfo.keyType, fingerprint: keyInfo.fingerprint });
    } catch {
      // Reporting must not break the probe.
    }
    // Only trusted keys may proceed to authentication. Unknown/changed keys
    // fail closed so saved passwords are never offered to a MITM.
    const trusted = status === "trusted" || status === "trusted-system";
    if (!trusted) {
      hostKeyRejected = true;
      callback(false);
      return;
    }
    callback(true);
  };

  const keyProbe = await loadProbeKey(options);
  const agentSocket = await getAvailableAgentSocket();
  const hasPassword = isPasswordProvided(options.password);
  const defaultKeys = keyProbe.hasConfiguredKey ? [] : await findAllDefaultPrivateKeys();
  const usableDefaultKeys = defaultKeys.filter((keyInfo) => !isKeyEncrypted(keyInfo.privateKey));

  const methods = [];
  if (keyProbe.privateKey) {
    methods.push({
      type: "publickey",
      key: keyProbe.privateKey,
      passphrase: keyProbe.passphrase,
      id: "publickey-user",
      label: "configured key",
    });
  }
  if (agentSocket) {
    connectOpts.agent = agentSocket;
    methods.push({ type: "agent", id: "agent", label: "SSH agent" });
  }
  // Password material is attached only after hostVerifier accepts a trusted
  // key. We still register methods here; ssh2 invokes hostVerifier before the
  // authHandler, so a rejected key never reaches password/kbd-int offers.
  if (hasPassword) {
    // Many PAM-backed servers only advertise keyboard-interactive for the
    // password challenge (see #969 / moshStatsConnection). Offer both.
    methods.push({ type: "password", id: "password", label: "password" });
    methods.push({
      type: "keyboard-interactive",
      id: "keyboard-interactive",
      label: "keyboard-interactive",
    });
    connectOpts.tryKeyboard = true;
    connectOpts.password = options.password;
  }
  for (const keyInfo of usableDefaultKeys) {
    methods.push({
      type: "publickey",
      key: keyInfo.privateKey,
      id: `publickey-default-${keyInfo.keyName}`,
      label: `key ${keyInfo.keyName}`,
    });
  }

  if (methods.length === 0) {
    return {
      ok: false,
      error: keyProbe.encryptedKeySkipped
        ? "Configured private key is encrypted and no passphrase is saved"
        : "No usable authentication credentials available for probe",
      methodsTried: [],
      needsInteractive: false,
      encryptedKeySkipped: keyProbe.encryptedKeySkipped,
    };
  }

  return await new Promise((resolve) => {
    const conn = new SSHClient();
    const untrack = trackCleanup(runId, () => conn.end());
    const tried = [];
    let lastTried = null;
    let needsInteractive = false;
    let sawPartialSuccess = false;
    let settled = false;
    let methodIndex = 0;

    connectOpts.authHandler = (methodsLeft, partialSuccess, callback) => {
      if (hostKeyRejected) {
        return callback(false);
      }
      if (methodsLeft === null && lastTried === null) {
        lastTried = "none";
        return callback("none");
      }
      if (partialSuccess) {
        // First factor accepted but the server wants another (MFA). The
        // diagnostics probe is non-interactive, so report instead of prompt.
        sawPartialSuccess = true;
        needsInteractive = true;
        return callback(false);
      }
      const available = methodsLeft || ["publickey", "password", "keyboard-interactive"];
      while (methodIndex < methods.length) {
        const method = methods[methodIndex];
        methodIndex += 1;
        const wireName = method.type === "agent" ? "publickey" : method.type;
        if (!available.includes(wireName)) continue;
        // Never offer password or keyboard-interactive until the host key is
        // known-good. Publickey/agent are also withheld on untrusted keys.
        if (hostKeyStatus !== "trusted" && hostKeyStatus !== "trusted-system") {
          hostKeyRejected = true;
          return callback(false);
        }
        tried.push(method.id);
        lastTried = method.id;
        try {
          onAuthAttempt?.(method.label);
        } catch {
          // Reporting must not break the probe.
        }
        if (method.type === "agent") return callback("agent");
        if (method.type === "password") {
          return callback({
            type: "password",
            username: connectOpts.username,
            password: options.password,
          });
        }
        if (method.type === "keyboard-interactive") {
          // String form lets ssh2 fire the keyboard-interactive event, which
          // we answer non-interactively with the saved password when possible.
          return callback("keyboard-interactive");
        }
        return callback({
          type: "publickey",
          username: connectOpts.username,
          key: method.key,
          passphrase: method.passphrase,
        });
      }
      if (available.includes("keyboard-interactive") && !hasPassword) {
        needsInteractive = true;
      }
      return callback(false);
    };

    // Non-interactive keyboard-interactive: auto-fill a single password
    // prompt; finish empty on MFA/OTP so the probe fails cleanly (no modal).
    if (connectOpts.tryKeyboard && hasPassword) {
      let autoFilledOnce = false;
      conn.on("keyboard-interactive", (_name, _instr, _lang, prompts, finishKbd) => {
        if (!autoFilledOnce && isAutoFillablePasswordChallenge(prompts, options.password)) {
          autoFilledOnce = true;
          finishKbd([options.password]);
          return;
        }
        // Multi-prompt / OTP / second attempt: mark interactive and bail.
        needsInteractive = true;
        finishKbd([]);
      });
    }

    conn.on("ready", () => {
      if (settled) return;
      settled = true;
      resolve({ ok: true, method: lastTried || "none", methodsTried: tried, conn });
    });
    conn.on("error", (err) => {
      if (settled) return;
      settled = true;
      untrack();
      resolve({
        ok: false,
        error: hostKeyRejected
          ? `Host key ${hostKeyStatus}; authentication aborted`
          : (err?.message || String(err)),
        methodsTried: tried,
        needsInteractive,
        sawPartialSuccess,
        encryptedKeySkipped: keyProbe.encryptedKeySkipped,
        hostKeyStatus,
        hostKeyRejected,
      });
    });
    try {
      conn.connect(connectOpts);
    } catch (err) {
      if (settled) return;
      settled = true;
      untrack();
      resolve({
        ok: false,
        error: err?.message || String(err),
        methodsTried: tried,
        needsInteractive,
        encryptedKeySkipped: keyProbe.encryptedKeySkipped,
        hostKeyStatus,
        hostKeyRejected,
      });
    }
  });
};

const probeSftp = (conn) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(() => {
    reject(new Error("SFTP probe timed out"));
  }, DIAG_SFTP_TIMEOUT_MS);
  try {
    conn.sftp((err, sftp) => {
      clearTimeout(timeoutId);
      if (err) {
        reject(err);
        return;
      }
      try {
        sftp.end?.();
      } catch {
        // Channel teardown is best-effort.
      }
      resolve();
    });
  } catch (err) {
    clearTimeout(timeoutId);
    reject(err);
  }
});

async function runDiagnostics(event, options) {
  const runId = options?.runId || `diag-${randomUUID()}`;
  const sender = event.sender;
  // Lazy require to avoid a circular dependency at module load time
  // (sshBridge requires nothing from this module, but keep parity with how
  // other bridges defer cross-bridge lookups).
  const sshBridge = require("./sshBridge.cjs");

  const emitProgress = (entry) => {
    if (!sender.isDestroyed()) {
      sender.send("magiesTerminal:diagnostics:progress", { runId, ...entry });
    }
  };

  const deps = {
    isIp: (hostname) => net.isIP(hostname) !== 0,
    lookup: async (hostname) => {
      const { address } = await dns.promises.lookup(hostname);
      return address;
    },
    probeTcp: probeTcp(runId),
    connectChain: async (chainOptions, jumpHosts) => {
      return sshBridge.connectThroughChain(
        event,
        chainOptions,
        jumpHosts,
        chainOptions.hostname,
        chainOptions.port || 22,
        runId,
      );
    },
    connectTarget: connectTargetProbe(runId, sshBridge.buildAlgorithms),
    probeSftp,
    closeAll: ({ conn, connections }) => {
      try {
        conn?.end();
      } catch {
        // Best-effort teardown.
      }
      for (const chainConn of [...(connections || [])].reverse()) {
        try {
          chainConn.end();
        } catch {
          // Best-effort teardown.
        }
      }
    },
  };

  try {
    const { results } = await runDiagnosticsWithDeps(options, deps, emitProgress);
    return { runId, results };
  } finally {
    activeRuns.delete(runId);
  }
}

/**
 * Open and immediately drop a proxied connection to a host, so the proxy's
 * reachability and credentials can be checked without starting a session.
 * Only a coded reason travels back — see classifyProxyTestError.
 */
async function testProxy(_event, payload) {
  const proxy = payload?.proxy;
  const hostname = String(payload?.hostname || "").trim();
  const port = Number(payload?.port) || 22;
  if (!proxy?.type || !hostname) {
    return { success: false, error: "invalid" };
  }

  const startedAt = Date.now();
  let socket = null;
  try {
    socket = await createProxySocket(proxy, hostname, port, {
      timeoutMs: PROXY_TEST_TIMEOUT_MS,
    });
    return { success: true, elapsedMs: Date.now() - startedAt };
  } catch (err) {
    return { success: false, error: classifyProxyTestError(err) };
  } finally {
    try { socket?.destroy?.(); } catch { /* ignore */ }
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("magiesTerminal:diagnostics:run", (event, options) =>
    runDiagnostics(event, options || {}));
  ipcMain.handle("magiesTerminal:proxy:test", (event, payload) =>
    testProxy(event, payload || {}));
  ipcMain.handle("magiesTerminal:diagnostics:cancel", (_event, payload) =>
    cancelRun(payload?.runId));
}

module.exports = {
  registerHandlers,
  testProxy,
  // Shared with hostHealthBridge (same probing primitives, no shell opened).
  connectTargetProbe,
  probeTcpForRun: probeTcp,
  trackCleanup,
  cancelRun,
  _loadProbeKey: loadProbeKey,
  _cancelRun: cancelRun,
};
