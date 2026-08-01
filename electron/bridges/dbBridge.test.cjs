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

// ── schema introspection ────────────────────────────────────────────────────

function createSchemaAdapter(rowsByPattern) {
  const calls = { queries: [] };
  return {
    calls,
    async connect() { return { serverVersion: "16" }; },
    async query(sql, { onRowBatch }) {
      calls.queries.push(sql);
      const key = Object.keys(rowsByPattern).find((k) => sql.includes(k));
      const { columns, rows } = rowsByPattern[key] ?? { columns: [], rows: [] };
      onRowBatch({ columns, rows });
      return { rowCount: rows.length, truncated: false };
    },
    async cancel() {}, async close() {},
  };
}

test("listTables returns normalised tables and views", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "information_schema.tables": {
      columns: [{ name: "name" }, { name: "kind" }],
      rows: [["patients", "table"], ["v_active", "view"]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "s1", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listTables({ connectionId: "s1" });

  assert.equal(result.success, true);
  assert.deepEqual(result.tables, [
    { name: "patients", kind: "table" },
    { name: "v_active", kind: "view" },
  ]);
});

test("listColumns returns name, type, nullability and order", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "information_schema.columns": {
      columns: [{ name: "name" }, { name: "data_type" }, { name: "is_nullable" }, { name: "position" }],
      rows: [["id", "integer", "NO", 1], ["name", "text", "YES", 2]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "s2", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listColumns({ connectionId: "s2", table: "patients" });

  assert.equal(result.success, true);
  assert.deepEqual(result.columns, [
    { name: "id", dataType: "integer", nullable: false, position: 1 },
    { name: "name", dataType: "text", nullable: true, position: 2 },
  ]);
});

test("oracle's Y/N nullability is normalised like everyone else's", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "ALL_TAB_COLUMNS": {
      columns: [{ name: "name" }, { name: "data_type" }, { name: "is_nullable" }, { name: "position" }],
      rows: [["ID", "NUMBER", "N", 1], ["NAME", "VARCHAR2", "Y", 2]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "s3", engine: "oracle", hostId: "", remoteHost: "db", remotePort: 1521, database: "app",
  });

  const result = await dbBridge.listColumns({ connectionId: "s3", table: "PATIENTS" });

  assert.equal(result.columns[0].nullable, false, "N means not nullable");
  assert.equal(result.columns[1].nullable, true, "Y means nullable");
});

test("schema calls on an unknown connection report an error", async () => {
  await dbBridge.stopAllDbConnections();
  setup({ adapter: createSchemaAdapter({}) });
  const tables = await dbBridge.listTables({ connectionId: "nope" });
  assert.equal(tables.success, false);
  assert.match(tables.error, /not found/i);
});

test("the schema calls are reachable over IPC", async () => {
  // The tree runs in the renderer, so unlike queryOnce these do need a channel.
  const handlers = new Map();
  dbBridge.registerHandlers({ handle: (channel, fn) => handlers.set(channel, fn) }, {});

  assert.ok(handlers.has("magiesTerminal:db:listTables"));
  assert.ok(handlers.has("magiesTerminal:db:listColumns"));
});

test("the IPC handlers drop the event and pass only the payload", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "information_schema.tables": {
      columns: [{ name: "name" }, { name: "kind" }],
      rows: [["patients", "table"]],
    },
  });
  const handlers = new Map();
  const { portForwardingBridge } = setup({ adapter });
  dbBridge.registerHandlers(
    { handle: (channel, fn) => handlers.set(channel, fn) },
    { portForwardingBridge, createAdapter: () => adapter },
  );
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "ipc-1", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  // listTables takes ({connectionId}); handing it the event as the first
  // argument would look up `undefined` and report "Connection not found".
  const result = await handlers.get("magiesTerminal:db:listTables")(
    { sender: createSender() },
    { connectionId: "ipc-1" },
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.tables, [{ name: "patients", kind: "table" }]);
});

// ── export ──────────────────────────────────────────────────────────────────

test("exporting writes the serialised content to the chosen path", async () => {
  const writes = [];
  const dialog = { showSaveDialog: async () => ({ canceled: false, filePath: "/tmp/out.csv" }) };
  const fs = { writeFile: async (p, data) => writes.push({ path: p, data }) };
  dbBridge.registerHandlers({ handle: () => {} }, { dialog, fs });

  const result = await dbBridge.exportResult({}, {
    content: "id,name\r\n1,Ada",
    defaultFileName: "patients.csv",
    format: "csv",
  });

  assert.equal(result.success, true);
  assert.equal(result.filePath, "/tmp/out.csv");
  assert.deepEqual(writes, [{ path: "/tmp/out.csv", data: "id,name\r\n1,Ada" }]);
});

test("cancelling the save dialog writes nothing and is not an error", async () => {
  let wrote = false;
  const dialog = { showSaveDialog: async () => ({ canceled: true }) };
  const fs = { writeFile: async () => { wrote = true; } };
  dbBridge.registerHandlers({ handle: () => {} }, { dialog, fs });

  const result = await dbBridge.exportResult({}, { content: "x", defaultFileName: "a.csv", format: "csv" });

  assert.equal(result.success, false);
  assert.equal(result.canceled, true);
  assert.ok(!result.error, "a cancel is a choice, not a failure to report");
  assert.equal(wrote, false);
});

test("a failed write is reported rather than swallowed", async () => {
  const dialog = { showSaveDialog: async () => ({ canceled: false, filePath: "/nope/out.csv" }) };
  const fs = { writeFile: async () => { throw new Error("EACCES: permission denied"); } };
  dbBridge.registerHandlers({ handle: () => {} }, { dialog, fs });

  const result = await dbBridge.exportResult({}, { content: "x", defaultFileName: "a.csv", format: "csv" });

  assert.equal(result.success, false);
  assert.match(result.error, /permission denied/);
});

test("the export handler is reachable over IPC", async () => {
  const handlers = new Map();
  dbBridge.registerHandlers({ handle: (channel, fn) => handlers.set(channel, fn) }, {});
  assert.ok(handlers.has("magiesTerminal:db:exportResult"));
});

test("listRoutines normalises procedures and functions", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "information_schema.routines": {
      columns: [{ name: "name" }, { name: "kind" }],
      rows: [["sp_admit", "procedure"], ["fn_age", "function"]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "r1", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listRoutines({ connectionId: "r1" });

  assert.equal(result.success, true);
  assert.deepEqual(result.routines, [
    { name: "sp_admit", kind: "procedure" },
    { name: "fn_age", kind: "function" },
  ]);
});

test("an unrecognised routine kind is reported as a function", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "information_schema.routines": {
      columns: [{ name: "name" }, { name: "kind" }],
      rows: [["odd", "aggregate"]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "r2", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listRoutines({ connectionId: "r2" });
  assert.equal(result.routines[0].kind, "function", "anything callable that is not a procedure");
});

test("listTriggers keeps the owning table", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "information_schema.triggers": {
      columns: [{ name: "name" }, { name: "table_name" }],
      rows: [["trg_audit", "patients"]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "t1", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listTriggers({ connectionId: "t1" });

  assert.equal(result.success, true);
  assert.deepEqual(result.triggers, [{ name: "trg_audit", table: "patients" }]);
});

test("routine and trigger calls are reachable over IPC", async () => {
  const handlers = new Map();
  dbBridge.registerHandlers({ handle: (channel, fn) => handlers.set(channel, fn) }, {});
  assert.ok(handlers.has("magiesTerminal:db:listRoutines"));
  assert.ok(handlers.has("magiesTerminal:db:listTriggers"));
});

test("listIndexes groups the per-column rows into one entry per index", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "pg_index": {
      columns: [{ name: "name" }, { name: "column_name" }, { name: "position" }, { name: "is_unique" }],
      rows: [
        ["idx_visit", "patient_id", 1, false],
        ["idx_visit", "visited_at", 2, false],
        ["patients_pkey", "id", 1, true],
      ],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "i1", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listIndexes({ connectionId: "i1", table: "visits" });

  assert.equal(result.success, true);
  assert.deepEqual(result.indexes, [
    // Column order is part of the index: (patient_id, visited_at) is not the
    // same index as (visited_at, patient_id).
    { name: "idx_visit", unique: false, columns: ["patient_id", "visited_at"] },
    { name: "patients_pkey", unique: true, columns: ["id"] },
  ]);
});

test("index uniqueness survives the numeric form some engines return", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "pg_index": {
      columns: [{ name: "name" }, { name: "column_name" }, { name: "position" }, { name: "is_unique" }],
      // Oracle and SQL Server hand back 1/0 rather than a boolean.
      rows: [["u_idx", "code", 1, 1], ["n_idx", "note", 1, 0]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "i2", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listIndexes({ connectionId: "i2", table: "t" });
  assert.equal(result.indexes[0].unique, true);
  assert.equal(result.indexes[1].unique, false);
});

test("listForeignKeys reports the column and what it points at", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "FOREIGN KEY": {
      columns: [
        { name: "name" }, { name: "table_name" }, { name: "column_name" },
        { name: "referenced_table" }, { name: "referenced_column" },
      ],
      rows: [["fk_visit_patient", "visits", "patient_id", "patients", "id"]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "f1", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.listForeignKeys({ connectionId: "f1", table: "visits" });

  assert.equal(result.success, true);
  assert.deepEqual(result.foreignKeys, [{
    name: "fk_visit_patient", table: "visits", column: "patient_id",
    referencedTable: "patients", referencedColumn: "id",
  }]);
});

test("index and foreign key calls are reachable over IPC", async () => {
  const handlers = new Map();
  dbBridge.registerHandlers({ handle: (channel, fn) => handlers.set(channel, fn) }, {});
  assert.ok(handlers.has("magiesTerminal:db:listIndexes"));
  assert.ok(handlers.has("magiesTerminal:db:listForeignKeys"));
});

// ── table DDL ───────────────────────────────────────────────────────────────

test("mysql returns the server's own CREATE TABLE", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "SHOW CREATE TABLE": {
      columns: [{ name: "Table" }, { name: "Create Table" }],
      rows: [["patients", "CREATE TABLE `patients` (\n  `id` int NOT NULL AUTO_INCREMENT\n)"]],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "d1", engine: "mysql", hostId: "", remoteHost: "db", remotePort: 3306, database: "app",
  });

  const result = await dbBridge.getTableDdl({ connectionId: "d1", table: "patients" });

  assert.equal(result.success, true);
  assert.equal(result.native, true, "the server's own DDL, not a reconstruction");
  // AUTO_INCREMENT is exactly what a reconstruction would lose.
  assert.match(result.ddl, /AUTO_INCREMENT/);
});

test("postgres reconstructs the statement from the catalog", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "information_schema.columns": {
      columns: [{ name: "name" }, { name: "data_type" }, { name: "is_nullable" }, { name: "position" }],
      rows: [["id", "integer", "NO", 1], ["note", "text", "YES", 2]],
    },
    "PRIMARY KEY": {
      columns: [{ name: "name" }, { name: "position" }],
      rows: [["id", 1]],
    },
    "FOREIGN KEY": { columns: [], rows: [] },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "d2", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.getTableDdl({ connectionId: "d2", table: "patients" });

  assert.equal(result.success, true);
  assert.equal(result.native, false, "a reconstruction must not claim to be the server's DDL");
  assert.match(result.ddl, /CREATE TABLE "patients"/);
  assert.match(result.ddl, /"id" integer NOT NULL/);
  assert.match(result.ddl, /PRIMARY KEY \("id"\)/);
  assert.match(result.ddl, /Reconstructed/i, "the caveat must travel with the statement");
});

test("a table that does not exist reports an error rather than empty DDL", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({});
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "d3", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  const result = await dbBridge.getTableDdl({ connectionId: "d3", table: "nope" });
  assert.equal(result.success, false);
  assert.match(result.error, /column|not found|no such/i);
});

test("the DDL call is reachable over IPC", async () => {
  const handlers = new Map();
  dbBridge.registerHandlers({ handle: (channel, fn) => handlers.set(channel, fn) }, {});
  assert.ok(handlers.has("magiesTerminal:db:getTableDdl"));
});

test("listForeignKeys without a table returns the whole schema, tagged by table", async () => {
  await dbBridge.stopAllDbConnections();
  const adapter = createSchemaAdapter({
    "FOREIGN KEY": {
      columns: [
        { name: "name" }, { name: "table_name" }, { name: "column_name" },
        { name: "referenced_table" }, { name: "referenced_column" },
      ],
      rows: [
        ["fk_v", "visits", "patient_id", "patients", "id"],
        ["fk_m", "meds", "visit_id", "visits", "id"],
      ],
    },
  });
  setup({ adapter });
  await dbBridge.connect({ sender: createSender() }, {
    connectionId: "er1", engine: "postgres", hostId: "", remoteHost: "db", remotePort: 5432, database: "app",
  });

  // The ER diagram needs one query, not one per table.
  const result = await dbBridge.listForeignKeys({ connectionId: "er1" });

  assert.equal(result.success, true);
  assert.deepEqual(result.foreignKeys, [
    { name: "fk_v", table: "visits", column: "patient_id", referencedTable: "patients", referencedColumn: "id" },
    { name: "fk_m", table: "meds", column: "visit_id", referencedTable: "visits", referencedColumn: "id" },
  ]);
});
