"use strict";

/**
 * Main-process local follow rooms. Mirrors domain/sessionFollow pure helpers
 * so renderer and main share the same rules without bundling TS into CJS.
 */

const auditStore = require("./sessionFollowAuditStore.cjs");

const rooms = new Map(); // sessionId -> room
const peerToSession = new Map(); // peerId -> sessionId
const auditBySession = new Map(); // sessionId -> events[]
const stateListeners = new Set();
const MAX_AUDIT = 200;

/** @type {string | null} */
let auditFilePath = null;
/** @type {ReturnType<typeof auditStore.emptyStore> | null} */
let diskAuditCache = null;
let auditPersistTimer = null;
const AUDIT_PERSIST_DEBOUNCE_MS = 400;

function configureAuditPersistence(options = {}) {
  if (typeof options.filePath === "string" && options.filePath.trim()) {
    auditFilePath = options.filePath.trim();
  } else if (typeof options.userDataPath === "string" && options.userDataPath.trim()) {
    auditFilePath = auditStore.resolveDefaultFilePath(options.userDataPath.trim());
  } else {
    try {
      // Lazy resolve Electron userData when available (not required for unit tests).
      // eslint-disable-next-line global-require
      const { app } = require("electron");
      if (app?.getPath) {
        auditFilePath = auditStore.resolveDefaultFilePath(app.getPath("userData"));
      }
    } catch {
      // running outside Electron
    }
  }
  diskAuditCache = null;
  return auditFilePath;
}

function ensureDiskAuditLoaded() {
  if (diskAuditCache) return diskAuditCache;
  if (!auditFilePath) {
    // Attempt auto-config once.
    configureAuditPersistence();
  }
  diskAuditCache = auditFilePath
    ? auditStore.loadStore(auditFilePath)
    : auditStore.emptyStore();
  return diskAuditCache;
}

function scheduleAuditPersist() {
  if (!auditFilePath) return;
  if (auditPersistTimer) clearTimeout(auditPersistTimer);
  auditPersistTimer = setTimeout(() => {
    auditPersistTimer = null;
    flushAuditPersist();
  }, AUDIT_PERSIST_DEBOUNCE_MS);
  if (typeof auditPersistTimer.unref === "function") {
    auditPersistTimer.unref();
  }
}

function flushAuditPersist() {
  if (!auditFilePath) return false;
  const disk = ensureDiskAuditLoaded();
  // Merge in-memory sessions into disk cache before write.
  for (const [sessionId, events] of auditBySession.entries()) {
    diskAuditCache = auditStore.setSessionEvents(disk, sessionId, events, {
      maxEvents: MAX_AUDIT,
    });
  }
  return auditStore.saveStore(auditFilePath, diskAuditCache || disk, {
    maxEvents: MAX_AUDIT,
  });
}

function hydrateAuditFromDisk(sessionId) {
  if (!sessionId) return;
  if (auditBySession.has(sessionId)) return;
  const disk = ensureDiskAuditLoaded();
  const events = auditStore.getSessionEvents(disk, sessionId);
  if (events.length > 0) {
    auditBySession.set(sessionId, events.slice());
  }
}

function makePeerId(webContentsId) {
  return `wc-${webContentsId}`;
}

function createPeer(webContentsId, displayName, role) {
  return {
    peerId: makePeerId(webContentsId),
    webContentsId,
    displayName: (displayName || `Window ${webContentsId}`).slice(0, 80),
    role: role || "viewer",
    joinedAt: Date.now(),
    kind: "local",
  };
}

function createRemotePeer(peerId, displayName, role) {
  return {
    peerId,
    webContentsId: null,
    displayName: (displayName || "LAN viewer").slice(0, 80),
    role: role || "viewer",
    joinedAt: Date.now(),
    kind: "lan",
  };
}

function toPublicState(room) {
  const nameById = new Map(room.peers.map((p) => [p.peerId, p.displayName]));
  return {
    sessionId: room.sessionId,
    ownerPeerId: room.ownerPeerId,
    controllerPeerId: room.controllerPeerId,
    peerCount: room.peers.length,
    peers: room.peers.map((p) => ({
      peerId: p.peerId,
      displayName: p.displayName,
      role: p.role,
      webContentsId: p.webContentsId,
    })),
    pendingControlRequests: room.pendingControlRequests.map((peerId) => ({
      peerId,
      displayName: nameById.get(peerId) || peerId,
    })),
    createdAt: room.createdAt,
  };
}

function pushAudit(sessionId, type, actorPeerId, targetPeerId, detail) {
  hydrateAuditFromDisk(sessionId);
  const event = {
    ts: Date.now(),
    sessionId,
    type,
    actorPeerId,
    targetPeerId,
    detail,
  };
  const list = auditBySession.get(sessionId) || [];
  list.push(event);
  if (list.length > MAX_AUDIT) list.splice(0, list.length - MAX_AUDIT);
  auditBySession.set(sessionId, list);
  // Keep disk cache in sync for this session.
  const disk = ensureDiskAuditLoaded();
  diskAuditCache = auditStore.setSessionEvents(disk, sessionId, list, {
    maxEvents: MAX_AUDIT,
  });
  scheduleAuditPersist();
  return event;
}

function notify(sessionId) {
  const room = rooms.get(sessionId);
  const state = room ? toPublicState(room) : null;
  for (const listener of stateListeners) {
    try {
      listener(sessionId, state);
    } catch (err) {
      console.warn("[sessionFollow] listener failed", err);
    }
  }
}

function startFollow(sessionId, webContentsId, displayName) {
  if (!sessionId || !Number.isFinite(webContentsId)) {
    return { success: false, error: "Invalid session or webContents." };
  }
  if (rooms.has(sessionId)) {
    return { success: false, error: "Follow already active for this session." };
  }
  // Load prior collaboration history for this session (if any).
  hydrateAuditFromDisk(sessionId);
  const owner = createPeer(webContentsId, displayName || "Host", "controller");
  const room = {
    sessionId,
    ownerPeerId: owner.peerId,
    controllerPeerId: owner.peerId,
    peers: [owner],
    pendingControlRequests: [],
    createdAt: Date.now(),
  };
  rooms.set(sessionId, room);
  peerToSession.set(owner.peerId, sessionId);
  pushAudit(sessionId, "follow_started", owner.peerId);
  notify(sessionId);
  return { success: true, state: toPublicState(room), peerId: owner.peerId };
}

function stopFollow(sessionId, actorWebContentsId) {
  const room = rooms.get(sessionId);
  if (!room) return { success: true, state: null };
  const actor = room.peers.find((p) => p.webContentsId === actorWebContentsId);
  if (actor && actor.peerId !== room.ownerPeerId) {
    return { success: false, error: "Only the host can stop follow." };
  }
  for (const peer of room.peers) peerToSession.delete(peer.peerId);
  rooms.delete(sessionId);
  pushAudit(sessionId, "follow_stopped", actor?.peerId);
  notify(sessionId);
  return { success: true, state: null };
}

function joinFollow(sessionId, webContentsId, displayName) {
  const room = rooms.get(sessionId);
  if (!room) return { success: false, error: "Follow room not found." };
  const peer = createPeer(webContentsId, displayName || "Viewer", "viewer");

  // Drop stale same-webContents peer
  room.peers = room.peers.filter((p) => p.webContentsId !== webContentsId);
  room.peers.push(peer);
  peerToSession.set(peer.peerId, sessionId);
  pushAudit(sessionId, "peer_joined", peer.peerId);
  notify(sessionId);
  return { success: true, state: toPublicState(room), peerId: peer.peerId };
}

function leaveFollow(sessionId, webContentsId) {
  const room = rooms.get(sessionId);
  if (!room) return { success: true, state: null };
  const peer = room.peers.find((p) => p.webContentsId === webContentsId);
  if (!peer) return { success: true, state: toPublicState(room) };

  // Owner leaving stops the room.
  if (peer.peerId === room.ownerPeerId) {
    return stopFollow(sessionId, webContentsId);
  }

  room.peers = room.peers.filter((p) => p.peerId !== peer.peerId);
  peerToSession.delete(peer.peerId);
  room.pendingControlRequests = room.pendingControlRequests.filter((id) => id !== peer.peerId);

  if (room.controllerPeerId === peer.peerId) {
    room.controllerPeerId = room.ownerPeerId;
    room.peers = room.peers.map((p) => ({
      ...p,
      role: p.peerId === room.ownerPeerId ? "controller" : "viewer",
    }));
  }

  pushAudit(sessionId, "peer_left", peer.peerId);
  if (room.peers.length === 0) {
    rooms.delete(sessionId);
    notify(sessionId);
    return { success: true, state: null };
  }
  notify(sessionId);
  return { success: true, state: toPublicState(room) };
}

function requestControl(sessionId, webContentsId) {
  const room = rooms.get(sessionId);
  if (!room) return { success: false, error: "Follow room not found." };
  const peer = room.peers.find((p) => p.webContentsId === webContentsId);
  if (!peer) return { success: false, error: "Not in room." };
  if (room.controllerPeerId === peer.peerId) {
    return { success: false, error: "Already controller." };
  }
  if (!room.pendingControlRequests.includes(peer.peerId)) {
    room.pendingControlRequests.push(peer.peerId);
    pushAudit(sessionId, "control_requested", peer.peerId);
    notify(sessionId);
  }
  return { success: true, state: toPublicState(room) };
}

function grantControl(sessionId, actorWebContentsId, targetPeerId) {
  const room = rooms.get(sessionId);
  if (!room) return { success: false, error: "Follow room not found." };
  const actor = room.peers.find((p) => p.webContentsId === actorWebContentsId);
  if (!actor) return { success: false, error: "Not in room." };
  if (actor.peerId !== room.controllerPeerId && actor.peerId !== room.ownerPeerId) {
    return { success: false, error: "Only controller or host can grant." };
  }
  const target = room.peers.find((p) => p.peerId === targetPeerId);
  if (!target) return { success: false, error: "Target not in room." };

  room.controllerPeerId = targetPeerId;
  room.peers = room.peers.map((p) => ({
    ...p,
    role: p.peerId === targetPeerId ? "controller" : "viewer",
  }));
  room.pendingControlRequests = room.pendingControlRequests.filter((id) => id !== targetPeerId);
  pushAudit(sessionId, "control_granted", actor.peerId, targetPeerId);
  notify(sessionId);
  return { success: true, state: toPublicState(room) };
}

function revokeControl(sessionId, actorWebContentsId) {
  const room = rooms.get(sessionId);
  if (!room) return { success: false, error: "Follow room not found." };
  const actor = room.peers.find((p) => p.webContentsId === actorWebContentsId);
  if (!actor) return { success: false, error: "Not in room." };
  if (actor.peerId !== room.ownerPeerId && actor.peerId !== room.controllerPeerId) {
    return { success: false, error: "Not allowed." };
  }
  if (room.controllerPeerId === room.ownerPeerId) {
    return { success: true, state: toPublicState(room) };
  }
  room.controllerPeerId = room.ownerPeerId;
  room.peers = room.peers.map((p) => ({
    ...p,
    role: p.peerId === room.ownerPeerId ? "controller" : "viewer",
  }));
  pushAudit(sessionId, "control_revoked", actor.peerId, room.ownerPeerId);
  notify(sessionId);
  return { success: true, state: toPublicState(room) };
}

function getState(sessionId) {
  const room = rooms.get(sessionId);
  return room ? toPublicState(room) : null;
}

function getAudit(sessionId) {
  hydrateAuditFromDisk(sessionId);
  return auditBySession.get(sessionId) || [];
}

/**
 * Wipe collaboration audit for a session (memory + disk).
 * Used for local privacy cleanup; does not write a "cleared" event.
 */
function clearAudit(sessionId) {
  if (!sessionId || typeof sessionId !== "string") {
    return { success: false, error: "Invalid session id." };
  }
  auditBySession.delete(sessionId);
  const disk = ensureDiskAuditLoaded();
  diskAuditCache = auditStore.setSessionEvents(disk, sessionId, [], {
    maxEvents: MAX_AUDIT,
  });
  scheduleAuditPersist();
  flushAuditPersist();
  return { success: true, events: [] };
}

function getWebContentsIds(sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return null;
  return room.peers
    .map((p) => p.webContentsId)
    .filter((id) => Number.isFinite(id) && id > 0);
}

function shouldBlockWrite(sessionId, webContentsId, options = {}) {
  const room = rooms.get(sessionId);
  if (!room) return { blocked: false };
  const peer = room.peers.find((p) => p.webContentsId === webContentsId);
  if (!peer) {
    pushAudit(sessionId, "input_denied", undefined, undefined, "unknown_peer");
    return { blocked: true, reason: "unknown_peer" };
  }
  if (peer.peerId === room.controllerPeerId) return { blocked: false };
  pushAudit(sessionId, "input_denied", peer.peerId, undefined, options.automated ? "automated" : "viewer");
  return { blocked: true, reason: "not_controller" };
}

function shouldBlockWriteByPeerId(sessionId, peerId, options = {}) {
  const room = rooms.get(sessionId);
  if (!room) return { blocked: false };
  const peer = room.peers.find((p) => p.peerId === peerId);
  if (!peer) {
    pushAudit(sessionId, "input_denied", peerId, undefined, "unknown_peer");
    return { blocked: true, reason: "unknown_peer" };
  }
  if (peer.peerId === room.controllerPeerId) return { blocked: false };
  pushAudit(sessionId, "input_denied", peer.peerId, undefined, options.automated ? "automated" : "viewer");
  return { blocked: true, reason: "not_controller" };
}

/** Join a LAN (non-webContents) peer into an existing room. */
function joinFollowRemote(sessionId, peerId, displayName) {
  const room = rooms.get(sessionId);
  if (!room) return { success: false, error: "Follow room not found." };
  if (!peerId || typeof peerId !== "string") {
    return { success: false, error: "Invalid peer id." };
  }
  room.peers = room.peers.filter((p) => p.peerId !== peerId);
  const peer = createRemotePeer(peerId, displayName || "LAN viewer", "viewer");
  room.peers.push(peer);
  peerToSession.set(peer.peerId, sessionId);
  pushAudit(sessionId, "peer_joined", peer.peerId, undefined, "lan");
  notify(sessionId);
  return { success: true, state: toPublicState(room), peerId: peer.peerId };
}

function leaveFollowByPeerId(sessionId, peerId) {
  const room = rooms.get(sessionId);
  if (!room) return { success: true, state: null };
  const peer = room.peers.find((p) => p.peerId === peerId);
  if (!peer) return { success: true, state: toPublicState(room) };
  if (peer.kind !== "lan" && peer.webContentsId != null) {
    return leaveFollow(sessionId, peer.webContentsId);
  }
  // Owner cannot be a LAN peer.
  room.peers = room.peers.filter((p) => p.peerId !== peerId);
  peerToSession.delete(peerId);
  room.pendingControlRequests = room.pendingControlRequests.filter((id) => id !== peerId);
  if (room.controllerPeerId === peerId) {
    room.controllerPeerId = room.ownerPeerId;
    room.peers = room.peers.map((p) => ({
      ...p,
      role: p.peerId === room.ownerPeerId ? "controller" : "viewer",
    }));
  }
  pushAudit(sessionId, "peer_left", peerId, undefined, "lan");
  notify(sessionId);
  return { success: true, state: toPublicState(room) };
}

function requestControlByPeerId(sessionId, peerId) {
  const room = rooms.get(sessionId);
  if (!room) return { success: false, error: "Follow room not found." };
  const peer = room.peers.find((p) => p.peerId === peerId);
  if (!peer) return { success: false, error: "Not in room." };
  if (room.controllerPeerId === peerId) {
    return { success: false, error: "Already controller." };
  }
  if (!room.pendingControlRequests.includes(peerId)) {
    room.pendingControlRequests.push(peerId);
    pushAudit(sessionId, "control_requested", peerId);
    notify(sessionId);
  }
  return { success: true, state: toPublicState(room) };
}

function leaveAllForWebContents(webContentsId) {
  const sessionIds = [];
  for (const [sessionId, room] of rooms.entries()) {
    if (room.peers.some((p) => p.webContentsId === webContentsId)) {
      sessionIds.push(sessionId);
    }
  }
  for (const sessionId of sessionIds) {
    leaveFollow(sessionId, webContentsId);
  }
}

function onStateChange(listener) {
  if (typeof listener !== "function") return () => {};
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function __resetForTests() {
  rooms.clear();
  peerToSession.clear();
  auditBySession.clear();
  stateListeners.clear();
  if (auditPersistTimer) {
    clearTimeout(auditPersistTimer);
    auditPersistTimer = null;
  }
  auditFilePath = null;
  diskAuditCache = null;
}

module.exports = {
  startFollow,
  stopFollow,
  joinFollow,
  leaveFollow,
  joinFollowRemote,
  leaveFollowByPeerId,
  requestControl,
  requestControlByPeerId,
  grantControl,
  revokeControl,
  getState,
  getAudit,
  clearAudit,
  getWebContentsIds,
  shouldBlockWrite,
  shouldBlockWriteByPeerId,
  leaveAllForWebContents,
  onStateChange,
  makePeerId,
  configureAuditPersistence,
  flushAuditPersist,
  __resetForTests,
};
