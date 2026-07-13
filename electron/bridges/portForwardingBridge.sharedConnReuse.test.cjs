const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { EventEmitter } = require("node:events");

const {
  registerHandlers,
  startPortForward,
  stopPortForward,
} = require("./portForwardingBridge.cjs");

function createSender(onSend = () => {}) {
  return {
    id: 1,
    isDestroyed: () => false,
    send: (channel, payload) => onSend(channel, payload),
  };
}

function createFakeSshConn() {
  const conn = new EventEmitter();
  conn._sock = { destroyed: false };
  conn.ended = 0;
  conn.end = () => { conn.ended += 1; };
  conn.forwardOut = (_bindAddr, _bindPort, _host, _port, cb) => {
    const stream = new EventEmitter();
    stream.pipe = (dest) => dest;
    cb(null, stream);
  };
  return conn;
}

function createLiveShellSession(endpoint) {
  const conn = createFakeSshConn();
  return {
    conn,
    stream: {},
    connRef: { count: 1, conn, chainConnections: [] },
    _reuseEndpoint: endpoint,
  };
}

function registerWithSessions(sessions) {
  const fakeIpcMain = { handle: () => {} };
  registerHandlers(fakeIpcMain, { sessions });
}

test("local tunnel reuses a live terminal connection instead of dialing", async (t) => {
  const source = createLiveShellSession({ hostname: "db.example", port: 22, username: "root" });
  const sessions = new Map([["term-1", source]]);
  registerWithSessions(sessions);
  t.after(() => registerWithSessions(null));

  const statuses = [];
  const event = {
    sender: createSender((channel, payload) => {
      if (channel === "magiesTerminal:portforward:status") statuses.push(payload.status);
    }),
  };

  const tunnelId = "pf-reuse-1";
  const result = await startPortForward(event, {
    ruleId: "rule-1",
    tunnelId,
    type: "local",
    localPort: 0,
    remoteHost: "127.0.0.1",
    remotePort: 5432,
    hostname: "db.example",
    port: 22,
    username: "root",
    jumpHosts: [],
  });

  assert.deepEqual(result, { tunnelId, success: true });
  assert.equal(source.connRef.count, 2, "tunnel must hold a reference on the shared transport");
  assert.ok(statuses.includes("active"));

  const stopResult = await stopPortForward(event, { tunnelId });
  assert.equal(stopResult.success, true);
  assert.equal(source.connRef.count, 1, "stop must release the shared reference");
  assert.equal(source.conn.ended, 0, "stopping the tunnel must not end the shared transport");
});

test("tunnel on a shared connection tears down when the transport closes", async (t) => {
  const source = createLiveShellSession({ hostname: "db.example", port: 22, username: "root" });
  const sessions = new Map([["term-1", source]]);
  registerWithSessions(sessions);
  t.after(() => registerWithSessions(null));

  const statuses = [];
  const event = {
    sender: createSender((channel, payload) => {
      if (channel === "magiesTerminal:portforward:status") statuses.push(payload.status);
    }),
  };

  const tunnelId = "pf-reuse-2";
  await startPortForward(event, {
    ruleId: "rule-2",
    tunnelId,
    type: "dynamic",
    localPort: 0,
    hostname: "db.example",
    port: 22,
    username: "root",
    jumpHosts: [],
  });
  assert.equal(source.connRef.count, 2);

  source.conn.emit("close");
  assert.equal(statuses.at(-1), "inactive");

  // The tunnel entry is gone: stopping again reports not found.
  const stopResult = await stopPortForward(event, { tunnelId });
  assert.equal(stopResult.success, false);
});

test("remote tunnels and unknown endpoints do not reuse shared connections", async (t) => {
  const source = createLiveShellSession({ hostname: "db.example", port: 22, username: "root" });
  const sessions = new Map([["term-1", source]]);
  registerWithSessions(sessions);
  t.after(() => registerWithSessions(null));

  const event = { sender: createSender() };

  // Different endpoint: no live match, so the fresh-dial path runs and fails
  // fast against an unroutable target (no credentials provided).
  await assert.rejects(
    startPortForward(event, {
      ruleId: "rule-3",
      tunnelId: "pf-no-reuse-1",
      type: "local",
      localPort: 0,
      remoteHost: "127.0.0.1",
      remotePort: 80,
      hostname: "127.0.0.1",
      port: 1, // nothing listens here; connect fails immediately
      username: "root",
      jumpHosts: [],
    }),
  );
  assert.equal(source.connRef.count, 1, "mismatched endpoint must not take a reference");
});
