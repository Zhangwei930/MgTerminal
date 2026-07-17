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
 * Build argv for system ssh GSSAPI login (no password prompts).
 */
function buildGssapiSshArgs(options = {}) {
  const hostname = String(options.hostname || "").trim();
  if (!hostname) {
    throw new Error("GSSAPI SSH requires a hostname.");
  }
  const username = String(options.username || "").trim();
  const port = Number(options.port) > 0 ? Math.trunc(Number(options.port)) : 22;

  const args = [
    "-tt",
    "-o", "GSSAPIAuthentication=yes",
    "-o", "PreferredAuthentications=gssapi-with-mic,gssapi-keyex",
    "-o", "PubkeyAuthentication=no",
    "-o", "PasswordAuthentication=no",
    "-o", "KbdInteractiveAuthentication=no",
    "-o", "NumberOfPasswordPrompts=0",
    "-o", "BatchMode=yes",
  ];

  if (options.agentForwarding) {
    args.push("-A");
  } else {
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
   * Start an interactive SSH session authenticated via Kerberos/GSSAPI
   * using the system OpenSSH client.
   * @returns {Promise<string>} sessionId
   */
  async function startGssapiSshSession(event, options = {}) {
    if (Array.isArray(options.jumpHosts) && options.jumpHosts.length > 0) {
      throw new Error(
        "GSSAPI/Kerberos auth does not support jump hosts in MagiesTerminal yet. "
        + "Authenticate to the bastion with GSSAPI, or use another auth method for the chain.",
      );
    }
    if (options.proxy) {
      throw new Error(
        "GSSAPI/Kerberos auth does not support MagiesTerminal HTTP/SOCKS proxies. "
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
        "System OpenSSH (ssh) was not found. Install OpenSSH client to use GSSAPI/Kerberos auth.",
      );
    }

    const sessionId = options.sessionId || randomUUID();
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const sshArgs = buildGssapiSshArgs(options);

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
      throw new Error(`Failed to start system OpenSSH for GSSAPI: ${message}`);
    }

    const session = {
      proc,
      pty: proc,
      type: "gssapi-ssh",
      protocol: "ssh",
      authMethod: "gssapi",
      webContentsId: event.sender.id,
      hostname: options.hostname || "",
      username: options.username || "",
      label: options.hostLabel || options.label || options.hostname || "SSH (GSSAPI)",
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

  return {
    startGssapiSshSession,
    buildGssapiSshArgs,
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
};
