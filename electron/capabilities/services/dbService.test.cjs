const test = require("node:test");
const assert = require("node:assert/strict");

const { createDbService } = require("./dbService.cjs");

function createFakeDbBridge(overrides = {}) {
  const calls = { queryOnce: [], listConnections: 0 };
  return {
    calls,
    listConnections() {
      calls.listConnections += 1;
      return overrides.connections ?? [
        {
          connectionId: "c1",
          engine: "postgres",
          database: "clinic",
          remoteHost: "10.0.0.5",
          remotePort: 5432,
          serverVersion: "16.2",
          connectedAt: 1_700_000_000_000,
        },
      ];
    },
    async queryOnce(payload) {
      calls.queryOnce.push(payload);
      if (overrides.queryOnce) return overrides.queryOnce(payload);
      return {
        connectionId: payload.connectionId,
        success: true,
        columns: [{ name: "id", type: "number" }],
        rows: [[1]],
        rowCount: 1,
        truncated: false,
        durationMs: 3,
      };
    },
  };
}

const service = (bridge) => createDbService({ dbBridge: bridge });

// ── listConnections ─────────────────────────────────────────────────────────

test("listConnections returns the live connections", async () => {
  const bridge = createFakeDbBridge();
  const result = await service(bridge).listConnections({});

  assert.equal(result.ok, true);
  assert.equal(result.connections.length, 1);
  assert.equal(result.connections[0].connectionId, "c1");
  assert.equal(result.connections[0].engine, "postgres");
});

// ── queryReadonly: the security boundary ────────────────────────────────────
//
// db.query.readonly carries policy.write = false, so it never raises an
// approval. If it accepted a write, an agent could run INSERT/UPDATE/DELETE
// through it and never hit the confirm prompt that db.query.write exists to
// force. Rejecting non-read SQL here is what keeps the two capabilities honest.

test("queryReadonly runs a plain read", async () => {
  const bridge = createFakeDbBridge();
  const result = await service(bridge).queryReadonly({ connectionId: "c1", sql: "SELECT * FROM patients" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, [[1]]);
  assert.equal(bridge.calls.queryOnce.length, 1);
});

test("queryReadonly refuses writes instead of quietly running them", async () => {
  for (const sql of [
    "DELETE FROM patients",
    "UPDATE patients SET name = 'x'",
    "INSERT INTO patients VALUES (1)",
    "DROP TABLE patients",
    "SELECT 1; DELETE FROM patients",
    "WITH gone AS (DELETE FROM t RETURNING *) SELECT * FROM gone",
    "/*x*/ TRUNCATE TABLE patients",
  ]) {
    const bridge = createFakeDbBridge();
    const result = await service(bridge).queryReadonly({ connectionId: "c1", sql });

    assert.equal(result.ok, false, `should have been refused: ${sql}`);
    assert.match(result.error, /read-only|db_query_write/i);
    assert.equal(
      bridge.calls.queryOnce.length,
      0,
      `refusal must happen before the statement reaches the database: ${sql}`,
    );
  }
});

test("queryReadonly names the write capability so the agent can retry correctly", async () => {
  const bridge = createFakeDbBridge();
  const result = await service(bridge).queryReadonly({ connectionId: "c1", sql: "DELETE FROM t" });

  assert.match(result.error, /db_query_write/);
});

test("queryReadonly requires a connectionId and sql", async () => {
  const bridge = createFakeDbBridge();
  const svc = service(bridge);

  assert.equal((await svc.queryReadonly({ sql: "SELECT 1" })).ok, false);
  assert.equal((await svc.queryReadonly({ connectionId: "c1" })).ok, false);
  assert.equal((await svc.queryReadonly({ connectionId: "c1", sql: "   " })).ok, false);
  assert.equal(bridge.calls.queryOnce.length, 0);
});

// ── queryWrite ──────────────────────────────────────────────────────────────

test("queryWrite runs INSERT, UPDATE and DELETE", async () => {
  for (const sql of [
    "INSERT INTO patients (name) VALUES ('a')",
    "UPDATE patients SET name = 'b' WHERE id = 1",
    "DELETE FROM patients WHERE id = 1",
  ]) {
    const bridge = createFakeDbBridge();
    const result = await service(bridge).queryWrite({ connectionId: "c1", sql });

    assert.equal(result.ok, true, `should have run: ${sql}`);
    assert.equal(bridge.calls.queryOnce[0].sql, sql);
  }
});

test("queryWrite also accepts reads — approval already happened upstream", async () => {
  const bridge = createFakeDbBridge();
  const result = await service(bridge).queryWrite({ connectionId: "c1", sql: "SELECT 1" });

  assert.equal(result.ok, true);
});

// ── error propagation ───────────────────────────────────────────────────────

test("a failed query is reported as ok:false with the database's message", async () => {
  const bridge = createFakeDbBridge({
    queryOnce: async () => ({ success: false, error: 'relation "nope" does not exist' }),
  });
  const result = await service(bridge).queryReadonly({ connectionId: "c1", sql: "SELECT * FROM nope" });

  assert.equal(result.ok, false);
  assert.match(result.error, /relation "nope" does not exist/);
});

test("truncation is surfaced so the agent does not treat a partial result as complete", async () => {
  const bridge = createFakeDbBridge({
    queryOnce: async () => ({
      success: true, columns: [], rows: [[1]], rowCount: 1, truncated: true, durationMs: 1,
    }),
  });
  const result = await service(bridge).queryReadonly({ connectionId: "c1", sql: "SELECT * FROM big" });

  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
});

test("maxRows is passed through to the bridge, which owns the ceiling", async () => {
  const bridge = createFakeDbBridge();
  await service(bridge).queryReadonly({ connectionId: "c1", sql: "SELECT 1", maxRows: 50 });

  assert.equal(bridge.calls.queryOnce[0].maxRows, 50);
});
