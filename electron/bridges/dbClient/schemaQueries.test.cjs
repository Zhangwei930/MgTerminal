const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTableListQuery,
  buildColumnListQuery,
  quoteSqlLiteral,
  ENGINES_WITH_SCHEMA_SUPPORT,
} = require("./schemaQueries.cjs");

// ── quoteSqlLiteral ─────────────────────────────────────────────────────────
//
// The adapters take a SQL string and offer no parameter binding, so schema
// queries must interpolate the database and table names themselves. That makes
// this function the only thing standing between a table name and injection.

test("a plain value is wrapped in single quotes", () => {
  assert.equal(quoteSqlLiteral("users"), "'users'");
});

test("an embedded quote is doubled, not escaped with a backslash", () => {
  // Backslash escaping is not portable; doubling is the SQL standard and works
  // on all four engines.
  assert.equal(quoteSqlLiteral("it's"), "'it''s'");
});

test("a classic injection payload cannot break out of the literal", () => {
  const quoted = quoteSqlLiteral("' OR 1=1 --");
  assert.equal(quoted, "''' OR 1=1 --'");
  // Everything after the opening quote stays inside one literal.
  assert.equal(quoted.slice(1, -1).replace(/''/g, "'"), "' OR 1=1 --");
});

test("a payload ending in a quote cannot leave a dangling literal", () => {
  const quoted = quoteSqlLiteral("x'; DROP TABLE t; --");
  assert.equal(quoted, "'x''; DROP TABLE t; --'");
  assert.equal((quoted.match(/'/g) || []).length % 2, 0, "quotes must stay balanced");
});

test("non-strings are rejected rather than coerced", () => {
  for (const bad of [null, undefined, 42, {}, []]) {
    assert.throws(() => quoteSqlLiteral(bad), /string/i, `should reject ${JSON.stringify(bad)}`);
  }
});

// ── buildTableListQuery ─────────────────────────────────────────────────────

test("every supported engine produces a table query", () => {
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildTableListQuery(engine, "appdb");
    assert.ok(sql && sql.length > 0, `${engine} produced nothing`);
    assert.match(sql, /select/i, `${engine} is not a SELECT`);
  }
});

test("the table query asks for both tables and views", () => {
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildTableListQuery(engine, "appdb").toLowerCase();
    assert.ok(
      sql.includes("view") || sql.includes("table_type") || sql.includes("object_type"),
      `${engine} does not distinguish views from tables`,
    );
  }
});

test("each engine targets its own catalog", () => {
  assert.match(buildTableListQuery("mysql", "appdb"), /information_schema/i);
  assert.match(buildTableListQuery("postgres", "appdb"), /information_schema|pg_catalog/i);
  assert.match(buildTableListQuery("mssql", "appdb"), /sys\.|information_schema/i);
  assert.match(buildTableListQuery("oracle", "appdb"), /all_tables|all_objects|user_tables/i);
});

test("engines exclude their own internal schemas", () => {
  // Otherwise the tree is buried under hundreds of catalog tables.
  assert.match(buildTableListQuery("postgres", "appdb"), /pg_catalog|information_schema/i);
  assert.match(buildTableListQuery("mysql", "appdb"), /appdb/);
});

test("a database name with a quote cannot break the query", () => {
  // The payload does appear in the output — safely, inside one literal. What
  // matters is that its quote was doubled, so it cannot terminate the literal
  // and start a new statement.
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildTableListQuery(engine, "db'; DROP TABLE t; --");
    assert.equal((sql.match(/'/g) || []).length % 2, 0, `${engine} left unbalanced quotes`);
    assert.ok(
      !/[^']'\s*;\s*DROP/i.test(sql),
      `${engine} let the payload close its literal and start a statement`,
    );
    if (sql.includes("DROP")) {
      assert.ok(sql.includes("db''; DROP"), `${engine} did not double the embedded quote`);
    }
  }
});

test("an unknown engine is rejected loudly", () => {
  assert.throws(() => buildTableListQuery("cassandra", "db"), /unsupported|unknown/i);
});

// ── buildColumnListQuery ────────────────────────────────────────────────────

test("every engine produces a column query naming the table", () => {
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildColumnListQuery(engine, "appdb", "patients");
    assert.match(sql, /select/i);
    assert.ok(sql.includes("'patients'"), `${engine} does not filter by table name`);
  }
});

test("the column query asks for type and nullability", () => {
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildColumnListQuery(engine, "appdb", "patients").toLowerCase();
    assert.ok(sql.includes("data_type") || sql.includes("type_name") || sql.includes("data_type"), `${engine} lacks a type column`);
    assert.ok(sql.includes("null"), `${engine} lacks nullability`);
  }
});

test("a table name with a quote cannot break the column query", () => {
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildColumnListQuery(engine, "appdb", "t'; DROP TABLE x; --");
    assert.equal((sql.match(/'/g) || []).length % 2, 0, `${engine} left unbalanced quotes`);
  }
});

test("columns come back in their declared order", () => {
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildColumnListQuery(engine, "appdb", "patients").toLowerCase();
    assert.match(sql, /order by/, `${engine} returns columns in arbitrary order`);
  }
});

// ── buildPrimaryKeyQuery ────────────────────────────────────────────────────
//
// Editing a grid cell means writing an UPDATE with a WHERE that hits exactly
// one row. Without a primary key there is no safe WHERE, so the grid must know
// before it offers to edit anything.

test("every engine can name a table's primary key columns", () => {
  const { buildPrimaryKeyQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildPrimaryKeyQuery(engine, "appdb", "patients");
    assert.match(sql, /select/i, `${engine} is not a SELECT`);
    assert.ok(sql.includes("'patients'"), `${engine} does not filter by table`);
  }
});

test("the primary key query asks for key columns only, not every index", () => {
  const { buildPrimaryKeyQuery } = require("./schemaQueries.cjs");
  assert.match(buildPrimaryKeyQuery("mysql", "db", "t"), /PRIMARY/);
  assert.match(buildPrimaryKeyQuery("postgres", "db", "t"), /PRIMARY KEY|indisprimary/i);
  assert.match(buildPrimaryKeyQuery("mssql", "db", "t"), /is_primary_key|PRIMARY KEY/i);
  assert.match(buildPrimaryKeyQuery("oracle", "db", "t"), /'P'/);
});

test("primary key columns come back in key order", () => {
  const { buildPrimaryKeyQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    // A composite key's column order is part of the key; an arbitrary order
    // would build a WHERE that reads wrong even when it matches.
    assert.match(buildPrimaryKeyQuery(engine, "db", "t").toLowerCase(), /order by/, engine);
  }
});

test("a table name with a quote cannot break the primary key query", () => {
  const { buildPrimaryKeyQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildPrimaryKeyQuery(engine, "db", "t'; DROP TABLE x; --");
    assert.equal((sql.match(/'/g) || []).length % 2, 0, `${engine} left unbalanced quotes`);
  }
});

// ── routines and triggers ───────────────────────────────────────────────────
//
// The remaining node types the schema tree shows: stored procedures, functions
// and triggers.

test("every engine can list routines, tagged procedure or function", () => {
  const { buildRoutineListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildRoutineListQuery(engine, "appdb");
    assert.match(sql, /select/i, `${engine} is not a SELECT`);
    assert.match(
      sql.toLowerCase(),
      /procedure|function|routine_type|object_type/,
      `${engine} does not distinguish procedures from functions`,
    );
  }
});

test("the routine query does not sweep in every other object type", () => {
  const { buildRoutineListQuery } = require("./schemaQueries.cjs");
  // Oracle's ALL_OBJECTS holds tables and views too; without a filter the tree
  // would list them a second time under Procedures.
  const oracle = buildRoutineListQuery("oracle", "db");
  assert.match(oracle, /'PROCEDURE'/);
  assert.match(oracle, /'FUNCTION'/);
  assert.ok(!/'TABLE'/.test(oracle), "oracle must not pull in tables");
});

test("every engine can list triggers with the table they belong to", () => {
  const { buildTriggerListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildTriggerListQuery(engine, "appdb").toLowerCase();
    assert.match(sql, /select/, `${engine} is not a SELECT`);
    assert.ok(sql.includes("table") || sql.includes("parent"), `${engine} loses the owning table`);
  }
});

test("postgres does not list a trigger once per event", () => {
  const { buildTriggerListQuery } = require("./schemaQueries.cjs");
  // information_schema.triggers has one row per event, so an INSERT OR UPDATE
  // trigger would otherwise appear twice in the tree.
  assert.match(buildTriggerListQuery("postgres", "db").toLowerCase(), /distinct|group by/);
});

test("routine and trigger queries come back ordered", () => {
  const { buildRoutineListQuery, buildTriggerListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    assert.match(buildRoutineListQuery(engine, "db").toLowerCase(), /order by/, `${engine} routines`);
    assert.match(buildTriggerListQuery(engine, "db").toLowerCase(), /order by/, `${engine} triggers`);
  }
});

test("a database name with a quote cannot break either query", () => {
  const { buildRoutineListQuery, buildTriggerListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    for (const sql of [
      buildRoutineListQuery(engine, "db'; DROP TABLE t; --"),
      buildTriggerListQuery(engine, "db'; DROP TABLE t; --"),
    ]) {
      assert.equal((sql.match(/'/g) || []).length % 2, 0, `${engine} left unbalanced quotes`);
    }
  }
});

test("an unknown engine is rejected by both", () => {
  const { buildRoutineListQuery, buildTriggerListQuery } = require("./schemaQueries.cjs");
  assert.throws(() => buildRoutineListQuery("cassandra", "db"), /unsupported|unknown/i);
  assert.throws(() => buildTriggerListQuery("cassandra", "db"), /unsupported|unknown/i);
});

// ── indexes and foreign keys ────────────────────────────────────────────────
//
// Per-table, like columns: shown when a table is expanded.

test("every engine can list a table's indexes with their columns", () => {
  const { buildIndexListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildIndexListQuery(engine, "appdb", "patients");
    assert.match(sql, /select/i, `${engine} is not a SELECT`);
    assert.ok(sql.includes("'patients'"), `${engine} does not filter by table`);
    assert.match(sql.toLowerCase(), /uniq/, `${engine} does not report uniqueness`);
  }
});

test("index columns come back in index order", () => {
  const { buildIndexListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    // A composite index on (a, b) is a different index from one on (b, a).
    assert.match(buildIndexListQuery(engine, "db", "t").toLowerCase(), /order by/, engine);
  }
});

test("every engine can list a table's foreign keys with their target", () => {
  const { buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildForeignKeyListQuery(engine, "appdb", "visits").toLowerCase();
    assert.match(sql, /select/, `${engine} is not a SELECT`);
    // Without the referenced side a foreign key tells the user nothing.
    assert.ok(
      sql.includes("referenced") || sql.includes("ref_") || sql.includes("foreign"),
      `${engine} loses the referenced table`,
    );
  }
});

test("mysql excludes plain keys from the foreign key list", () => {
  const { buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  // KEY_COLUMN_USAGE holds primary and unique keys too; without this filter
  // every primary key would be reported as a foreign key.
  assert.match(buildForeignKeyListQuery("mysql", "db", "t"), /REFERENCED_TABLE_NAME IS NOT NULL/i);
});

test("oracle finds the referenced table through the parent constraint", () => {
  const { buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  // ALL_CONSTRAINTS records R_CONSTRAINT_NAME, not the table — the target only
  // comes out by joining back through it.
  const sql = buildForeignKeyListQuery("oracle", "db", "t");
  assert.match(sql, /R_CONSTRAINT_NAME/i);
  assert.match(sql, /'R'/);
});

test("a table name with a quote cannot break either query", () => {
  const { buildIndexListQuery, buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    for (const sql of [
      buildIndexListQuery(engine, "db", "t'; DROP TABLE x; --"),
      buildForeignKeyListQuery(engine, "db", "t'; DROP TABLE x; --"),
    ]) {
      assert.equal((sql.match(/'/g) || []).length % 2, 0, `${engine} left unbalanced quotes`);
    }
  }
});

test("an unknown engine is rejected by both", () => {
  const { buildIndexListQuery, buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  assert.throws(() => buildIndexListQuery("cassandra", "db", "t"), /unsupported|unknown/i);
  assert.throws(() => buildForeignKeyListQuery("cassandra", "db", "t"), /unsupported|unknown/i);
});

// ── native DDL ──────────────────────────────────────────────────────────────
//
// MySQL and Oracle can return their own CREATE TABLE. That is always better
// than a reconstruction, because it is what the server actually has —
// defaults, auto-increment, check constraints and all. Postgres and SQL Server
// have no equivalent call.

test("mysql and oracle expose a native DDL query", () => {
  const { buildNativeDdlQuery } = require("./schemaQueries.cjs");
  assert.match(buildNativeDdlQuery("mysql", "db", "patients"), /SHOW CREATE TABLE/i);
  assert.match(buildNativeDdlQuery("oracle", "db", "patients"), /DBMS_METADATA/i);
});

test("postgres and mssql have none, and say so with null", () => {
  const { buildNativeDdlQuery } = require("./schemaQueries.cjs");
  // Not an error: the caller falls back to reconstructing the statement.
  assert.equal(buildNativeDdlQuery("postgres", "db", "t"), null);
  assert.equal(buildNativeDdlQuery("mssql", "db", "t"), null);
});

test("the native DDL query quotes its table safely", () => {
  const { buildNativeDdlQuery } = require("./schemaQueries.cjs");
  // MySQL interpolates the name as an identifier, Oracle as a literal — both
  // have to survive a quote in the name.
  const mysql = buildNativeDdlQuery("mysql", "db", "we`ird");
  assert.ok(mysql.includes("`we``ird`"), "mysql must double the backtick");

  const oracle = buildNativeDdlQuery("oracle", "db", "we'ird");
  assert.equal((oracle.match(/'/g) || []).length % 2, 0, "oracle left unbalanced quotes");
});

test("an unknown engine is rejected", () => {
  const { buildNativeDdlQuery } = require("./schemaQueries.cjs");
  assert.throws(() => buildNativeDdlQuery("cassandra", "db", "t"), /unsupported|unknown/i);
});

// ── whole-schema foreign keys (for the ER diagram) ──────────────────────────

test("omitting the table lists every foreign key in the database", () => {
  const { buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    const sql = buildForeignKeyListQuery(engine, "appdb", null);
    assert.match(sql, /select/i, `${engine} is not a SELECT`);
    // The per-table filter must be gone, or the diagram shows one table's keys.
    assert.ok(!sql.includes("'patients'"), engine);
  }
});

test("the foreign key query always reports the owning table", () => {
  const { buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    // Without it a whole-schema result cannot say which table each key is on,
    // and the diagram has no source node to draw from.
    assert.match(
      buildForeignKeyListQuery(engine, "appdb", null).toLowerCase(),
      /as table_name/,
      engine,
    );
  }
});

test("passing a table still narrows the result", () => {
  const { buildForeignKeyListQuery } = require("./schemaQueries.cjs");
  for (const engine of ENGINES_WITH_SCHEMA_SUPPORT) {
    assert.ok(
      buildForeignKeyListQuery(engine, "appdb", "patients").includes("'patients'"),
      engine,
    );
  }
});
