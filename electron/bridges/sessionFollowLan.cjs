"use strict";

/**
 * LAN follow invite: short-lived TCP NDJSON relay for multi-machine watch/control.
 * Opt-in only; token-gated; reuses sessionFollowManager for single-controller lock.
 * Protocol: newline-delimited JSON over TCP (no extra npm deps).
 */

const net = require("node:net");
const os = require("node:os");
const crypto = require("node:crypto");
const follow = require("./sessionFollowManager.cjs");
const { addTerminalDataTap } = require("./emitTerminalSessionData.cjs");

const invites = new Map(); // sessionId -> invite runtime
const remoteSockets = new Map(); // peerId -> { socket, sessionId }
let dataTapInstalled = false;
let writeToSessionNow = null;
let addDataTap = addTerminalDataTap;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 30 * 60 * 1000;

// Abuse limits for the token-gated relay. An unauthenticated peer must not be
// able to exhaust host memory before proving the token, so cap the pre-newline
// buffer, the time allowed to authenticate, the number of concurrent sockets,
// and how far a slow reader may fall behind before it is dropped.
const DEFAULT_LIMITS = {
  maxLineBytes: 64 * 1024,
  authTimeoutMs: 10_000,
  maxPeers: 8,
  maxSocketBacklogBytes: 8 * 1024 * 1024,
};
let limits = { ...DEFAULT_LIMITS };

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

function formatCode(token) {
  let n = 0;
  for (let i = 0; i < token.length; i += 1) n = (n * 33 + token.charCodeAt(i)) >>> 0;
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += CODE_ALPHABET[n % CODE_ALPHABET.length];
    n = (Math.floor(n / CODE_ALPHABET.length) ^ (i + 1) * 2654435761) >>> 0;
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function listLanIps() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const entries of Object.values(nets || {})) {
    if (!entries) continue;
    for (const entry of entries) {
      const family = entry.family;
      const isV4 = family === "IPv4" || family === 4;
      if (!isV4 || entry.internal || !entry.address) continue;
      out.push(entry.address);
    }
  }
  return out;
}

function isExpired(expiresAt, now = Date.now()) {
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

function encodeShare(payload) {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `magies-follow:${payload.v}:${b64}`;
}

function decodeShare(value) {
  const raw = String(value || "").trim();
  const match = /^magies-follow:(\d+):([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match) return { ok: false, error: "format" };
  try {
    const parsed = JSON.parse(Buffer.from(match[2], "base64url").toString("utf8"));
    if (Number(parsed.v) !== 1) return { ok: false, error: "version" };
    if (!parsed.host || !parsed.token || !parsed.sessionId) return { ok: false, error: "payload" };
    if (!Number.isFinite(Number(parsed.port))) return { ok: false, error: "port" };
    return {
      ok: true,
      payload: {
        v: 1,
        host: String(parsed.host).trim(),
        port: Math.trunc(Number(parsed.port)),
        token: String(parsed.token),
        sessionId: String(parsed.sessionId),
        hostLabel: parsed.hostLabel ? String(parsed.hostLabel) : undefined,
        expiresAt: Number(parsed.expiresAt),
      },
    };
  } catch {
    return { ok: false, error: "decode" };
  }
}

function sendJson(socket, obj) {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(`${JSON.stringify(obj)}\n`);
  } catch {
    // ignore
  }
}

function ensureDataTap() {
  if (dataTapInstalled) return;
  dataTapInstalled = true;
  addDataTap((sessionId, data) => {
    const invite = invites.get(sessionId);
    if (!invite || !invite.peerIds.size) return;
    const msg = `${JSON.stringify({ type: "data", data })}\n`;
    for (const peerId of [...invite.peerIds]) {
      const entry = remoteSockets.get(peerId);
      if (!entry?.socket || entry.socket.destroyed) continue;
      // Drop peers that cannot keep up rather than letting the host's outbound
      // buffer grow without bound (terminal output can burst faster than a slow
      // LAN reader drains it).
      if (entry.socket.writableLength > limits.maxSocketBacklogBytes) {
        detachPeer(peerId);
        continue;
      }
      try {
        entry.socket.write(msg);
      } catch {
        // ignore
      }
    }
  });
}

function broadcastState(sessionId) {
  const invite = invites.get(sessionId);
  if (!invite) return;
  const state = follow.getState(sessionId);
  for (const peerId of invite.peerIds) {
    const entry = remoteSockets.get(peerId);
    if (entry?.socket) sendJson(entry.socket, { type: "state", state });
  }
}

function detachPeer(peerId) {
  const entry = remoteSockets.get(peerId);
  if (!entry) return;
  remoteSockets.delete(peerId);
  const invite = invites.get(entry.sessionId);
  if (invite) invite.peerIds.delete(peerId);
  follow.leaveFollowByPeerId(entry.sessionId, peerId);
  try {
    entry.socket.destroy();
  } catch {
    // ignore
  }
}

function handleClientMessage(sessionId, peerId, msg, socket) {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "input" && typeof msg.data === "string") {
    const gate = follow.shouldBlockWriteByPeerId(sessionId, peerId);
    if (gate.blocked) {
      sendJson(socket, { type: "inputDenied", reason: gate.reason || "not_controller" });
      return;
    }
    if (typeof writeToSessionNow === "function") {
      try {
        writeToSessionNow({ sessionId, automated: false }, msg.data);
      } catch (err) {
        sendJson(socket, { type: "error", error: err?.message || "write_failed" });
      }
    }
    return;
  }

  if (msg.type === "requestControl") {
    const result = follow.requestControlByPeerId(sessionId, peerId);
    sendJson(socket, { type: "state", state: result.state || follow.getState(sessionId) });
    broadcastState(sessionId);
    return;
  }

  if (msg.type === "ping") {
    sendJson(socket, { type: "pong", ts: Date.now() });
  }
}

function attachClient(socket, invite) {
  let buffer = "";
  let peerId = null;
  let authed = false;

  // Force a decision within the auth window; an idle unauthenticated socket
  // must not hold a connection slot indefinitely.
  const authTimer = setTimeout(() => {
    if (!authed) {
      try {
        sendJson(socket, { type: "error", error: "auth_timeout" });
      } catch {
        // ignore
      }
      socket.destroy();
    }
  }, limits.authTimeoutMs);
  if (typeof authTimer.unref === "function") authTimer.unref();
  socket.once("close", () => clearTimeout(authTimer));

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    // Cap the un-delimited buffer. A peer that never sends a newline (before or
    // after auth) cannot grow host memory past one frame.
    if (buffer.length > limits.maxLineBytes && buffer.indexOf("\n") < 0) {
      sendJson(socket, { type: "error", error: "frame_too_large" });
      socket.destroy();
      return;
    }
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        sendJson(socket, { type: "error", error: "bad_json" });
        continue;
      }

      if (!authed) {
        if (msg.type !== "hello" || msg.token !== invite.token) {
          sendJson(socket, { type: "error", error: "unauthorized" });
          socket.destroy();
          return;
        }
        if (isExpired(invite.expiresAt)) {
          sendJson(socket, { type: "error", error: "expired" });
          socket.destroy();
          return;
        }
        if (invite.peerIds.size >= limits.maxPeers) {
          sendJson(socket, { type: "error", error: "too_many_peers" });
          socket.destroy();
          return;
        }
        clearTimeout(authTimer);
        peerId = `lan-${crypto.randomBytes(6).toString("hex")}`;
        const joined = follow.joinFollowRemote(
          invite.sessionId,
          peerId,
          typeof msg.displayName === "string" ? msg.displayName : "LAN viewer",
        );
        if (!joined.success) {
          sendJson(socket, { type: "error", error: joined.error || "join_failed" });
          socket.destroy();
          return;
        }
        authed = true;
        remoteSockets.set(peerId, { socket, sessionId: invite.sessionId });
        invite.peerIds.add(peerId);
        sendJson(socket, {
          type: "welcome",
          peerId,
          sessionId: invite.sessionId,
          hostLabel: invite.hostLabel,
          state: joined.state,
        });
        broadcastState(invite.sessionId);
        continue;
      }

      handleClientMessage(invite.sessionId, peerId, msg, socket);
    }
  });

  socket.on("close", () => {
    if (peerId) detachPeer(peerId);
  });
  socket.on("error", () => {
    if (peerId) detachPeer(peerId);
  });
}

function createInvite({ sessionId, hostLabel, webContentsId, displayName }) {
  if (!sessionId) return Promise.resolve({ success: false, error: "session_required" });

  let state = follow.getState(sessionId);
  if (!state) {
    if (!Number.isFinite(webContentsId)) {
      return Promise.resolve({ success: false, error: "follow_not_started" });
    }
    const started = follow.startFollow(sessionId, webContentsId, displayName || "Host");
    if (!started.success) return Promise.resolve(started);
    state = started.state;
  }

  stopInvite(sessionId);
  ensureDataTap();

  const token = generateToken();
  const lanIps = listLanIps();
  const preferHost = lanIps[0] || "127.0.0.1";

  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      const invite = invites.get(sessionId);
      if (!invite) {
        socket.destroy();
        return;
      }
      if (isExpired(invite.expiresAt)) {
        sendJson(socket, { type: "error", error: "expired" });
        socket.destroy();
        return;
      }
      // Bound concurrent sockets (authed peers + in-flight handshakes) so a
      // flood of half-open connections cannot pin memory. Allow a small margin
      // over maxPeers for handshakes in progress.
      if (invite.liveSockets >= limits.maxPeers * 2) {
        sendJson(socket, { type: "error", error: "too_many_connections" });
        socket.destroy();
        return;
      }
      invite.liveSockets += 1;
      socket.once("close", () => {
        invite.liveSockets = Math.max(0, invite.liveSockets - 1);
      });
      attachClient(socket, invite);
    });

    server.on("error", (err) => {
      resolve({ success: false, error: err?.message || "listen_failed" });
    });

    server.listen(0, "0.0.0.0", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const expiresAt = Date.now() + INVITE_TTL_MS;
      const payload = {
        v: 1,
        host: preferHost,
        port,
        token,
        sessionId,
        hostLabel: hostLabel || undefined,
        expiresAt,
      };
      const invite = {
        sessionId,
        token,
        hostLabel,
        expiresAt,
        port,
        hosts: lanIps.length ? lanIps : ["127.0.0.1"],
        server,
        peerIds: new Set(),
        liveSockets: 0,
        payload,
      };
      invites.set(sessionId, invite);

      resolve({
        success: true,
        invite: {
          sessionId,
          port,
          hosts: invite.hosts,
          token,
          code: formatCode(token),
          shareString: encodeShare(payload),
          expiresAt,
          hostLabel,
        },
        state: follow.getState(sessionId),
      });
    });
  });
}

function stopInvite(sessionId) {
  const invite = invites.get(sessionId);
  if (!invite) return { success: true };
  for (const peerId of [...invite.peerIds]) {
    detachPeer(peerId);
  }
  try {
    invite.server.close();
  } catch {
    // ignore
  }
  invites.delete(sessionId);
  return { success: true };
}

function getInvite(sessionId) {
  const invite = invites.get(sessionId);
  if (!invite) return null;
  if (isExpired(invite.expiresAt)) {
    stopInvite(sessionId);
    return null;
  }
  return {
    sessionId,
    port: invite.port,
    hosts: invite.hosts,
    token: invite.token,
    code: formatCode(invite.token),
    shareString: encodeShare(invite.payload),
    expiresAt: invite.expiresAt,
    hostLabel: invite.hostLabel,
    peerCount: invite.peerIds.size,
  };
}

function stopAll() {
  for (const sessionId of [...invites.keys()]) stopInvite(sessionId);
}

function configure({ writeToSessionNow: writer, addDataTap: tapInstaller, limits: limitOverrides } = {}) {
  if (typeof writer === "function") writeToSessionNow = writer;
  // Worker mode taps terminal output via terminalWorkerManager instead of the
  // in-process emitter; the tap is installed lazily so a late configure wins.
  if (typeof tapInstaller === "function" && !dataTapInstalled) {
    addDataTap = tapInstaller;
  }
  if (limitOverrides && typeof limitOverrides === "object") {
    limits = { ...limits, ...limitOverrides };
  }
}

follow.onStateChange((sessionId) => {
  if (invites.has(sessionId)) broadcastState(sessionId);
});

/** Active outbound LAN client joins (this machine is the viewer). */
const outboundClients = new Map(); // clientId -> { socket, webContentsId, sessionId, peerId }

function connectAsViewer({ shareString, displayName, webContentsId, electronModule }) {
  const decoded = decodeShare(shareString);
  if (!decoded.ok) return Promise.resolve({ success: false, error: decoded.error || "invalid_invite" });
  const payload = decoded.payload;
  if (isExpired(payload.expiresAt)) {
    return Promise.resolve({ success: false, error: "expired" });
  }

  const clientId = `out-${crypto.randomBytes(4).toString("hex")}`;

  return new Promise((resolve) => {
    const socket = net.connect({ host: payload.host, port: payload.port }, () => {
      sendJson(socket, {
        type: "hello",
        token: payload.token,
        displayName: displayName || "LAN viewer",
      });
    });

    let buffer = "";
    let settled = false;
    const entry = {
      socket,
      webContentsId,
      sessionId: payload.sessionId,
      peerId: null,
      hostLabel: payload.hostLabel,
    };
    outboundClients.set(clientId, entry);

    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      outboundClients.delete(clientId);
      resolve({ success: false, error });
    };

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      // Guard against a malicious host streaming an unbounded line at the
      // viewer. Data frames are chunked well under this ceiling.
      if (buffer.length > limits.maxSocketBacklogBytes && buffer.indexOf("\n") < 0) {
        fail("frame_too_large");
        return;
      }
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.type === "error") {
          fail(msg.error || "remote_error");
          return;
        }
        if (msg.type === "welcome" && !settled) {
          settled = true;
          entry.peerId = msg.peerId;
          resolve({
            success: true,
            clientId,
            peerId: msg.peerId,
            sessionId: msg.sessionId || payload.sessionId,
            hostLabel: msg.hostLabel || payload.hostLabel,
            state: msg.state,
          });
        }
        // Fan to renderer
        try {
          const wc = electronModule?.webContents?.fromId?.(webContentsId);
          if (wc && !wc.isDestroyed?.()) {
            wc.send("magiesTerminal:follow:lanClientEvent", { clientId, message: msg });
          }
        } catch {
          // ignore
        }
      }
    });
    socket.on("error", (err) => fail(err?.message || "connect_failed"));
    socket.on("close", () => {
      outboundClients.delete(clientId);
      try {
        const wc = electronModule?.webContents?.fromId?.(webContentsId);
        if (wc && !wc.isDestroyed?.()) {
          wc.send("magiesTerminal:follow:lanClientEvent", {
            clientId,
            message: { type: "closed" },
          });
        }
      } catch {
        // ignore
      }
      if (!settled) fail("closed");
    });
  });
}

function sendViewerInput(clientId, data) {
  const entry = outboundClients.get(clientId);
  if (!entry?.socket || entry.socket.destroyed) return { success: false, error: "not_connected" };
  sendJson(entry.socket, { type: "input", data: String(data ?? "") });
  return { success: true };
}

function sendViewerRequestControl(clientId) {
  const entry = outboundClients.get(clientId);
  if (!entry?.socket || entry.socket.destroyed) return { success: false, error: "not_connected" };
  sendJson(entry.socket, { type: "requestControl" });
  return { success: true };
}

function disconnectViewer(clientId) {
  const entry = outboundClients.get(clientId);
  if (!entry) return { success: true };
  try { entry.socket.destroy(); } catch { /* ignore */ }
  outboundClients.delete(clientId);
  return { success: true };
}

module.exports = {
  createInvite,
  stopInvite,
  getInvite,
  stopAll,
  configure,
  decodeShare,
  encodeShare,
  formatCode,
  listLanIps,
  connectAsViewer,
  sendViewerInput,
  sendViewerRequestControl,
  disconnectViewer,
};
