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
const { openFollowFrame, writeSealed } = require("./sessionFollowCrypto.cjs");

const INVITE_TTL_MS = 30 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Distinguishes WAN viewer handles from the LAN bridge's `out-` ones. */
const WAN_CLIENT_ID_PREFIX = "wan-view-";

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

/** Cleartext control frames (relayJoin / relayWelcome / relay errors). */
function sendClearJson(socket, obj) {
  if (!socket || socket.destroyed) return;
  try {
    socket.write(`${JSON.stringify(obj)}\n`);
  } catch {
    // ignore
  }
}

/** Application frames sealed with the invite token (E2E; relay is opaque). */
function sendAppJson(socket, obj, token) {
  writeSealed(socket, obj, token);
}

function sendJson(socket, obj, token) {
  if (token) {
    sendAppJson(socket, obj, token);
    return;
  }
  sendClearJson(socket, obj);
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
    sendAppJson(runtime.socket, { type: "data", data }, runtime.token);
  });
}

function parseRelayEndpoint(relayUrlOrHost, relayPort) {
  // TCP NDJSON only. Reject ws:// and wss:// — those never negotiated TLS or
  // WebSocket here, and treating them as plain TCP was a security footgun.
  if (typeof relayUrlOrHost === "string" && /:\/\//.test(relayUrlOrHost)) {
    return null;
  }
  // "host:port" form
  if (typeof relayUrlOrHost === "string" && relayUrlOrHost.includes(":") && (relayPort == null || relayPort === "")) {
    const idx = relayUrlOrHost.lastIndexOf(":");
    const hostPart = relayUrlOrHost.slice(0, idx).trim();
    const portPart = Math.trunc(Number(relayUrlOrHost.slice(idx + 1)));
    if (!hostPart || !Number.isFinite(portPart) || portPart < 1 || portPart > 65535) return null;
    return { host: hostPart, port: portPart };
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

  sendClearJson(socket, {
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
      // Clear relay control frames.
      if (
        msg.type === "relayWelcome"
        || msg.type === "viewerJoined"
        || msg.type === "viewerLeft"
        || msg.type === "error"
        || msg.type === "closed"
      ) {
        handleHostRelayMessage(sessionId, runtime, msg);
        continue;
      }
      // Sealed viewer application frame wrapped by the relay.
      if (msg.type === "relayViewerFrame" && typeof msg.frame === "string") {
        const opened = openFollowFrame(msg.frame, runtime.token);
        if (!opened.ok) continue;
        handleHostRelayMessage(sessionId, runtime, {
          ...opened.msg,
          peerId: String(msg.peerId || ""),
        });
        continue;
      }
      // Legacy cleartext app frames (should not appear after E2E) — ignore.
    }
  });
  socket.on("close", () => {
    if (hostRuntimes.get(sessionId) === runtime) hostRuntimes.delete(sessionId);
  });
  socket.on("error", () => {
    if (hostRuntimes.get(sessionId) === runtime) hostRuntimes.delete(sessionId);
  });

  // Push initial state once connected (sealed app frame).
  sendAppJson(socket, { type: "state", state: follow.getState(sessionId) }, token);

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
  const token = runtime.token;

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
      sendAppJson(runtime.socket, {
        type: "welcome",
        peerId,
        sessionId,
        hostLabel: runtime.hostLabel,
        state: joined.state,
      }, token);
      sendAppJson(runtime.socket, { type: "state", state: follow.getState(sessionId) }, token);
    }
    return;
  }

  if (msg.type === "viewerLeft") {
    const peerId = String(msg.peerId || "");
    if (peerId) follow.leaveFollowByPeerId(sessionId, peerId);
    sendAppJson(runtime.socket, { type: "state", state: follow.getState(sessionId) }, token);
    return;
  }

  if (msg.type === "input" && typeof msg.data === "string") {
    const peerId = String(msg.peerId || "");
    const gate = follow.shouldBlockWriteByPeerId(sessionId, peerId);
    if (gate.blocked) {
      sendAppJson(runtime.socket, {
        type: "inputDenied",
        peerId,
        reason: gate.reason || "not_controller",
      }, token);
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
    sendAppJson(runtime.socket, { type: "state", state: follow.getState(sessionId) }, token);
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
 * Mirrors the LAN viewer contract: an opaque clientId identifies the connection
 * and every event is delivered as `{ clientId, message }`.
 */
function connectAsViewer({ shareString, displayName, onEvent }) {
  const decoded = decodeShare(shareString);
  if (!decoded.ok) return Promise.resolve({ success: false, error: decoded.error });
  const payload = decoded.payload;
  if (payload.expiresAt && payload.expiresAt <= Date.now()) {
    return Promise.resolve({ success: false, error: "expired" });
  }

  // Re-joining the same room replaces the previous connection.
  for (const [key, client] of viewerClients) {
    if (client.payload.roomId !== payload.roomId || client.payload.token !== payload.token) continue;
    try { client.socket.destroy(); } catch { /* ignore */ }
    viewerClients.delete(key);
  }
  const clientId = `${WAN_CLIENT_ID_PREFIX}${crypto.randomBytes(4).toString("hex")}`;

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
      sendClearJson(socket, {
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
        // Prefer sealed app frames; fall back to clear control JSON.
        const opened = openFollowFrame(line, payload.token);
        let msg;
        if (opened.ok) {
          msg = opened.msg;
        } else {
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
        }
        if (msg.type === "relayWelcome" && !settled) {
          clearTimeout(timer);
          viewerClients.set(clientId, { socket, payload, peerId: msg.peerId });
          finish({
            success: true,
            clientId,
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
          try { onEvent({ clientId, message: msg }); } catch { /* ignore */ }
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      finish({ success: false, error: err?.message || "connect_failed" });
    });
    socket.on("close", () => {
      viewerClients.delete(clientId);
      if (typeof onEvent === "function") {
        try { onEvent({ clientId, message: { type: "closed" } }); } catch { /* ignore */ }
      }
    });
  });
}

function viewerInput(clientId, data) {
  const client = viewerClients.get(clientId);
  if (!client?.socket) return { success: false, error: "not_connected" };
  sendAppJson(client.socket, { type: "input", data: String(data ?? "") }, client.payload.token);
  return { success: true };
}

function viewerRequestControl(clientId) {
  const client = viewerClients.get(clientId);
  if (!client?.socket) return { success: false, error: "not_connected" };
  sendAppJson(client.socket, { type: "requestControl" }, client.payload.token);
  return { success: true };
}

function viewerDisconnect(clientId) {
  const client = viewerClients.get(clientId);
  if (!client) return { success: true };
  try { client.socket.destroy(); } catch { /* ignore */ }
  viewerClients.delete(clientId);
  return { success: true };
}

/** True when a viewer handle belongs to this transport rather than the LAN one. */
function ownsViewerClientId(clientId) {
  return typeof clientId === "string" && clientId.startsWith(WAN_CLIENT_ID_PREFIX);
}

/** True when a pasted share string is a WAN invite rather than a LAN one. */
function isWanShareString(value) {
  return /^magies-follow:2:/.test(String(value || "").trim());
}

function configure({ writeToSession, addDataTap: tap }) {
  if (typeof writeToSession === "function") writeToSessionNow = writeToSession;
  if (typeof tap === "function") addDataTap = tap;
}

module.exports = {
  configure,
  createWanInvite,
  stopWanInvite,
  startLocalRelay,
  decodeShare,
  encodeShare,
  connectAsViewer,
  viewerInput,
  viewerRequestControl,
  viewerDisconnect,
  ownsViewerClientId,
  isWanShareString,
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
