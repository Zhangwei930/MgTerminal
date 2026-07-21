const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  sanitizeCrashEntry,
  createReportGate,
  init,
  isEnabled,
  setEnabled,
  reportCrashEntry,
  getStats,
  _resetForTest,
} = require("./crashTelemetryBridge.cjs");

function makeEntry(overrides = {}) {
  return {
    timestamp: "2026-07-18T00:00:00.000Z",
    source: "uncaughtException",
    message: "ENOENT: no such file /Users/weizhang/secret/config.json",
    stack: "Error: boom\n    at doWork (/Users/weizhang/Downloads/MagiesTerminal/MgTerminal/electron/main.cjs:10:5)",
    errorMeta: { code: "ENOENT", errno: -2, syscall: "open", hostname: "prod-db-01", port: 22 },
    extra: { host: "10.0.0.5", user: "root" },
    pid: 1234,
    platform: "darwin",
    arch: "x64",
    version: "0.5.6",
    electronVersion: "42.3.3",
    osVersion: "24.6.0",
    memoryMB: { rss: 100, heapUsed: 50, heapTotal: 80 },
    activeSessionCount: 3,
    uptimeSeconds: 60,
    ...overrides,
  };
}

const scrubEnv = { homedir: "/Users/weizhang", username: "weizhang" };

test.beforeEach(() => {
  _resetForTest();
});

test("sanitizeCrashEntry scrubs home paths and usernames from message and stack", () => {
  const payload = sanitizeCrashEntry(makeEntry(), scrubEnv);
  assert.ok(!payload.message.includes("/Users/weizhang"));
  assert.ok(!payload.stack.includes("/Users/weizhang"));
  assert.ok(!payload.stack.includes("weizhang"));
  assert.ok(payload.message.includes("~"));
  assert.ok(payload.stack.includes("electron/main.cjs:10:5"));
});

test("sanitizeCrashEntry drops identifying fields and keeps the whitelist", () => {
  const payload = sanitizeCrashEntry(makeEntry(), scrubEnv);
  assert.equal(payload.pid, undefined);
  assert.equal(payload.extra, undefined);
  assert.equal(payload.errorMeta.hostname, undefined);
  assert.equal(payload.errorMeta.port, undefined);
  assert.equal(payload.errorMeta.code, "ENOENT");
  assert.equal(payload.errorMeta.syscall, "open");
  assert.equal(payload.appVersion, "0.5.6");
  assert.equal(payload.platform, "darwin");
  assert.equal(payload.electronVersion, "42.3.3");
  assert.equal(payload.schema, 1);
});

test("sanitizeCrashEntry tolerates missing optional fields", () => {
  const payload = sanitizeCrashEntry(
    { timestamp: "t", source: "s", message: "plain", platform: "linux" },
    scrubEnv,
  );
  assert.equal(payload.message, "plain");
  assert.equal(payload.stack, undefined);
  assert.equal(payload.errorMeta, undefined);
});

test("createReportGate dedupes repeats and caps per-session volume", () => {
  const gate = createReportGate({ maxPerSession: 3, dedupeWindowMs: 60000 });
  assert.equal(gate.allow("a", 0), true);
  assert.equal(gate.allow("a", 1000), false);
  assert.equal(gate.allow("a", 61000), true);
  assert.equal(gate.allow("b", 0), true);
  // Cap reached (a, a-again, b) — everything else is rejected.
  assert.equal(gate.allow("c", 0), false);
});

function withTempApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crash-telemetry-test-"));
  return { app: { getPath: () => dir }, dir };
}

test("telemetry is disabled by default and persists an explicit opt-in", () => {
  const { app, dir } = withTempApp();
  init({ app });
  assert.equal(isEnabled(), false);

  setEnabled(true);
  assert.equal(isEnabled(), true);

  // A fresh init from the same userData dir reads the persisted value.
  _resetForTest();
  init({ app });
  assert.equal(isEnabled(), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("reportCrashEntry sends nothing while disabled", async () => {
  const { app, dir } = withTempApp();
  const calls = [];
  init({ app, fetchImpl: async (...args) => { calls.push(args); return { ok: true }; } });
  await reportCrashEntry(makeEntry());
  assert.equal(calls.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("reportCrashEntry posts a sanitized JSON payload when enabled", async () => {
  const { app, dir } = withTempApp();
  const calls = [];
  init({ app, fetchImpl: async (url, opts) => { calls.push({ url, opts }); return { ok: true }; } });
  setEnabled(true);

  await reportCrashEntry(makeEntry());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.method, "POST");
  const body = JSON.parse(calls[0].opts.body);
  assert.ok(!JSON.stringify(body).includes(os.userInfo().username) || os.userInfo().username.length < 3);
  assert.equal(body.pid, undefined);
  assert.equal(body.extra, undefined);
  assert.equal(body.appVersion, "0.5.6");

  // The same crash reported again inside the dedupe window is dropped.
  await reportCrashEntry(makeEntry());
  assert.equal(calls.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("reportCrashEntry never throws when the network call fails", async () => {
  const { app, dir } = withTempApp();
  init({ app, fetchImpl: async () => { throw new Error("offline"); } });
  setEnabled(true);
  await assert.doesNotReject(() => reportCrashEntry(makeEntry()));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("stats start empty and survive a restart", async () => {
  const { app, dir } = withTempApp();
  init({ app, fetchImpl: async () => ({ ok: true }) });
  assert.deepEqual(getStats(), { sentCount: 0, lastSentAt: null });

  setEnabled(true);
  await reportCrashEntry(makeEntry());
  const afterFirst = getStats();
  assert.equal(afterFirst.sentCount, 1);
  assert.equal(typeof afterFirst.lastSentAt, "number");

  // Counters are persisted, not session-scoped like the dedupe gate.
  _resetForTest();
  init({ app });
  assert.deepEqual(getStats(), afterFirst);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("deduped and disabled reports do not advance the counter", async () => {
  const { app, dir } = withTempApp();
  init({ app, fetchImpl: async () => ({ ok: true }) });

  await reportCrashEntry(makeEntry());
  assert.equal(getStats().sentCount, 0, "disabled reports never count");

  setEnabled(true);
  await reportCrashEntry(makeEntry());
  await reportCrashEntry(makeEntry());
  assert.equal(getStats().sentCount, 1, "the deduped repeat must not count");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a failed upload does not count as sent", async () => {
  const { app, dir } = withTempApp();
  init({ app, fetchImpl: async () => { throw new Error("offline"); } });
  setEnabled(true);

  await reportCrashEntry(makeEntry());
  assert.deepEqual(getStats(), { sentCount: 0, lastSentAt: null });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("legacy state files without counters load as zeroed stats", () => {
  const { app, dir } = withTempApp();
  fs.writeFileSync(path.join(dir, "crash-telemetry.json"), JSON.stringify({ enabled: true }), "utf-8");
  init({ app });

  assert.equal(isEnabled(), true);
  assert.deepEqual(getStats(), { sentCount: 0, lastSentAt: null });
  fs.rmSync(dir, { recursive: true, force: true });
});
