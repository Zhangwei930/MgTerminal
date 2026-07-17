const test = require("node:test");
const assert = require("node:assert/strict");

const terminalBridge = require("./terminalBridge.cjs");
const sessionFollowManager = require("./sessionFollowManager.cjs");

function createWebContentsRegistry() {
  const byId = new Map();
  return {
    contents(id) {
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          sent: [],
          send(channel, payload) {
            this.sent.push([channel, payload]);
          },
          isDestroyed: () => false,
        });
      }
      return byId.get(id);
    },
  };
}

function setupWorkerMode({ ownerWebContentsId = 7, sessionId = "sess-1" } = {}) {
  const registry = createWebContentsRegistry();
  const taps = [];
  const sent = [];
  const terminalWorkerManager = {
    request: async () => ({}),
    send(channel, payload, options) {
      sent.push([channel, payload, options]);
    },
    hasOpenSession: (id) => id === sessionId,
    getSessionWebContentsId: (id) => (id === sessionId ? ownerWebContentsId : undefined),
    addOutputTap(listener) {
      taps.push(listener);
      return () => {};
    },
  };
  terminalBridge.init({
    sessions: new Map(),
    electronModule: { webContents: { fromId: (id) => registry.contents(id) } },
  });
  const handlers = new Map();
  const listeners = new Map();
  terminalBridge.registerHandlers(
    {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: (channel, listener) => listeners.set(channel, listener),
    },
    { terminalWorkerManager },
  );
  return { registry, taps, sent, handlers, listeners, sessionId, ownerWebContentsId };
}

test.beforeEach(() => {
  sessionFollowManager.__resetForTests();
});

test("worker mode registers follow and LAN invite IPC handlers", () => {
  const { handlers } = setupWorkerMode();
  for (const channel of [
    "magiesTerminal:follow:start",
    "magiesTerminal:follow:stop",
    "magiesTerminal:follow:join",
    "magiesTerminal:follow:leave",
    "magiesTerminal:follow:requestControl",
    "magiesTerminal:follow:grantControl",
    "magiesTerminal:follow:revokeControl",
    "magiesTerminal:follow:getState",
    "magiesTerminal:follow:lanCreateInvite",
    "magiesTerminal:follow:lanStopInvite",
    "magiesTerminal:follow:lanGetInvite",
    "magiesTerminal:follow:lanDecodeInvite",
    "magiesTerminal:follow:lanConnect",
  ]) {
    assert.equal(handlers.has(channel), true, `missing handler ${channel}`);
  }
});

test("follow start succeeds for the session owner window in worker mode", () => {
  const { handlers, registry, sessionId } = setupWorkerMode();
  const start = handlers.get("magiesTerminal:follow:start");
  const result = start({ sender: registry.contents(7) }, { sessionId, displayName: "Host" });
  assert.equal(result.success, true);
  assert.equal(result.state.peerCount, 1);
});

test("follow start rejects unknown sessions and non-owner windows", () => {
  const { handlers, registry, sessionId } = setupWorkerMode();
  const start = handlers.get("magiesTerminal:follow:start");

  const missing = start({ sender: registry.contents(7) }, { sessionId: "nope" });
  assert.equal(missing.success, false);

  const foreign = start({ sender: registry.contents(8) }, { sessionId });
  assert.equal(foreign.success, false);
  assert.equal(sessionFollowManager.getState(sessionId), null);
});

test("worker write forward blocks non-controller viewers and notifies them", () => {
  const { handlers, listeners, registry, sent, sessionId } = setupWorkerMode();
  handlers.get("magiesTerminal:follow:start")(
    { sender: registry.contents(7) },
    { sessionId, displayName: "Host" },
  );
  handlers.get("magiesTerminal:follow:join")(
    { sender: registry.contents(8) },
    { sessionId, displayName: "Viewer" },
  );

  const write = listeners.get("magiesTerminal:write");
  write({ sender: registry.contents(8) }, { sessionId, data: "rm -rf /\r" });
  assert.equal(sent.length, 0, "viewer input must not reach the worker");
  assert.deepEqual(registry.contents(8).sent.at(-1), [
    "magiesTerminal:follow:inputDenied",
    { sessionId, reason: "not_controller" },
  ]);

  write({ sender: registry.contents(7) }, { sessionId, data: "ls\r" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "magiesTerminal:write");
  assert.equal(sent[0][1].data, "ls\r");
});

test("worker output tap fans terminal data out to viewer windows only", () => {
  const { handlers, registry, taps, sessionId } = setupWorkerMode();
  handlers.get("magiesTerminal:follow:start")(
    { sender: registry.contents(7) },
    { sessionId, displayName: "Host" },
  );
  handlers.get("magiesTerminal:follow:join")(
    { sender: registry.contents(8) },
    { sessionId, displayName: "Viewer" },
  );
  assert.ok(taps.length > 0, "worker mode must install an output tap for follow fan-out");

  for (const tap of taps) tap(sessionId, "hello");

  const viewerData = registry.contents(8).sent.filter(([channel]) => channel === "magiesTerminal:data");
  assert.deepEqual(viewerData, [["magiesTerminal:data", { sessionId, data: "hello" }]]);
  const ownerData = registry.contents(7).sent.filter(([channel]) => channel === "magiesTerminal:data");
  assert.equal(ownerData.length, 0, "owner already receives output via its own channel");
});

test("in-process mode also rejects follow start from a non-owner window", () => {
  const registry = createWebContentsRegistry();
  const sessions = new Map([["sess-direct", { webContentsId: 7 }]]);
  terminalBridge.init({
    sessions,
    electronModule: { webContents: { fromId: (id) => registry.contents(id) } },
  });
  const handlers = new Map();
  terminalBridge.registerHandlers({
    handle: (channel, handler) => handlers.set(channel, handler),
    on: () => {},
  });

  const start = handlers.get("magiesTerminal:follow:start");
  const foreign = start({ sender: registry.contents(9) }, { sessionId: "sess-direct" });
  assert.equal(foreign.success, false);

  const owner = start({ sender: registry.contents(7) }, { sessionId: "sess-direct" });
  assert.equal(owner.success, true);
});
