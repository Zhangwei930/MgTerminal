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
 * Build argv for system OpenSSH (GSSAPI and/or post-quantum KEX preference).
 */
function buildSystemOpenSshArgs(options = {}) {
  const hostname = String(options.hostname || "").trim();
  if (!hostname) {
    throw new Error("System OpenSSH requires a hostname.");
  }
  const username = String(options.username || "").trim();
  const port = Number(options.port) > 0 ? Math.trunc(Number(options.port)) : 22;
  const gssapi = options.authMethod === "gssapi";
  const preferPq = Boolean(options.preferPostQuantumKex);

  const args = ["-tt"];

  if (preferPq) {
    args.push("-o", `KexAlgorithms=${PQ_KEX_ALGORITHMS}`);
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
    const paths = Array.isArray(options.identityFilePaths)
      ? options.identityFilePaths.filter((p) => typeof p === "string" && p.trim())
      : [];
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
  args.push(target);
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
    if (Array.isArray(options.jumpHosts) && options.jumpHosts.length > 0) {
      throw new Error(
        gssapi
          ? "GSSAPI/Kerberos auth does not support jump hosts in MagiesTerminal yet. "
            + "Authenticate to the bastion with GSSAPI, or use another auth method for the chain."
          : "System OpenSSH transport does not support MagiesTerminal jump hosts yet. "
            + "Use built-in ssh2 transport or configure ProxyJump in system OpenSSH.",
      );
    }
    if (options.proxy) {
      throw new Error(
        "System OpenSSH transport does not support MagiesTerminal HTTP/SOCKS proxies. "
        + "Configure system OpenSSH ProxyCommand if needed.",
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
    const sshArgs = buildSystemOpenSshArgs(options);

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
  PQ_KEX_ALGORITHMS,
};
