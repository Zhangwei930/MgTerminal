/**
 * Real integration test: sshBridge opens a real interactive shell session
 * over a real throwaway sshd, and terminalBridge writes to it — the same
 * shared `sessions` map both bridges use in the real app. Reads the shell
 * channel's raw stream directly rather than going through the IPC-facing
 * emitTerminalSessionData path, since that path is irrelevant to what's
 * under test here.
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

function waitForOutput(getBuffer, pattern, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (pattern.test(getBuffer())) return resolve();
      if (Date.now() > deadline) {
        return reject(new Error(`timed out waiting for ${pattern}; got: ${JSON.stringify(getBuffer())}`));
      }
      setTimeout(poll, 50);
    };
    poll();
  });
}

test("a real interactive shell session echoes a command written through terminalBridge", async (t) => {
  await withTestSshServer(t, {}, async (server) => {
    const sessions = new Map();
    const sshBridge = require("./sshBridge.cjs");
    const terminalBridge = require("./terminalBridge.cjs");
    sshBridge.init({ sessions, electronModule: {} });
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
        cols: 80,
        rows: 24,
      },
    );
    t.after(() => terminalBridge.closeSession({ sender: makeSender() }, { sessionId }));

    const session = sessions.get(sessionId);
    assert.ok(session?.stream, "expected a real shell stream on the session");

    let buffer = "";
    session.stream.on("data", (chunk) => { buffer += chunk.toString(); });

    terminalBridge.writeToSession({ sender: makeSender() }, { sessionId, data: "echo hello-from-shell\r" });

    await waitForOutput(() => buffer, /hello-from-shell/);
  });
});
