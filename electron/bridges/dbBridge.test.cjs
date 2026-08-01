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
    hostId: "h1",
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
      connectionId: "c2", engine: "mysql", hostId: "h1", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
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
      connectionId: "c3", engine: "mysql", hostId: "h1", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
    }),
    /boom/,
  );
  assert.equal(adapter.calls.connect, 0);
});

test("query returns a queryId immediately and streams rows/complete afterward", async () => {
  const { adapter } = setup();
  const event = { sender: createSender() };
  await dbBridge.connect(event, {
    connectionId: "c4", engine: "mysql", hostId: "h1", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
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
    connectionId: "c5", engine: "mysql", hostId: "h1", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
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
    connectionId: "c6", engine: "mysql", hostId: "h1", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
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
    connectionId: "c7", engine: "mysql", hostId: "h1", sshOptions: {}, remoteHost: "127.0.0.1", remotePort: 3306,
  });

  await dbBridge.stopAllDbConnections();
  assert.equal(adapter.calls.close, 1);
  assert.deepEqual(portForwardingBridge.stopped, ["db-c7"]);

  const closeResult = await dbBridge.closeConnection(event, { connectionId: "c7" });
  assert.equal(closeResult.success, false);
});

// ── queryOnce / listConnections ─────────────────────────────────────────────
//
// The streaming query() pushes rows to event.sender, which only exists for a
// BrowserWindow. Capability callers reach the app over TCP (MCP) or RPC (CLI)
// and have no sender, so they need a request/response form that resolves with
// the whole result.

function createBatchingAdapter({ batches, result, delayMs = 0, throwError = null }) {
  const calls = { cancel: 0, queries: [] };
  return {
    calls,
    async connect() { return { serverVersion: "1.0" }; },
    async query(sql, { maxRows, onRowBatch }) {
      calls.queries.push({ sql, maxRows });
      if (throwError) throw throwError;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      for (const batch of batches) onRowBatch(batch);
      return result;
    },
    async cancel() { calls.cancel += 1; },
    async close() {},
  };
}

async function connectWith(adapter, overrides = {}) {
  // dbConnections is module-level state shared across tests. Without this,
  // these cases only pass because they happen to reuse one connectionId.
  await dbBridge.stopAllDbConnections();
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "c1",
    engine: "postgres",
    sshOptions: { hostname: "db.internal", username: "root" },
    remoteHost: "10.0.0.5",
    remotePort: 5432,
    database: "clinic",
    dbUsername: "reader",
    dbPassword: "secret",
    ...overrides,
  });
}

test("queryOnce resolves with the full result and needs no sender", async () => {
  const adapter = createBatchingAdapter({
    batches: [
      { columns: [{ name: "id", type: "number" }, { name: "name", type: "string" }], rows: [[1, "a"]] },
      { rows: [[2, "b"], [3, "c"]] },
    ],
    result: { rowCount: 3, truncated: false },
  });
  await connectWith(adapter);

  const result = await dbBridge.queryOnce({ connectionId: "c1", sql: "SELECT * FROM t" });

  assert.equal(result.success, true);
  assert.deepEqual(result.columns, [{ name: "id", type: "number" }, { name: "name", type: "string" }]);
  assert.deepEqual(result.rows, [[1, "a"], [2, "b"], [3, "c"]], "batches are concatenated in order");
  assert.equal(result.rowCount, 3);
  assert.equal(result.truncated, false);
  assert.equal(typeof result.durationMs, "number");
});

test("queryOnce reports a missing connection instead of throwing", async () => {
  setup();
  const result = await dbBridge.queryOnce({ connectionId: "nope", sql: "SELECT 1" });

  assert.equal(result.success, false);
  assert.match(result.error, /not found/i);
});

test("queryOnce surfaces adapter failures as an error result", async () => {
  const adapter = createBatchingAdapter({ batches: [], result: {}, throwError: new Error("syntax error at or near") });
  await connectWith(adapter);

  const result = await dbBridge.queryOnce({ connectionId: "c1", sql: "SELEC 1" });

  assert.equal(result.success, false);
  assert.match(result.error, /syntax error/);
});

test("queryOnce clamps maxRows to the ceiling a caller cannot raise", async () => {
  const adapter = createBatchingAdapter({ batches: [], result: { rowCount: 0, truncated: false } });
  await connectWith(adapter);

  await dbBridge.queryOnce({ connectionId: "c1", sql: "SELECT 1", maxRows: 10_000_000 });

  assert.equal(
    adapter.calls.queries[0].maxRows,
    dbBridge.QUERY_ONCE_MAX_ROWS,
    "an unbounded result set would be pulled entirely into memory and into the model's context",
  );
});

test("queryOnce applies a modest default when maxRows is omitted", async () => {
  const adapter = createBatchingAdapter({ batches: [], result: { rowCount: 0, truncated: false } });
  await connectWith(adapter);

  await dbBridge.queryOnce({ connectionId: "c1", sql: "SELECT 1" });

  assert.equal(adapter.calls.queries[0].maxRows, dbBridge.QUERY_ONCE_DEFAULT_ROWS);
  assert.ok(dbBridge.QUERY_ONCE_DEFAULT_ROWS <= dbBridge.QUERY_ONCE_MAX_ROWS);
});

test("queryOnce honours a smaller caller-supplied maxRows", async () => {
  const adapter = createBatchingAdapter({ batches: [], result: { rowCount: 0, truncated: false } });
  await connectWith(adapter);

  await dbBridge.queryOnce({ connectionId: "c1", sql: "SELECT 1", maxRows: 5 });

  assert.equal(adapter.calls.queries[0].maxRows, 5);
});

test("queryOnce cancels and reports a timeout rather than hanging the caller", async () => {
  const adapter = createBatchingAdapter({
    batches: [], result: { rowCount: 0, truncated: false }, delayMs: 200,
  });
  await connectWith(adapter);

  const result = await dbBridge.queryOnce({ connectionId: "c1", sql: "SELECT pg_sleep(60)", timeoutMs: 20 });

  assert.equal(result.success, false);
  assert.match(result.error, /timed out/i);
  assert.equal(adapter.calls.cancel, 1, "a timed-out query must be cancelled, not left running");
});

test("queryOnce passes truncation through so callers know rows were dropped", async () => {
  const adapter = createBatchingAdapter({
    batches: [{ columns: [{ name: "id", type: "number" }], rows: [[1]] }],
    result: { rowCount: 1, truncated: true },
  });
  await connectWith(adapter);

  const result = await dbBridge.queryOnce({ connectionId: "c1", sql: "SELECT * FROM big", maxRows: 1 });

  assert.equal(result.truncated, true);
});

test("listConnections describes live connections without leaking credentials", async () => {
  const adapter = createBatchingAdapter({ batches: [], result: {} });
  await connectWith(adapter);

  const connections = dbBridge.listConnections();

  assert.equal(connections.length, 1);
  const [conn] = connections;
  assert.equal(conn.connectionId, "c1");
  assert.equal(conn.engine, "postgres");
  assert.equal(conn.database, "clinic");
  assert.equal(conn.remoteHost, "10.0.0.5");
  assert.equal(conn.remotePort, 5432);

  const serialised = JSON.stringify(connections);
  assert.ok(!serialised.includes("secret"), "the DB password must never appear");
  assert.ok(!serialised.includes("reader"), "the DB username must never appear");
});

test("listConnections is empty once a connection closes", async () => {
  const adapter = createBatchingAdapter({ batches: [], result: {} });
  await connectWith(adapter);
  await dbBridge.closeConnection({ sender: createSender() }, { connectionId: "c1" });

  assert.deepEqual(dbBridge.listConnections(), []);
});

// ── direct connections (no SSH tunnel) ──────────────────────────────────────
//
// A database reachable from this machine needs no SSH leg. Requiring one was
// why every connection carried both an SSH host and a separate "host address",
// which is easy to fill in wrongly and produces an opaque Connection refused.

test("a connection without a host id skips the tunnel entirely", async () => {
  await dbBridge.stopAllDbConnections();
  const portForwardingBridge = createFakePortForwardingBridge();
  const adapter = createFakeAdapter();
  setup({ portForwardingBridge, adapter });

  const result = await dbBridge.connect({ sender: createSender() }, {
    connectionId: "direct-1",
    engine: "postgres",
    hostId: "",
    remoteHost: "db.example.com",
    remotePort: 5432,
    database: "app",
    dbUsername: "reader",
    dbPassword: "pw",
  });

  assert.equal(result.success, true);
  assert.equal(adapter.calls.connect, 1);
  assert.equal(
    adapter.calls.connectOpts.host,
    "db.example.com",
    "a direct connection dials the database address itself, not a local tunnel port",
  );
  assert.equal(adapter.calls.connectOpts.port, 5432);
});

test("closing a direct connection does not try to stop a tunnel", async () => {
  await dbBridge.stopAllDbConnections();
  const portForwardingBridge = createFakePortForwardingBridge();
  setup({ portForwardingBridge, adapter: createFakeAdapter() });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "direct-2", engine: "postgres", hostId: "",
    remoteHost: "db.example.com", remotePort: 5432,
  });

  const closed = await dbBridge.closeConnection({ sender: createSender() }, { connectionId: "direct-2" });

  assert.equal(closed.success, true);
  assert.deepEqual(portForwardingBridge.stopped, [], "there was never a tunnel to stop");
});

test("a tunnelled connection still goes through the forwarder", async () => {
  await dbBridge.stopAllDbConnections();
  const portForwardingBridge = createFakePortForwardingBridge();
  const adapter = createFakeAdapter();
  setup({ portForwardingBridge, adapter });

  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "tunnelled-1",
    engine: "postgres",
    hostId: "h1",
    sshOptions: { hostname: "jump.example.com", username: "ubuntu" },
    remoteHost: "127.0.0.1",
    remotePort: 55432,
  });

  assert.equal(
    adapter.calls.connectOpts.host,
    "127.0.0.1",
    "a tunnelled connection dials the local forwarded port",
  );
  assert.notEqual(adapter.calls.connectOpts.port, 55432, "it uses the picked local port, not the remote one");
});
