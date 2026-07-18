"use strict";

/**
 * WAN follow: host and viewers connect outbound to a TCP NDJSON relay.
 * Reuses sessionFollowManager for control lock + audit; same frame types as LAN.
 */

const net = require("node:net");
const crypto = require("node:crypto");
const follow = require("./sessionFollowManager.cjs");
const { addTerminalDataTap } = require("./emitTerminalSessionData.cjs");
const { createFollowRelayServer } = require("./sessionFollowRelay.cjs");

const INVITE_TTL_MS = 30 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** sessionId -> host-side runtime */
const hostRuntimes = new Map();
/** local viewer client runtimes by session key */
const viewerClients = new Map();

let dataTapInstalled = false;
let writeToSessionNow = null;
let addDataTap = addTerminalDataTap;
/** @type {ReturnType<typeof createFollowRelayServer>|null} */
let localRelay = null;

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

function sendJson(socket, obj) {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(`${JSON.stringify(obj)}\n`);
  } catch {
    // ignore
  }
}

function encodeShare(payload) {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `magies-follow:2:${b64}`;
}

function decodeShare(value) {
  const raw = String(value || "").trim();
  const match = /^magies-follow:(\d+):([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match) return { ok: false, error: "format" };
  if (Number(match[1]) !== 2) return { ok: false, error: "version" };
  try {
    const parsed = JSON.parse(Buffer.from(match[2], "base64url").toString("utf8"));
    if (!parsed.relayHost || !parsed.token || !parsed.roomId || !parsed.sessionId) {
      return { ok: false, error: "payload" };
    }
    if (!Number.isFinite(Number(parsed.relayPort))) return { ok: false, error: "port" };
    return {
      ok: true,
      payload: {
        v: 2,
        relayHost: String(parsed.relayHost).trim(),
        relayPort: Math.trunc(Number(parsed.relayPort)),
        roomId: String(parsed.roomId),
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

function ensureDataTap() {
  if (dataTapInstalled) return;
  dataTapInstalled = true;
  addDataTap((sessionId, data) => {
    const runtime = hostRuntimes.get(sessionId);
    if (!runtime?.socket || runtime.socket.destroyed) return;
    sendJson(runtime.socket, { type: "data", data });
  });
}

function parseRelayEndpoint(relayUrlOrHost, relayPort) {
  // Accept "host:port", "ws://host:port", "wss://host:port", or host + port.
  if (typeof relayUrlOrHost === "string" && /:\/\//.test(relayUrlOrHost)) {
    try {
      const u = new URL(relayUrlOrHost.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:"));
      const port = Number(u.port) || (u.protocol === "https:" ? 443 : 80);
      return { host: u.hostname, port };
    } catch {
      return null;
    }
  }
  const host = String(relayUrlOrHost || "").trim();
  const port = Math.trunc(Number(relayPort));
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

function stopHost(sessionId) {
  const runtime = hostRuntimes.get(sessionId);
  if (!runtime) return;
  hostRuntimes.delete(sessionId);
  try { runtime.socket?.destroy(); } catch { /* ignore */ }
}

async function ensureLocalRelay() {
  if (localRelay) {
    const port = localRelay.getPort();
    if (port) return { host: "127.0.0.1", port };
  }
  localRelay = createFollowRelayServer({ host: "0.0.0.0", port: 0 });
  const { port } = await localRelay.start();
  return { host: "127.0.0.1", port };
}

async function startLocalRelay() {
  try {
    const endpoint = await ensureLocalRelay();
    return { success: true, ...endpoint };
  } catch (err) {
    return { success: false, error: err?.message || "relay_start_failed" };
  }
}

/**
 * Publish this session to a relay (or a locally spawned one).
 */
async function createWanInvite({
  sessionId,
  hostLabel,
  webContentsId,
  displayName,
  relayHost,
  relayPort,
  useLocalRelay,
}) {
  if (!sessionId) return { success: false, error: "session_required" };

  let state = follow.getState(sessionId);
  if (!state) {
    if (!Number.isFinite(webContentsId)) {
      return { success: false, error: "follow_not_started" };
    }
    const started = follow.startFollow(sessionId, webContentsId, displayName || "Host");
    if (!started.success) return started;
    state = started.state;
  }

  stopHost(sessionId);
  ensureDataTap();

  let endpoint;
  if (useLocalRelay || (!relayHost && !relayPort)) {
    endpoint = await ensureLocalRelay();
  } else {
    endpoint = parseRelayEndpoint(relayHost, relayPort);
  }
  if (!endpoint) return { success: false, error: "invalid_relay" };

  const token = generateToken();
  const roomId = `room-${crypto.randomBytes(8).toString("hex")}`;
  const expiresAt = Date.now() + INVITE_TTL_MS;

  const socket = net.connect({ host: endpoint.host, port: endpoint.port });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("relay_connect_timeout"));
      }, 10_000);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } catch (err) {
    try { socket.destroy(); } catch { /* ignore */ }
    return { success: false, error: err?.message || "relay_connect_failed" };
  }

  let buffer = "";
  const peerMap = new Map(); // remote peerId -> local peerId used in follow manager

  const runtime = {
    sessionId,
    socket,
    roomId,
    token,
    expiresAt,
    hostLabel: hostLabel || sessionId,
    endpoint,
    peerMap,
  };
  hostRuntimes.set(sessionId, runtime);

  sendJson(socket, {
    type: "relayJoin",
    role: "host",
    roomId,
    token,
    displayName: displayName || "Host",
  });

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      handleHostRelayMessage(sessionId, runtime, msg);
    }
  });
  socket.on("close", () => {
    if (hostRuntimes.get(sessionId) === runtime) hostRuntimes.delete(sessionId);
  });
  socket.on("error", () => {
    if (hostRuntimes.get(sessionId) === runtime) hostRuntimes.delete(sessionId);
  });

  // Push initial state once connected
  sendJson(socket, { type: "state", state: follow.getState(sessionId) });

  const payload = {
    v: 2,
    relayHost: endpoint.host === "0.0.0.0" ? "127.0.0.1" : endpoint.host,
    relayPort: endpoint.port,
    roomId,
    token,
    sessionId,
    hostLabel: hostLabel || sessionId,
    expiresAt,
  };

  return {
    success: true,
    invite: {
      ...payload,
      code: formatCode(token),
      shareString: encodeShare(payload),
      localRelay: Boolean(useLocalRelay || (!relayHost && !relayPort)),
    },
    state: follow.getState(sessionId),
  };
}

function handleHostRelayMessage(sessionId, runtime, msg) {
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "viewerJoined") {
    const peerId = String(msg.peerId || "");
    if (!peerId) return;
    const joined = follow.joinFollowRemote(
      sessionId,
      peerId,
      typeof msg.displayName === "string" ? msg.displayName : "WAN viewer",
    );
    if (joined.success) {
      runtime.peerMap.set(peerId, peerId);
      sendJson(runtime.socket, {
        type: "welcome",
        peerId,
        sessionId,
        hostLabel: runtime.hostLabel,
        state: joined.state,
      });
      sendJson(runtime.socket, { type: "state", state: follow.getState(sessionId) });
    }
    return;
  }

  if (msg.type === "viewerLeft") {
    const peerId = String(msg.peerId || "");
    if (peerId) follow.leaveFollowByPeerId(sessionId, peerId);
    sendJson(runtime.socket, { type: "state", state: follow.getState(sessionId) });
    return;
  }

  if (msg.type === "input" && typeof msg.data === "string") {
    const peerId = String(msg.peerId || "");
    const gate = follow.shouldBlockWriteByPeerId(sessionId, peerId);
    if (gate.blocked) {
      sendJson(runtime.socket, {
        type: "inputDenied",
        peerId,
        reason: gate.reason || "not_controller",
      });
      return;
    }
    if (typeof writeToSessionNow === "function") {
      try {
        writeToSessionNow({ sessionId, automated: false }, msg.data);
      } catch {
        // ignore
      }
    }
    return;
  }

  if (msg.type === "requestControl") {
    const peerId = String(msg.peerId || "");
    if (!peerId) return;
    follow.requestControlByPeerId(sessionId, peerId);
    sendJson(runtime.socket, { type: "state", state: follow.getState(sessionId) });
  }
}

function stopWanInvite(sessionId) {
  stopHost(sessionId);
  return { success: true };
}

function getWanInvite(sessionId) {
  const runtime = hostRuntimes.get(sessionId);
  if (!runtime) return { success: false, error: "no_invite" };
  const payload = {
    v: 2,
    relayHost: runtime.socket?.remoteAddress || "relay",
    relayPort: runtime.socket?.remotePort || 0,
    roomId: runtime.roomId,
    token: runtime.token,
    sessionId,
    hostLabel: runtime.hostLabel,
    expiresAt: runtime.expiresAt,
  };
  // Prefer stored endpoint from create — re-encode with room fields only.
  return {
    success: true,
    invite: {
      roomId: runtime.roomId,
      token: runtime.token,
      sessionId,
      hostLabel: runtime.hostLabel,
      expiresAt: runtime.expiresAt,
      code: formatCode(runtime.token),
    },
  };
}

/**
 * Viewer: connect to relay and surface events via callback registration.
 */
function connectAsViewer({ shareString, displayName, onEvent }) {
  const decoded = decodeShare(shareString);
  if (!decoded.ok) return Promise.resolve({ success: false, error: decoded.error });
  const payload = decoded.payload;
  if (payload.expiresAt && payload.expiresAt <= Date.now()) {
    return Promise.resolve({ success: false, error: "expired" });
  }

  const clientKey = `${payload.roomId}:${payload.token}`;
  const existing = viewerClients.get(clientKey);
  if (existing) {
    try { existing.socket.destroy(); } catch { /* ignore */ }
    viewerClients.delete(clientKey);
  }

  return new Promise((resolve) => {
    const socket = net.connect({ host: payload.relayHost, port: payload.relayPort });
    let buffer = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      socket.destroy();
      finish({ success: false, error: "connect_timeout" });
    }, 12_000);

    socket.once("connect", () => {
      sendJson(socket, {
        type: "relayJoin",
        role: "viewer",
        roomId: payload.roomId,
        token: payload.token,
        displayName: displayName || "WAN viewer",
      });
    });

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.type === "relayWelcome" && !settled) {
          clearTimeout(timer);
          viewerClients.set(clientKey, { socket, payload, peerId: msg.peerId });
          finish({
            success: true,
            peerId: msg.peerId,
            sessionId: payload.sessionId,
            hostLabel: payload.hostLabel,
          });
          continue;
        }
        if (msg.type === "error" && !settled) {
          clearTimeout(timer);
          socket.destroy();
          finish({ success: false, error: msg.error || "relay_error" });
          continue;
        }
        if (typeof onEvent === "function") {
          try { onEvent(msg); } catch { /* ignore */ }
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      finish({ success: false, error: err?.message || "connect_failed" });
    });
    socket.on("close", () => {
      viewerClients.delete(clientKey);
      if (typeof onEvent === "function") {
        try { onEvent({ type: "closed" }); } catch { /* ignore */ }
      }
    });
  });
}

function viewerInput(clientKey, data) {
  const client = viewerClients.get(clientKey);
  if (!client?.socket) return { success: false, error: "not_connected" };
  sendJson(client.socket, { type: "input", data: String(data ?? "") });
  return { success: true };
}

function viewerRequestControl(clientKey) {
  const client = viewerClients.get(clientKey);
  if (!client?.socket) return { success: false, error: "not_connected" };
  sendJson(client.socket, { type: "requestControl" });
  return { success: true };
}

function viewerDisconnect(clientKey) {
  const client = viewerClients.get(clientKey);
  if (!client) return { success: true };
  try { client.socket.destroy(); } catch { /* ignore */ }
  viewerClients.delete(clientKey);
  return { success: true };
}

function configure({ writeToSession, addDataTap: tap }) {
  if (typeof writeToSession === "function") writeToSessionNow = writeToSession;
  if (typeof tap === "function") addDataTap = tap;
}

function registerHandlers(ipcMain, opts = {}) {
  if (!ipcMain) return;
  configure(opts);

  ipcMain.handle("magiesTerminal:followWan:createInvite", async (event, payload) => {
    try {
      return await createWanInvite({
        sessionId: payload?.sessionId,
        hostLabel: payload?.hostLabel,
        webContentsId: event.sender?.id,
        displayName: payload?.displayName || "Host",
        relayHost: payload?.relayHost,
        relayPort: payload?.relayPort,
        useLocalRelay: payload?.useLocalRelay !== false && !payload?.relayHost,
      });
    } catch (err) {
      return { success: false, error: err?.message || "wan_invite_failed" };
    }
  });

  ipcMain.handle("magiesTerminal:followWan:stopInvite", (_event, payload) =>
    stopWanInvite(payload?.sessionId));

  ipcMain.handle("magiesTerminal:followWan:getInvite", (_event, payload) =>
    getWanInvite(payload?.sessionId));

  ipcMain.handle("magiesTerminal:followWan:decodeInvite", (_event, payload) => {
    const decoded = decodeShare(payload?.shareString || payload);
    return decoded.ok
      ? { success: true, invite: decoded.payload }
      : { success: false, error: decoded.error };
  });

  ipcMain.handle("magiesTerminal:followWan:startLocalRelay", async () => {
    try {
      const endpoint = await ensureLocalRelay();
      return { success: true, ...endpoint };
    } catch (err) {
      return { success: false, error: err?.message || "relay_start_failed" };
    }
  });
}

module.exports = {
  configure,
  registerHandlers,
  createWanInvite,
  stopWanInvite,
  startLocalRelay,
  decodeShare,
  encodeShare,
  connectAsViewer,
  viewerInput,
  viewerRequestControl,
  viewerDisconnect,
  createFollowRelayServer,
  formatCode,
  _resetForTests() {
    for (const sessionId of [...hostRuntimes.keys()]) stopHost(sessionId);
    for (const key of [...viewerClients.keys()]) viewerDisconnect(key);
    if (localRelay) {
      const r = localRelay;
      localRelay = null;
      return r.stop();
    }
    return Promise.resolve();
  },
};
