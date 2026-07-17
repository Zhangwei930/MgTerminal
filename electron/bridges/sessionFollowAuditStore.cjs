"use strict";

/**
 * Disk-backed store for session follow audit events (main process).
 * Pure-ish helpers + fs I/O; injectable path for unit tests.
 */

const fs = require("fs");
const path = require("path");

const STORE_VERSION = 1;
const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_MAX_SESSIONS = 40;

function emptyStore() {
  return { version: STORE_VERSION, sessions: {} };
}

function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const ts = Number(raw.ts);
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId.trim() : "";
  const type = typeof raw.type === "string" ? raw.type.trim() : "";
  if (!sessionId || !type || !Number.isFinite(ts)) return null;
  return {
    ts,
    sessionId,
    type,
    actorPeerId: typeof raw.actorPeerId === "string" ? raw.actorPeerId : undefined,
    targetPeerId: typeof raw.targetPeerId === "string" ? raw.targetPeerId : undefined,
    detail: typeof raw.detail === "string" ? raw.detail.slice(0, 500) : undefined,
  };
}

/**
 * Cap per-session events and total sessions (drop oldest sessions by last event).
 */
function normalizeStore(store, options = {}) {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const base = store && typeof store === "object" ? store : emptyStore();
  const sessionsIn = base.sessions && typeof base.sessions === "object" ? base.sessions : {};
  const sessions = {};

  for (const [sessionId, list] of Object.entries(sessionsIn)) {
    if (typeof sessionId !== "string" || !sessionId.trim()) continue;
    if (!Array.isArray(list)) continue;
    const events = [];
    for (const entry of list) {
      const event = sanitizeEvent(entry);
      if (event && event.sessionId === sessionId) events.push(event);
    }
    if (events.length === 0) continue;
    sessions[sessionId] = events.length > maxEvents
      ? events.slice(events.length - maxEvents)
      : events;
  }

  const ids = Object.keys(sessions);
  if (ids.length > maxSessions) {
    ids.sort((a, b) => {
      const aLast = sessions[a][sessions[a].length - 1]?.ts || 0;
      const bLast = sessions[b][sessions[b].length - 1]?.ts || 0;
      return aLast - bLast;
    });
    const drop = ids.length - maxSessions;
    for (let i = 0; i < drop; i += 1) {
      delete sessions[ids[i]];
    }
  }

  return { version: STORE_VERSION, sessions };
}

function loadStore(filePath) {
  if (!filePath) return emptyStore();
  try {
    if (!fs.existsSync(filePath)) return emptyStore();
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch (err) {
    console.warn("[sessionFollowAuditStore] load failed:", err?.message || err);
    return emptyStore();
  }
}

function saveStore(filePath, store, options = {}) {
  if (!filePath) return false;
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const normalized = normalizeStore(store, options);
    fs.writeFileSync(filePath, `${JSON.stringify(normalized)}\n`, { mode: 0o600 });
    return true;
  } catch (err) {
    console.warn("[sessionFollowAuditStore] save failed:", err?.message || err);
    return false;
  }
}

function getSessionEvents(store, sessionId) {
  if (!store?.sessions || typeof sessionId !== "string") return [];
  const list = store.sessions[sessionId];
  return Array.isArray(list) ? list.slice() : [];
}

function setSessionEvents(store, sessionId, events, options = {}) {
  const maxEvents = options.maxEvents ?? DEFAULT_MAX_EVENTS;
  const next = normalizeStore(store || emptyStore(), options);
  if (!sessionId) return next;
  const cleaned = [];
  for (const entry of events || []) {
    const event = sanitizeEvent({ ...entry, sessionId });
    if (event) cleaned.push(event);
  }
  if (cleaned.length === 0) {
    delete next.sessions[sessionId];
  } else {
    next.sessions[sessionId] = cleaned.length > maxEvents
      ? cleaned.slice(cleaned.length - maxEvents)
      : cleaned;
  }
  return normalizeStore(next, options);
}

function appendSessionEvent(store, event, options = {}) {
  const sanitized = sanitizeEvent(event);
  if (!sanitized) return store || emptyStore();
  const existing = getSessionEvents(store, sanitized.sessionId);
  existing.push(sanitized);
  return setSessionEvents(store, sanitized.sessionId, existing, options);
}

function resolveDefaultFilePath(userDataPath) {
  if (!userDataPath || typeof userDataPath !== "string") return null;
  return path.join(userDataPath, "follow-audit-v1.json");
}

module.exports = {
  STORE_VERSION,
  DEFAULT_MAX_EVENTS,
  DEFAULT_MAX_SESSIONS,
  emptyStore,
  sanitizeEvent,
  normalizeStore,
  loadStore,
  saveStore,
  getSessionEvents,
  setSessionEvents,
  appendSessionEvent,
  resolveDefaultFilePath,
};
