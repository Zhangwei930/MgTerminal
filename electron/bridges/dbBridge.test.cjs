const test = require("node:test");
const assert = require("node:assert/strict");

const dbBridge = require("./dbBridge.cjs");

function createSender(onSend = () => {}) {
  return {
    id: 1,
    isDestroyed: () => false,
    send: (channel, payload) => onSend(channel, payload),
  };
}

function createFakePortForwardingBridge({ shouldFail = false } = {}) {
  const stopped = [];
  return {
    stopped,
    async startPortForward(_event, payload) {
      if (shouldFail) return { tunnelId: payload.tunnelId, success: false, error: "boom" };
      return { tunnelId: payload.tunnelId, success: true };
    },
    async stopPortForward(_event, { tunnelId }) {
      stopped.push(tunnelId);
      return { tunnelId, success: true };
    },
  };
}

function createFakeAdapter({ connectResult = { serverVersion: "1.0" } } = {}) {
  const calls = { connect: 0, query: [], cancel: 0, close: 0 };
  return {
    calls,
    async connect(opts) {
      calls.connect += 1;
      calls.connectOpts = opts;
      return connectResult;
    },
    async query(sql, { onRowBatch }) {
      calls.query.push(sql);
      onRowBatch({ columns: [{ name: "id", type: "number" }], rows: [[1]] });
      return { rowCount: 1, truncated: false };
    },
    async cancel() {
      calls.cancel += 1;
    },
    async close() {
      calls.close += 1;
    },
  };
}

function setup(overrides = {}) {
  const portForwardingBridge = overrides.portForwardingBridge ?? createFakePortForwardingBridge();
  const adapter = overrides.adapter ?? createFakeAdapter();
  const createAdapter = overrides.createAdapter ?? (() => adapter);
  const registerHandlers = (ipcMain) => dbBridge.registerHandlers(ipcMain, { portForwardingBridge, createAdapter });
  registerHandlers({ handle: () => {} });
  return { portForwardingBridge, adapter };
}

test("connect opens a tunnel then the adapter, tracking the connection", async () => {
  const { adapter } = setup();
  const event = { sender: createSender() };

  const result = await dbBridge.connect(event, {
    connectionId: "c1",
    engine: "mysql",
    sshOptions: { hostname: "db.internal", username: "root" },
    remoteHost: "127.0.0.1",
    remotePort: 3306,
    dbUsername: "root",
    dbPassword: "secret",
  });

  assert.equal(result.success, true);
  assert.equal(result.serverVersion, "1.0");
  assert.equal(adapter.calls.connect, 1);
  assert.equal(adapter.calls.connectOpts.host, "127.0.0.1");

  await dbBridge.closeConnection(event, { connectionId: "c1" });
});

test("connect tears down the tunnel if the driver connect fails", async () => {
  const failingAdapter = createFakeAdapter();
  failingAdapter.connect = async () => { throw new Error("auth failed"); };
  const { portForwardingBridge } = setup({ adapter: failingAdapter });
  const event = { sender: createSender() };

  await assert.rejects(
    () => dbBridge.connect(event, {
      connectionId: "c2", engine: "mysql", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
    }),
    /auth failed/,
  );
  assert.deepEqual(portForwardingBridge.stopped, ["db-c2"]);
});

test("connect surfaces a tunnel failure without touching the driver", async () => {
  const portForwardingBridge = createFakePortForwardingBridge({ shouldFail: true });
  const adapter = createFakeAdapter();
  setup({ portForwardingBridge, adapter });
  const event = { sender: createSender() };

  await assert.rejects(
    () => dbBridge.connect(event, {
      connectionId: "c3", engine: "mysql", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
    }),
    /boom/,
  );
  assert.equal(adapter.calls.connect, 0);
});

test("query returns a queryId immediately and streams rows/complete afterward", async () => {
  const { adapter } = setup();
  const event = { sender: createSender() };
  await dbBridge.connect(event, {
    connectionId: "c4", engine: "mysql", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
  });

  const sent = [];
  const streamEvent = { sender: createSender((channel, payload) => sent.push({ channel, payload })) };
  const immediate = dbBridge.query(streamEvent, { connectionId: "c4", queryId: "q1", sql: "SELECT 1" });
  assert.deepEqual(immediate, { queryId: "q1" });

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(adapter.calls.query[0], "SELECT 1");
  const rowsEvent = sent.find((e) => e.channel === "magiesTerminal:db:query:rows");
  const completeEvent = sent.find((e) => e.channel === "magiesTerminal:db:query:complete");
  assert.deepEqual(rowsEvent.payload.rows, [[1]]);
  assert.equal(completeEvent.payload.rowCount, 1);

  await dbBridge.closeConnection(event, { connectionId: "c4" });
});

test("query on an unknown connection sends an error event instead of throwing", async () => {
  setup();
  const sent = [];
  const streamEvent = { sender: createSender((channel, payload) => sent.push({ channel, payload })) };
  const result = dbBridge.query(streamEvent, { connectionId: "missing", queryId: "q2", sql: "SELECT 1" });
  assert.deepEqual(result, { queryId: "q2" });
  const errorEvent = sent.find((e) => e.channel === "magiesTerminal:db:query:error");
  assert.match(errorEvent.payload.error, /not found/i);
});

test("closeConnection closes the adapter and stops the tunnel", async () => {
  const { adapter, portForwardingBridge } = setup();
  const event = { sender: createSender() };
  await dbBridge.connect(event, {
    connectionId: "c5", engine: "mysql", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
  });

  const result = await dbBridge.closeConnection(event, { connectionId: "c5" });
  assert.equal(result.success, true);
  assert.equal(adapter.calls.close, 1);
  assert.deepEqual(portForwardingBridge.stopped, ["db-c5"]);
});

test("cancelQuery delegates to the adapter's cancel", async () => {
  const { adapter } = setup();
  const event = { sender: createSender() };
  await dbBridge.connect(event, {
    connectionId: "c6", engine: "mysql", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
  });

  const result = await dbBridge.cancelQuery(event, { connectionId: "c6" });
  assert.equal(result.success, true);
  assert.equal(adapter.calls.cancel, 1);

  await dbBridge.closeConnection(event, { connectionId: "c6" });
});

test("stopAllDbConnections closes every tracked connection and clears the map", async () => {
  const { adapter, portForwardingBridge } = setup();
  const event = { sender: createSender() };
  await dbBridge.connect(event, {
    connectionId: "c7", engine: "mysql", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
  });

  await dbBridge.stopAllDbConnections();
  assert.equal(adapter.calls.close, 1);
  assert.deepEqual(portForwardingBridge.stopped, ["db-c7"]);

  const closeResult = await dbBridge.closeConnection(event, { connectionId: "c7" });
  assert.equal(closeResult.success, false);
});
