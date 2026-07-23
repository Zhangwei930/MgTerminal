/**
 * Real integration test: sftpBridge reuses an already-authenticated terminal
 * SSH connection (findReusableSession / createSessionBackedSftpClient) rather
 * than dialing a fresh one — the one code path no ssh2-fake-based test can
 * realistically exercise, since it depends on real SFTP-subsystem protocol
 * behavior riding on top of a real shell-carrying connection.
 */

"use strict";

const assert = require("node:assert/strict");
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

test("sftpBridge reuses a live terminal SSH connection instead of dialing fresh", async (t) => {
  await withTestSshServer(t, { enableSftp: true }, async (server) => {
    const sessions = new Map();
    const sshBridge = require("./sshBridge.cjs");
    const sftpBridge = require("./sftpBridge.cjs");
    const terminalBridge = require("./terminalBridge.cjs");
    sshBridge.init({ sessions, electronModule: {} });
    sftpBridge.init({ sftpClients: new Map(), sessions, electronModule: {} });
    terminalBridge.init({ sessions, electronModule: {} });

    const ipcMain = makeIpcMain();
    sshBridge.registerHandlers(ipcMain);
    const start = ipcMain.handlers.get("magiesTerminal:start");

    const { sessionId } = await start(
      { sender: makeSender() },
      {
        hostname: server.hostname,
        port: server.port,
        username: server.username,
        privateKey: server.privateKey.toString("utf8"),
        verifyHostKeys: false,
      },
    );
    // Registered before the sftp-close hook below so it runs *after* it
    // (node:test runs t.after hooks LIFO) — tear down the SFTP channel
    // before ending the real shared connection it was riding on.
    t.after(() => terminalBridge.closeSession({ sender: makeSender() }, { sessionId }));

    const event = { sender: makeSender() };
    const { sftpId } = await sftpBridge.openSftp(event, {
      sourceSessionId: sessionId,
      reuseOnly: true,
      hostname: server.hostname,
    });
    assert.ok(sftpId);
    t.after(() => sftpBridge.closeSftp(event, { sftpId }));

    // No privateKey/auth was supplied for this openSftp call — if this list
    // succeeds, the SFTP channel really did ride the already-authenticated
    // terminal connection rather than opening (or silently failing to open) one.
    const listing = await sftpBridge.listSftp(event, { sftpId, path: "." });
    assert.ok(Array.isArray(listing));
  });
});
