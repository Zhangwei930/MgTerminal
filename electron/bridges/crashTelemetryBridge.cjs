"use strict";

/**
 * Crash Telemetry Bridge — optional, opt-in anonymous crash reporting.
 *
 * Disabled by default. When the user explicitly enables it in Settings →
 * System, sanitized crash entries (no paths, usernames, hostnames, ports,
 * or free-form context) are POSTed to the report endpoint so release
 * regressions become visible without waiting for user bug reports.
 *
 * The opt-in flag lives in {userData}/crash-telemetry.json (main-process
 * owned) so it is readable at crash time before any renderer exists.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STATE_FILE = "crash-telemetry.json";
const DEFAULT_ENDPOINT = "https://dl.magies.top/crash-report";
const REPORT_TIMEOUT_MS = 10000;
const MAX_REPORTS_PER_SESSION = 20;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

let electronApp = null;
let fetchImpl = null;
let enabled = false;
let stateLoaded = false;
let gate = null;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove filesystem-derived identity from free text: the current home
 * directory, any /Users/<name>, /home/<name>, or C:\Users\<name> prefix,
 * and remaining bare occurrences of the username.
 */
function scrubText(text, { homedir, username }) {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text;
  if (homedir) {
    out = out.split(homedir).join("~");
  }
  out = out
    .replace(/\/Users\/[^/\s:'"]+/g, "~")
    .replace(/\/home\/[^/\s:'"]+/g, "~")
    .replace(/[A-Za-z]:\\Users\\[^\\\s:'"]+/g, "~");
  if (username && username.length >= 2) {
    out = out.replace(new RegExp(escapeRegExp(username), "g"), "~");
  }
  return out;
}

const ERROR_META_WHITELIST = ["code", "errno", "syscall", "signal"];

function sanitizeCrashEntry(entry, scrubEnv = { homedir: os.homedir(), username: safeUsername() }) {
  let errorMeta;
  if (entry.errorMeta && typeof entry.errorMeta === "object") {
    errorMeta = {};
    for (const key of ERROR_META_WHITELIST) {
      if (entry.errorMeta[key] !== undefined) errorMeta[key] = entry.errorMeta[key];
    }
    if (Object.keys(errorMeta).length === 0) errorMeta = undefined;
  }

  return {
    schema: 1,
    timestamp: entry.timestamp,
    source: entry.source,
    message: scrubText(entry.message, scrubEnv),
    stack: entry.stack ? scrubText(entry.stack, scrubEnv) : undefined,
    errorMeta,
    platform: entry.platform,
    arch: entry.arch,
    appVersion: entry.version,
    electronVersion: entry.electronVersion,
    osVersion: entry.osVersion,
    memoryMB: entry.memoryMB,
    activeSessionCount: entry.activeSessionCount,
    uptimeSeconds: entry.uptimeSeconds,
  };
}

/**
 * Session-scoped volume control: identical crashes are reported at most
 * once per dedupe window, and a session never sends more than
 * `maxPerSession` reports in total (counting deduped attempts' first send).
 */
function createReportGate({
  maxPerSession = MAX_REPORTS_PER_SESSION,
  dedupeWindowMs = DEDUPE_WINDOW_MS,
} = {}) {
  const lastSentByKey = new Map();
  let sent = 0;
  return {
    allow(key, now = Date.now()) {
      const lastSent = lastSentByKey.get(key);
      if (lastSent !== undefined && now - lastSent < dedupeWindowMs) return false;
      if (sent >= maxPerSession) return false;
      lastSentByKey.set(key, now);
      sent += 1;
      return true;
    },
  };
}

function safeUsername() {
  try {
    return os.userInfo().username || "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

function stateFilePath() {
  try {
    const userData = electronApp?.getPath?.("userData");
    if (!userData) return null;
    return path.join(userData, STATE_FILE);
  } catch {
    return null;
  }
}

function loadState() {
  if (stateLoaded) return;
  stateLoaded = true;
  try {
    const filePath = stateFilePath();
    if (!filePath || !fs.existsSync(filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    enabled = parsed?.enabled === true;
  } catch {
    enabled = false;
  }
}

function persistState() {
  try {
    const filePath = stateFilePath();
    if (!filePath) return;
    fs.writeFileSync(filePath, JSON.stringify({ enabled }) + "\n", "utf-8");
  } catch {
    // Never let the toggle break on a read-only disk.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function init(deps = {}) {
  electronApp = deps.app ?? electronApp;
  fetchImpl = deps.fetchImpl ?? fetchImpl;
  gate = gate ?? createReportGate();
  loadState();
}

function isEnabled() {
  loadState();
  return enabled;
}

function setEnabled(next) {
  loadState();
  enabled = next === true;
  persistState();
  return enabled;
}

function reportEndpoint() {
  return process.env.MAGIES_TERMINAL_CRASH_ENDPOINT || DEFAULT_ENDPOINT;
}

/**
 * Fire-and-forget: sanitize + rate-limit + POST. Must never throw — it is
 * called from crash handlers.
 */
async function reportCrashEntry(entry) {
  try {
    if (!isEnabled() || !entry) return;
    if (!gate) gate = createReportGate();
    const key = `${entry.source}|${String(entry.message ?? "").slice(0, 120)}`;
    if (!gate.allow(key)) return;

    const payload = sanitizeCrashEntry(entry);
    const doFetch = fetchImpl ?? globalThis.fetch;
    if (typeof doFetch !== "function") return;
    await doFetch(reportEndpoint(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout ? AbortSignal.timeout(REPORT_TIMEOUT_MS) : undefined,
    });
  } catch {
    // Telemetry is best-effort; a failed upload must never surface.
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("magiesTerminal:crashTelemetry:get", async () => ({ enabled: isEnabled() }));
  ipcMain.handle("magiesTerminal:crashTelemetry:set", async (_event, payload) => ({
    enabled: setEnabled(payload?.enabled === true),
  }));
}

function _resetForTest() {
  electronApp = null;
  fetchImpl = null;
  enabled = false;
  stateLoaded = false;
  gate = null;
}

module.exports = {
  scrubText,
  sanitizeCrashEntry,
  createReportGate,
  init,
  isEnabled,
  setEnabled,
  reportCrashEntry,
  registerHandlers,
  _resetForTest,
};
