const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  init,
  captureInvocation,
  listLogs,
  readLog,
  clearLogs,
  registerHandlers,
  _resetForTest,
} = require("./rpcInvocationLogBridge.cjs");

function withTempApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rpc-invocation-log-test-"));
  return { app: { getPath: () => dir }, dir };
}

test.afterEach(() => {
  _resetForTest();
});

test("captureInvocation writes a JSONL entry with the expected shape", async () => {
  const { app, dir } = withTempApp();
  init({ electronModule: { app } });

  captureInvocation({ source: "cli", method: "vault.host.list", ok: true, durationMs: 12.7 });

  const files = await listLogs();
  assert.equal(files.length, 1);
  assert.equal(files[0].entryCount, 1);

  const entries = await readLog(files[0].fileName);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, "cli");
  assert.equal(entries[0].method, "vault.host.list");
  assert.equal(entries[0].ok, true);
  assert.equal(entries[0].durationMs, 13);
  assert.ok(entries[0].timestamp);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("captureInvocation records failures with an error code", async () => {
  const { app, dir } = withTempApp();
  init({ electronModule: { app } });

  captureInvocation({ source: "mcp", method: "terminal.execute", ok: false, durationMs: 5, errorCode: "USER_DENIED" });

  const files = await listLogs();
  const entries = await readLog(files[0].fileName);
  assert.equal(entries[0].ok, false);
  assert.equal(entries[0].errorCode, "USER_DENIED");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("captureInvocation never throws when the bridge is uninitialized", () => {
  assert.doesNotThrow(() => {
    captureInvocation({ source: "cli", method: "vault.host.list", ok: true, durationMs: 1 });
  });
});

test("listLogs returns an empty array when uninitialized", async () => {
  assert.deepEqual(await listLogs(), []);
});

test("readLog rejects path traversal attempts", async () => {
  const { app, dir } = withTempApp();
  init({ electronModule: { app } });
  captureInvocation({ source: "cli", method: "vault.host.list", ok: true, durationMs: 1 });

  assert.deepEqual(await readLog("../../etc/passwd"), []);
  assert.deepEqual(await readLog("not-a-real-log.log"), []);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("clearLogs deletes all log files and listLogs reflects it", async () => {
  const { app, dir } = withTempApp();
  init({ electronModule: { app } });
  captureInvocation({ source: "cli", method: "vault.host.list", ok: true, durationMs: 1 });

  const cleared = await clearLogs();
  assert.equal(cleared.deletedCount, 1);
  assert.deepEqual(await listLogs(), []);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("registerHandlers wires list/read/clear/openDir under magiesTerminal:rpcInvocationLogs:*", () => {
  const { app, dir } = withTempApp();
  init({ electronModule: { app } });
  captureInvocation({ source: "cli", method: "vault.host.list", ok: true, durationMs: 1 });

  const handlers = new Map();
  const ipcMain = {
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
  };
  registerHandlers(ipcMain);

  assert.ok(handlers.has("magiesTerminal:rpcInvocationLogs:list"));
  assert.ok(handlers.has("magiesTerminal:rpcInvocationLogs:read"));
  assert.ok(handlers.has("magiesTerminal:rpcInvocationLogs:clear"));
  assert.ok(handlers.has("magiesTerminal:rpcInvocationLogs:openDir"));

  fs.rmSync(dir, { recursive: true, force: true });
});
