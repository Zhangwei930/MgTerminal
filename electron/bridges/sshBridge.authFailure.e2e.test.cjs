/**
 * Real integration test: a real OpenSSH sshd rejecting an unauthorized key
 * produces the exact error shape sshBridge's real auth-failure handling
 * recognizes (err.level === "client-authentication", set by ssh2 itself),
 * not just "some promise rejected."
 */

"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { withTestSshServer } = require("./testHarness/localSshServer.cjs");

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

test("a key never added to authorized_keys is rejected with the real ssh2 auth-failure shape", async (t) => {
  await withTestSshServer(t, {}, async (server) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "magies-authfail-e2e-"));
    t.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });
    const wrongKeyPath = path.join(tmp, "id_ed25519");
    execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", wrongKeyPath, "-q"]);
    const wrongKey = fs.readFileSync(wrongKeyPath, "utf8");

    const bridge = require("./sshBridge.cjs");
    bridge.init({ sessions: new Map(), electronModule: {} });
    const ipcMain = makeIpcMain();
    bridge.registerHandlers(ipcMain);
    const start = ipcMain.handlers.get("magiesTerminal:start");

    await assert.rejects(
      () => start(
        { sender: makeSender() },
        {
          hostname: server.hostname,
          port: server.port,
          username: server.username,
          privateKey: wrongKey,
          verifyHostKeys: false,
          readyTimeout: 5000,
        },
      ),
      (err) => {
        assert.equal(err.level, "client-authentication");
        return true;
      },
    );
  });
});
