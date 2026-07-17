const assert = require("node:assert/strict");
const test = require("node:test");

const terminalBridge = require("./terminalBridge.cjs");
const sshBridge = require("./sshBridge.cjs");
const sftpBridge = require("./sftpBridge.cjs");
const transferBridge = require("./transferBridge.cjs");
const compressUploadBridge = require("./compressUploadBridge.cjs");
const fileWatcherBridge = require("./fileWatcherBridge.cjs");
const { createSystemManagerBridge } = require("./systemManagerBridge.cjs");

function createFakeIpcMain() {
  return {
    handlers: new Map(),
    listeners: new Map(),
    handle(channel, handler) {
      this.handlers.set(channel, handler);
    },
    on(channel, listener) {
      this.listeners.set(channel, listener);
    },
  };
}

function createFakeWorkerManager() {
  const requests = [];
  const sends = [];
  return {
    requests,
    sends,
    request(channel, payload, options) {
      requests.push({ channel, payload, options });
      return Promise.resolve({ ok: true, channel });
    },
    send(channel, payload, options) {
      sends.push({ channel, payload, options });
    },
    hasOpenSession: () => false,
    getSessionWebContentsId: () => undefined,
    addOutputTap: () => () => {},
  };
}

const fakeEvent = { sender: { id: 42 } };

test("terminal worker mode proxies all terminal starts and control commands", async () => {
  const ipcMain = createFakeIpcMain();
  const terminalWorkerManager = createFakeWorkerManager();

  terminalBridge.registerHandlers(ipcMain, { terminalWorkerManager });

  for (const channel of [
    "magiesTerminal:local:start",
    "magiesTerminal:telnet:start",
    "magiesTerminal:mosh:start",
    "magiesTerminal:et:start",
    "magiesTerminal:serial:start",
  ]) {
    assert.equal(ipcMain.handlers.has(channel), true, `${channel} should be proxied as a request`);
    await ipcMain.handlers.get(channel)(fakeEvent, { sessionId: channel });
  }

  for (const channel of [
    "magiesTerminal:write",
    "magiesTerminal:interrupt",
    "magiesTerminal:resize",
    "magiesTerminal:flow",
    "magiesTerminal:flow:ack",
    "magiesTerminal:close",
  ]) {
    assert.equal(ipcMain.listeners.has(channel), true, `${channel} should be proxied as a send`);
    ipcMain.listeners.get(channel)(fakeEvent, { sessionId: channel });
  }

  assert.deepEqual(
    terminalWorkerManager.requests.map((entry) => entry.channel),
    [
      "magiesTerminal:local:start",
      "magiesTerminal:telnet:start",
      "magiesTerminal:mosh:start",
      "magiesTerminal:et:start",
      "magiesTerminal:serial:start",
    ],
  );
  assert.deepEqual(
    terminalWorkerManager.sends.map((entry) => entry.channel),
    [
      "magiesTerminal:write",
      "magiesTerminal:interrupt",
      "magiesTerminal:resize",
      "magiesTerminal:flow",
      "magiesTerminal:flow:ack",
      "magiesTerminal:close",
    ],
  );
});

test("terminal worker mode proxies SSH session and remote helper requests", async () => {
  const ipcMain = createFakeIpcMain();
  const terminalWorkerManager = createFakeWorkerManager();

  sshBridge.registerHandlers(ipcMain, { terminalWorkerManager });

  for (const channel of [
    "magiesTerminal:start",
    "magiesTerminal:ssh:exec",
    "magiesTerminal:ssh:pwd",
    "magiesTerminal:ssh:remoteInfo",
    "magiesTerminal:ssh:distroInfo",
    "magiesTerminal:ssh:readRemoteHistory",
    "magiesTerminal:ssh:listdir",
    "magiesTerminal:ssh:stats",
    "magiesTerminal:ssh:setEncoding",
  ]) {
    assert.equal(ipcMain.handlers.has(channel), true, `${channel} should be proxied`);
    await ipcMain.handlers.get(channel)(fakeEvent, { sessionId: "ssh-1" });
  }

  assert.deepEqual(
    terminalWorkerManager.requests.map((entry) => entry.channel),
    [
      "magiesTerminal:start",
      "magiesTerminal:ssh:exec",
      "magiesTerminal:ssh:pwd",
      "magiesTerminal:ssh:remoteInfo",
      "magiesTerminal:ssh:distroInfo",
      "magiesTerminal:ssh:readRemoteHistory",
      "magiesTerminal:ssh:listdir",
      "magiesTerminal:ssh:stats",
      "magiesTerminal:ssh:setEncoding",
    ],
  );
});

test("terminal worker mode proxies SFTP and surrounding file operations", async () => {
  const ipcMain = createFakeIpcMain();
  const terminalWorkerManager = createFakeWorkerManager();

  sftpBridge.registerHandlers(ipcMain, { terminalWorkerManager });
  transferBridge.registerHandlers(ipcMain, { terminalWorkerManager });
  compressUploadBridge.registerHandlers(ipcMain, { terminalWorkerManager });
  fileWatcherBridge.registerHandlers(ipcMain, { terminalWorkerManager });

  for (const channel of [
    "magiesTerminal:sftp:openForSession",
    "magiesTerminal:sftp:list",
    "magiesTerminal:sftp:write",
    "magiesTerminal:sftp:downloadToLocal",
    "magiesTerminal:sftp:uploadLocal",
    "magiesTerminal:sftp:close",
    "magiesTerminal:transfer:start",
    "magiesTerminal:transfer:cancel",
    "magiesTerminal:compress:start",
    "magiesTerminal:compress:checkSupport",
    "magiesTerminal:filewatch:start",
    "magiesTerminal:filewatch:registerTempFile",
  ]) {
    assert.equal(ipcMain.handlers.has(channel), true, `${channel} should be proxied`);
    await ipcMain.handlers.get(channel)(fakeEvent, { sessionId: "ssh-1", sftpId: "sftp-1" });
  }

  assert.deepEqual(
    terminalWorkerManager.requests.map((entry) => entry.channel),
    [
      "magiesTerminal:sftp:openForSession",
      "magiesTerminal:sftp:list",
      "magiesTerminal:sftp:write",
      "magiesTerminal:sftp:downloadToLocal",
      "magiesTerminal:sftp:uploadLocal",
      "magiesTerminal:sftp:close",
      "magiesTerminal:transfer:start",
      "magiesTerminal:transfer:cancel",
      "magiesTerminal:compress:start",
      "magiesTerminal:compress:checkSupport",
      "magiesTerminal:filewatch:start",
      "magiesTerminal:filewatch:registerTempFile",
    ],
  );
});

test("terminal worker mode proxies system management requests", async () => {
  const ipcMain = createFakeIpcMain();
  const terminalWorkerManager = createFakeWorkerManager();
  const systemManagerBridge = createSystemManagerBridge({
    getSessions: () => new Map(),
    execOnEtSession: () => {},
    ensureMoshStatsConnection: () => {},
    process,
  });

  systemManagerBridge.registerHandlers(ipcMain, { terminalWorkerManager });

  for (const channel of [
    "magiesTerminal:system:probeCapabilities",
    "magiesTerminal:system:listProcesses",
    "magiesTerminal:system:setupOsc7Tracking",
    "magiesTerminal:system:listTmuxSessions",
    "magiesTerminal:system:listDockerContainers",
  ]) {
    assert.equal(ipcMain.handlers.has(channel), true, `${channel} should be proxied`);
    await ipcMain.handlers.get(channel)(fakeEvent, { sessionId: "ssh-1" });
  }

  assert.deepEqual(
    terminalWorkerManager.requests.map((entry) => entry.channel),
    [
      "magiesTerminal:system:probeCapabilities",
      "magiesTerminal:system:listProcesses",
      "magiesTerminal:system:setupOsc7Tracking",
      "magiesTerminal:system:listTmuxSessions",
      "magiesTerminal:system:listDockerContainers",
    ],
  );
});
