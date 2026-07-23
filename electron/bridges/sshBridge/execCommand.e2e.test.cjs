/**
 * Real integration test: sshBridge's one-shot execCommand against a real
 * throwaway local sshd (via electron/bridges/testHarness/localSshServer.cjs),
 * not a hand-rolled ssh2 fake. Self-skips when the environment can't provide
 * a working sshd (see the harness for exact conditions).
 */

"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { withTestSshServer } = require("../testHarness/localSshServer.cjs");

function makeSender() {
  return { id: 1, isDestroyed: () => false, send: () => {} };
}

function makeIpcMain() {
  return {
    handlers: new Map(),
    handle(channel, handler) { this.handlers.set(channel, handler); },
    on() {},
  };
}

test("execCommand runs a real command over a real SSH connection", async (t) => {
  await withTestSshServer(t, {}, async (server) => {
    const bridge = require("../sshBridge.cjs");
    bridge.init({ sessions: new Map(), electronModule: {} });
    const ipcMain = makeIpcMain();
    bridge.registerHandlers(ipcMain);
    const execCommand = ipcMain.handlers.get("magiesTerminal:ssh:exec");

    const result = await execCommand(
      { sender: makeSender() },
      {
        hostname: server.hostname,
        port: server.port,
        username: server.username,
        privateKey: server.privateKey.toString("utf8"),
        command: "echo hello-from-exec",
      },
    );

    assert.match(result.stdout, /hello-from-exec/);
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
  });
});
