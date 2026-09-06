"use strict";

/**
 * The generated SQL, run against a real server.
 *
 * Every other test in this directory asserts the *text* a builder produces.
 * That catches a wrong alias and misses everything a server actually rejects:
 * a keyword that needed quoting, clauses in the wrong order, a function the
 * engine does not have. The dialect-specific parts — schema-qualified catalog
 * reads, paging, binary and date literals, designer DDL — are exactly where
 * that gap bites.
 *
 * Each server engine is skipped unless its URL is in the environment, so the
 * ordinary `npm test` run is unaffected:
 *
 *   MAGIES_TEST_POSTGRES=postgres://user:pass@127.0.0.1:5432/postgres
 *   MAGIES_TEST_MYSQL=mysql://user:pass@127.0.0.1:3306/mysql
 *   MAGIES_TEST_MARIADB=…    (same shape — MariaDB speaks MySQL's protocol)
 *
 * SQLite needs no URL: it runs in memory and is always exercised.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdapter } = require("./adapterFactory.cjs");
const {
  buildColumnListQuery,
  buildForeignKeyListQuery,
  buildIndexListQuery,
  buildPrimaryKeyQuery,
  buildTableListQuery,
} = require("./schemaQueries.cjs");
// The renderer-side builders. tsx is already loaded for the test run, so the
// TypeScript modules require directly — and testing the real ones is the point.
const { buildPreviewSelect } = require("../../../domain/db/previewQuery.ts");
const { buildPagedQuery } = require("../../../domain/db/pagedQuery.ts");
const { buildUpdateStatement, buildDeleteStatement } = require("../../../domain/db/rowEditSql.ts");
const { buildInsertStatements } = require("../../../domain/db/sqlDump.ts");
const {
  buildAddColumn, buildAlterColumn, buildCreateIndex, buildCreateTable,
  buildDropColumn, buildDropIndex, buildDropTable, buildRenameColumn, buildRenameTable,
} = require("../../../domain/db/tableDesignerSql.ts");

const SCHEMA = "magies_it";

const ENGINES = [
  { engine: "sqlite", env: null },
  { engine: "postgres", env: "MAGIES_TEST_POSTGRES" },
  { engine: "mysql", env: "MAGIES_TEST_MYSQL" },
  { engine: "mariadb", env: "MAGIES_TEST_MARIADB" },
];

function connectionFor(entry) {
  if (entry.engine === "sqlite") return { host: ":memory:" };
  const raw = process.env[entry.env];
  if (!raw) return null;
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || undefined,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

async function run(adapter, sql, maxRows = 1000) {
  const batches = [];
  const result = await adapter.query(sql, { maxRows, onRowBatch: (b) => batches.push(b) });
  return {
    result,
    columns: batches.find((b) => b.columns && b.columns.length)?.columns ?? [],
    rows: batches.flatMap((b) => b.rows),
  };
}

/** Column index by name, so assertions do not depend on catalog column order. */
function pick(columns, name) {
  const index = columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
  assert.ok(index >= 0, `no "${name}" in ${JSON.stringify(columns.map((c) => c.name))}`);
  return index;
}

/** The schema these tables live in, or undefined where the engine has none. */
function schemaFor(engine) {
  return engine === "sqlite" ? undefined : SCHEMA;
}

/** Creates an isolated namespace and returns a teardown. */
async function setUpNamespace(adapter, engine) {
  if (engine === "sqlite") return async () => {};
  if (engine === "postgres") {
    await run(adapter, `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await run(adapter, `CREATE SCHEMA ${SCHEMA}`);
    return async () => { await run(adapter, `DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); };
  }
  // MySQL and MariaDB: a schema is a database.
  await run(adapter, `DROP DATABASE IF EXISTS ${SCHEMA}`);
  await run(adapter, `CREATE DATABASE ${SCHEMA}`);
  return async () => { await run(adapter, `DROP DATABASE IF EXISTS ${SCHEMA}`); };
}

for (const entry of ENGINES) {
  const options = connectionFor(entry);
  const { engine } = entry;

  test(`[${engine}] generated SQL runs on a real server`, { skip: !options && `set ${entry.env}` }, async (t) => {
    const adapter = createAdapter(engine);
    await adapter.connect(options);
    const teardown = await setUpNamespace(adapter, engine);
    const schema = schemaFor(engine);
    // Qualify by hand here: this file is testing the builders, not reusing them.
    const q = (name) => {
      const quote = engine === "mysql" || engine === "mariadb" ? "`" : '"';
      const one = (part) => `${quote}${part}${quote}`;
      return schema ? `${one(schema)}.${one(name)}` : one(name);
    };

    try {
      await t.test("catalog reads describe exactly what was created", async () => {
        await run(adapter, `CREATE TABLE ${q("parent")} (id INTEGER PRIMARY KEY, code VARCHAR(20) NOT NULL)`);
        // A table-level FOREIGN KEY, not a column-level REFERENCES: InnoDB
        // parses the inline form and silently creates nothing, so the inline
        // version would test the catalog read against a key that is not there.
        await run(adapter, `CREATE TABLE ${q("child")} (
          id INTEGER PRIMARY KEY,
          parent_id INTEGER,
          note VARCHAR(50),
          CONSTRAINT fk_child_parent FOREIGN KEY (parent_id) REFERENCES ${q("parent")}(id)
        )`);
        await run(adapter, `CREATE UNIQUE INDEX ux_child_note ON ${q("child")} (note)`);

        const tables = await run(adapter, buildTableListQuery(engine, schema ?? ""));
        const nameAt = pick(tables.columns, "name");
        const found = tables.rows.map((row) => String(row[nameAt]));
        assert.ok(found.includes("parent") && found.includes("child"), `got ${found}`);

        if (schema) {
          const schemaAt = pick(tables.columns, "schema_name");
          const ours = tables.rows.filter((row) => String(row[nameAt]) === "parent");
          assert.ok(
            ours.some((row) => String(row[schemaAt]) === SCHEMA),
            "the catalog must report which schema the table came from",
          );
        }

        const columns = await run(adapter, buildColumnListQuery(engine, schema ?? "", "parent", schema));
        const colName = pick(columns.columns, "name");
        assert.deepEqual(
          columns.rows.map((row) => String(row[colName]).toLowerCase()),
          ["id", "code"],
          "columns in declaration order",
        );

        const pk = await run(adapter, buildPrimaryKeyQuery(engine, schema ?? "", "parent", schema));
        assert.deepEqual(
          pk.rows.map((row) => String(row[pick(pk.columns, "name")]).toLowerCase()),
          ["id"],
        );

        const indexes = await run(adapter, buildIndexListQuery(engine, schema ?? "", "child", schema));
        const ixName = pick(indexes.columns, "name");
        const ixCol = pick(indexes.columns, "column_name");
        assert.ok(
          indexes.rows.some((row) => String(row[ixName]) === "ux_child_note" && String(row[ixCol]) === "note"),
          `index not reported: ${JSON.stringify(indexes.rows)}`,
        );

        const fks = await run(adapter, buildForeignKeyListQuery(engine, schema ?? "", "child", schema));
        const fkTable = pick(fks.columns, "referenced_table");
        assert.ok(
          fks.rows.some((row) => String(row[fkTable]).toLowerCase() === "parent"),
          `foreign key not reported: ${JSON.stringify(fks.rows)}`,
        );
      });

      await t.test("a whole-database foreign key sweep still names its owner", async () => {
        const all = await run(adapter, buildForeignKeyListQuery(engine, schema ?? "", null, schema));
        const owner = pick(all.columns, "table_name");
        assert.ok(
          all.rows.some((row) => String(row[owner]).toLowerCase() === "child"),
          "omitting the table must still say which table each key belongs to",
        );
      });

      // The bug this release fixes: the lookups filtered on the table name
      // alone, so a second schema holding the same name had its columns and
      // key merged into the answer for the first.
      await t.test("a same-named table in another schema does not leak in", { skip: !schema }, async () => {
        const other = `${SCHEMA}_other`;
        const otherQ = (name) => {
          const quote = engine === "mysql" || engine === "mariadb" ? "`" : '"';
          return `${quote}${other}${quote}.${quote}${name}${quote}`;
        };
        const create = engine === "postgres" ? "CREATE SCHEMA" : "CREATE DATABASE";
        const drop = engine === "postgres" ? "DROP SCHEMA IF EXISTS" : "DROP DATABASE IF EXISTS";
        await run(adapter, `${drop} ${other}${engine === "postgres" ? " CASCADE" : ""}`);
        await run(adapter, `${create} ${other}`);
        try {
          // Deliberately a different shape and a different key column.
          await run(adapter, `CREATE TABLE ${otherQ("parent")} (other_key INTEGER PRIMARY KEY, extra VARCHAR(10))`);

          const columns = await run(adapter, buildColumnListQuery(engine, schema ?? "", "parent", schema));
          const names = columns.rows.map((row) => String(row[pick(columns.columns, "name")]).toLowerCase());
          assert.deepEqual(names, ["id", "code"], `other schema's columns leaked: ${names}`);

          const pk = await run(adapter, buildPrimaryKeyQuery(engine, schema ?? "", "parent", schema));
          const keys = pk.rows.map((row) => String(row[pick(pk.columns, "name")]).toLowerCase());
          assert.deepEqual(keys, ["id"], `other schema's key leaked: ${keys}`);
        } finally {
          await run(adapter, `${drop} ${other}${engine === "postgres" ? " CASCADE" : ""}`);
        }
      });

      await t.test("designer DDL is accepted by the server", async () => {
        const target = schema ? { schema, name: "designed" } : { name: "designed" };
        await run(adapter, buildCreateTable({
          engine, table: target,
          columns: [
            { name: "id", dataType: engine === "sqlite" ? "INTEGER" : "INTEGER", nullable: false, primaryKey: true },
            { name: "label", dataType: "VARCHAR(40)", nullable: true },
          ],
        }));
        await run(adapter, buildAddColumn({
          engine, table: target, column: { name: "note", dataType: "VARCHAR(80)", nullable: true },
        }));
        if (engine !== "sqlite") {
          // SQLite cannot change a column type; the builder refuses instead.
          for (const statement of buildAlterColumn({
            engine, table: target, column: { name: "note", dataType: "VARCHAR(120)", nullable: true },
          }).split("\n")) {
            await run(adapter, statement);
          }
        }
        await run(adapter, buildRenameColumn({ engine, table: target, from: "label", to: "title" }));
        await run(adapter, buildCreateIndex({
          engine, table: target, name: "ix_designed_title", columns: ["title"],
        }));

        const columns = await run(adapter, buildColumnListQuery(engine, schema ?? "", "designed", schema));
        const names = columns.rows.map((row) => String(row[pick(columns.columns, "name")]).toLowerCase());
        assert.deepEqual(names.sort(), ["id", "note", "title"], `after ALTERs: ${names}`);

        await run(adapter, buildDropIndex({ engine, table: target, name: "ix_designed_title" }));
        await run(adapter, buildDropColumn({ engine, table: target, column: "note" }));
        await run(adapter, buildRenameTable({ engine, table: target, to: "designed2" }));
        const renamed = schema ? { schema, name: "designed2" } : { name: "designed2" };
        await run(adapter, buildDropTable({ engine, table: renamed }));
      });

      await t.test("preview, paging and row edits round-trip", async () => {
        const target = schema ? { schema, name: "rows" } : { name: "rows" };
        await run(adapter, buildCreateTable({
          engine, table: target,
          columns: [
            { name: "id", dataType: "INTEGER", nullable: false, primaryKey: true },
            { name: "name", dataType: "VARCHAR(40)", nullable: true },
          ],
        }));
        const seed = Array.from({ length: 25 }, (_, i) => [i + 1, `n${i + 1}`]);
        for (const statement of buildInsertStatements({
          engine, table: target, columns: [{ name: "id" }, { name: "name" }], rows: seed,
        }).split("\n\n")) {
          await run(adapter, statement);
        }

        const preview = await run(adapter, buildPreviewSelect(engine, target, 100));
        assert.equal(preview.rows.length, 25, "preview must reach a schema-qualified table");

        // Pages must be disjoint and consecutive.
        const ordered = `SELECT * FROM ${q("rows")} ORDER BY id`;
        const first = await run(adapter, buildPagedQuery(engine, ordered, { limit: 10, offset: 0 }));
        const second = await run(adapter, buildPagedQuery(engine, ordered, { limit: 10, offset: 10 }));
        const idOf = (r) => Number(r[pick(first.columns, "id")]);
        assert.deepEqual(first.rows.map(idOf), [1,2,3,4,5,6,7,8,9,10]);
        assert.deepEqual(second.rows.map(idOf), [11,12,13,14,15,16,17,18,19,20]);

        // An edit, and a NULL the grid could not previously write.
        await run(adapter, buildUpdateStatement({
          engine, table: target, column: "name", value: "edited", keys: [{ column: "id", value: 3 }],
        }));
        await run(adapter, buildUpdateStatement({
          engine, table: target, column: "name", value: null, keys: [{ column: "id", value: 4 }],
        }));
        const after = await run(adapter, `SELECT id, name FROM ${q("rows")} WHERE id IN (3, 4) ORDER BY id`);
        assert.equal(String(after.rows[0][1]), "edited");
        assert.equal(after.rows[1][1], null, "a cleared cell must be NULL, not the text NULL");

        const del = await run(adapter, buildDeleteStatement({
          engine, table: target, keys: [{ column: "id", value: 5 }],
        }));
        assert.equal(del.result.affectedRows, 1, "delete must report one row");

        await run(adapter, buildDropTable({ engine, table: target }));
      });

      // The value formatting this release rewrote. A byte literal, a timestamp
      // and a boolean are each spelled differently per engine, and getting one
      // wrong is either a rejected statement or — worse — an accepted one that
      // stores something else.
      await t.test("binary, date and boolean values survive a round trip", async () => {
        const binaryType = { postgres: "BYTEA", mysql: "VARBINARY(16)", mariadb: "VARBINARY(16)", sqlite: "BLOB" }[engine];
        const stampType = { postgres: "TIMESTAMP", mysql: "DATETIME(3)", mariadb: "DATETIME(3)", sqlite: "TEXT" }[engine];
        const boolType = { postgres: "BOOLEAN", mysql: "TINYINT(1)", mariadb: "TINYINT(1)", sqlite: "INTEGER" }[engine];

        const target = schema ? { schema, name: "values_rt" } : { name: "values_rt" };
        await run(adapter, buildCreateTable({
          engine, table: target,
          columns: [
            { name: "id", dataType: "INTEGER", nullable: false, primaryKey: true },
            { name: "payload", dataType: binaryType, nullable: true },
            { name: "seen_at", dataType: stampType, nullable: true },
            { name: "flag", dataType: boolType, nullable: true },
          ],
        }));

        const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
        const when = new Date(2026, 0, 2, 3, 4, 5, 678);
        for (const statement of buildInsertStatements({
          engine, table: target,
          columns: [{ name: "id" }, { name: "payload" }, { name: "seen_at" }, { name: "flag" }],
          rows: [[1, bytes, when, true]],
        }).split("\n\n")) {
          await run(adapter, statement);
        }

        const back = await run(adapter, `SELECT id, payload, seen_at, flag FROM ${q("values_rt")} WHERE id = 1`);
        assert.equal(back.rows.length, 1, "the row must have been accepted");
        const [, payload, seenAt, flag] = back.rows[0];

        assert.ok(ArrayBuffer.isView(payload), `payload came back as ${typeof payload}`);
        assert.deepEqual(
          Array.from(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)),
          [0xde, 0xad, 0xbe, 0xef],
          "the bytes must be the bytes that went in",
        );

        // The wall clock, not a UTC-shifted instant.
        const text = seenAt instanceof Date
          ? `${seenAt.getFullYear()}-${String(seenAt.getMonth() + 1).padStart(2, "0")}-${String(seenAt.getDate()).padStart(2, "0")} ${String(seenAt.getHours()).padStart(2, "0")}:${String(seenAt.getMinutes()).padStart(2, "0")}`
          : String(seenAt);
        assert.match(text, /^2026-01-02 03:04/, `timestamp drifted: ${String(seenAt)}`);

        assert.ok(flag === true || Number(flag) === 1, `boolean came back as ${String(flag)}`);

        // And the same values in a WHERE must find the row they came from.
        const keyed = await run(adapter, buildUpdateStatement({
          engine, table: target, column: "id", value: 1,
          keys: [{ column: "payload", value: bytes }],
        }));
        assert.equal(keyed.result.affectedRows, 1, "a binary key must match its own row");

        await run(adapter, buildDropTable({ engine, table: target }));
      });

      // Reserved words are the classic identifier-quoting failure.
      await t.test("reserved words work as table and column names", async () => {
        const target = schema ? { schema, name: "order" } : { name: "order" };
        await run(adapter, buildCreateTable({
          engine, table: target,
          columns: [
            { name: "select", dataType: "INTEGER", nullable: false, primaryKey: true },
            { name: "from", dataType: "VARCHAR(20)", nullable: true },
          ],
        }));
        for (const statement of buildInsertStatements({
          engine, table: target, columns: [{ name: "select" }, { name: "from" }], rows: [[1, "x"]],
        }).split("\n\n")) {
          await run(adapter, statement);
        }
        const preview = await run(adapter, buildPreviewSelect(engine, target, 10));
        assert.equal(preview.rows.length, 1);

        const columns = await run(adapter, buildColumnListQuery(engine, schema ?? "", "order", schema));
        const names = columns.rows.map((row) => String(row[pick(columns.columns, "name")]).toLowerCase());
        assert.deepEqual(names.sort(), ["from", "select"]);

        await run(adapter, buildDropTable({ engine, table: target }));
      });
    } finally {
      await teardown();
      await adapter.close();
    }
  });
}
