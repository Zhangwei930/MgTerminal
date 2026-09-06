"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createSqliteAdapter, mapColumnType } = require("./sqliteAdapter.cjs");
const {
  buildColumnListQuery,
  buildForeignKeyListQuery,
  buildIndexListQuery,
  buildNativeDdlQuery,
  buildPrimaryKeyQuery,
  buildTableListQuery,
  buildTriggerListQuery,
} = require("./schemaQueries.cjs");

/** Runs one statement and returns the batches it emitted. */
async function run(adapter, sql, maxRows = 1000) {
  const batches = [];
  const result = await adapter.query(sql, { maxRows, onRowBatch: (b) => batches.push(b) });
  const columns = batches.find((b) => b.columns)?.columns ?? [];
  const rows = batches.flatMap((b) => b.rows);
  return { result, columns, rows };
}

async function withDb(body) {
  const adapter = createSqliteAdapter();
  await adapter.connect({ host: ":memory:" });
  try {
    await body(adapter);
  } finally {
    await adapter.close();
  }
}

// ── mapColumnType ───────────────────────────────────────────────────────────
//
// SQLite's declared types are free text, not a fixed set — "VARCHAR(20)",
// "INTEGER", and "" are all legal, and affinity is decided by substring.

test("declared types map onto the shared column-type union", () => {
  assert.equal(mapColumnType("INTEGER"), "number");
  assert.equal(mapColumnType("BIGINT"), "number");
  assert.equal(mapColumnType("REAL"), "number");
  assert.equal(mapColumnType("VARCHAR(20)"), "string");
  assert.equal(mapColumnType("BLOB"), "binary");
  assert.equal(mapColumnType("DATETIME"), "date");
  assert.equal(mapColumnType(""), "string", "an undeclared column is still readable");
  assert.equal(mapColumnType(null), "string");
});

// ── connect ─────────────────────────────────────────────────────────────────

test("connecting reports the SQLite version", async () => {
  await withDb(async (adapter) => {
    // connect() already ran; re-reading proves the handle is usable.
    const { rows } = await run(adapter, "SELECT sqlite_version() AS v");
    assert.ok(rows[0][0]);
  });
});

test("a missing file is reported rather than silently created", async () => {
  const adapter = createSqliteAdapter();
  await assert.rejects(
    () => adapter.connect({ host: "/nonexistent/dir/does-not-exist.db" }),
  );
});

test("an empty path is refused", async () => {
  const adapter = createSqliteAdapter();
  await assert.rejects(() => adapter.connect({ host: "  " }), /file path/i);
});

// ── query shapes ────────────────────────────────────────────────────────────

test("a statement that returns no rows reports how many it changed", async () => {
  await withDb(async (adapter) => {
    await run(adapter, "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
    const { result } = await run(adapter, "INSERT INTO t (name) VALUES ('a'), ('b')");
    assert.equal(result.affectedRows, 2);
    assert.equal(result.rowCount, 0);
  });
});

test("a SELECT comes back row-major with its column types", async () => {
  await withDb(async (adapter) => {
    await run(adapter, "CREATE TABLE t (id INTEGER, name TEXT, payload BLOB)");
    await run(adapter, "INSERT INTO t VALUES (1, 'Ada', X'AABB')");

    const { columns, rows } = await run(adapter, "SELECT * FROM t");
    assert.deepEqual(columns.map((c) => c.name), ["id", "name", "payload"]);
    assert.deepEqual(columns.map((c) => c.type), ["number", "string", "binary"]);
    assert.equal(rows[0][0], 1);
    assert.equal(rows[0][1], "Ada");
    assert.ok(ArrayBuffer.isView(rows[0][2]), "a blob stays bytes, not an object");
  });
});

test("a result larger than maxRows is truncated rather than streamed whole", async () => {
  await withDb(async (adapter) => {
    await run(adapter, "CREATE TABLE t (n INTEGER)");
    await run(adapter, "INSERT INTO t VALUES (1),(2),(3),(4),(5)");
    const { result, rows } = await run(adapter, "SELECT * FROM t ORDER BY n", 3);
    assert.equal(rows.length, 3);
    assert.equal(result.truncated, true);
  });
});

test("a failing statement rejects rather than resolving empty", async () => {
  await withDb(async (adapter) => {
    await assert.rejects(() => run(adapter, "SELECT * FROM no_such_table"));
  });
});

// ── the introspection queries actually run ──────────────────────────────────
//
// These are built as strings by schemaQueries; running them against a real
// database is the only thing that proves the pragma table-valued syntax and
// the quoted keyword columns are right.

test("the generated schema queries run and describe a real table", async () => {
  await withDb(async (adapter) => {
    await run(adapter, `CREATE TABLE parent (id INTEGER PRIMARY KEY, code TEXT NOT NULL)`);
    await run(adapter, `CREATE TABLE child (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER REFERENCES parent(id),
      note TEXT
    )`);
    await run(adapter, `CREATE UNIQUE INDEX ux_child_note ON child (note)`);
    await run(adapter, `CREATE TRIGGER trg AFTER INSERT ON child BEGIN SELECT 1; END`);

    const tables = await run(adapter, buildTableListQuery("sqlite", ""));
    assert.deepEqual(
      tables.rows.map((r) => r[0]).sort(),
      ["child", "parent"],
      "sqlite_% bookkeeping tables must not appear",
    );

    const columns = await run(adapter, buildColumnListQuery("sqlite", "", "parent"));
    assert.deepEqual(columns.rows.map((r) => r[0]), ["id", "code"]);
    assert.equal(columns.rows[1][2], "NO", "a NOT NULL column reports NO");

    const pk = await run(adapter, buildPrimaryKeyQuery("sqlite", "", "parent"));
    assert.deepEqual(pk.rows.map((r) => r[0]), ["id"]);

    const indexes = await run(adapter, buildIndexListQuery("sqlite", "", "child"));
    assert.ok(
      indexes.rows.some((r) => r[0] === "ux_child_note" && r[1] === "note"),
      "the index and its column come back together",
    );

    const fks = await run(adapter, buildForeignKeyListQuery("sqlite", "", "child"));
    assert.equal(fks.rows.length, 1);
    assert.equal(fks.rows[0][1], "child", "the owning table");
    assert.equal(fks.rows[0][2], "parent_id");
    assert.equal(fks.rows[0][3], "parent");

    const allFks = await run(adapter, buildForeignKeyListQuery("sqlite", "", null));
    assert.equal(allFks.rows.length, 1, "omitting the table sweeps the whole database");

    const triggers = await run(adapter, buildTriggerListQuery("sqlite", ""));
    assert.deepEqual(triggers.rows.map((r) => [r[0], r[1]]), [["trg", "child"]]);

    const ddl = await run(adapter, buildNativeDdlQuery("sqlite", "", "parent"));
    assert.match(ddl.rows[0][0], /CREATE TABLE parent/i, "SQLite keeps the original text");
  });
});
