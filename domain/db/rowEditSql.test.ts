import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbEngine } from '../models';
import { buildDeleteStatement, buildUpdateStatement, formatSqlValue } from './rowEditSql';

const ENGINES: DbEngine[] = ['mysql', 'postgres', 'mssql', 'oracle'];

// ── formatSqlValue ──────────────────────────────────────────────────────────

test('a string is quoted with its quotes doubled', () => {
  assert.equal(formatSqlValue("it's", 'postgres'), "'it''s'");
});

test('null is NULL, not the string "null"', () => {
  assert.equal(formatSqlValue(null, 'postgres'), 'NULL');
  assert.equal(formatSqlValue(undefined, 'postgres'), 'NULL');
});

test('numbers are written bare', () => {
  assert.equal(formatSqlValue(42, 'postgres'), '42');
  assert.equal(formatSqlValue(1.5, 'postgres'), '1.5');
});

// SQL Server has no TRUE/FALSE keyword and Oracle has no boolean column type
// before 23c, so a shared spelling is a syntax error on half the engines.
test('booleans use the spelling each engine actually accepts', () => {
  assert.equal(formatSqlValue(true, 'mysql'), 'TRUE');
  assert.equal(formatSqlValue(false, 'postgres'), 'FALSE');
  assert.equal(formatSqlValue(true, 'mssql'), '1');
  assert.equal(formatSqlValue(false, 'oracle'), '0');
});

test('a non-finite number is rejected rather than written as NaN', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => formatSqlValue(bad, 'postgres'), /finite/i, `should reject ${String(bad)}`);
  }
});

test('an object is written as JSON, not [object Object]', () => {
  // A json/jsonb column arrives parsed. String() would produce a value the
  // column happily accepts while destroying the data.
  assert.equal(formatSqlValue({ a: 1 }, 'postgres'), `'{"a":1}'`);
  assert.equal(formatSqlValue([1, 2], 'postgres'), `'[1,2]'`);
});

// ── binary ──────────────────────────────────────────────────────────────────
//
// A BLOB/bytea/varbinary column arrives as a Buffer, which crosses IPC as a
// Uint8Array. JSON.stringify turns that into {"0":170,"1":187} — a value the
// column accepts and that destroys the data, and a WHERE that matches nothing.

test('binary is written as the byte literal each engine accepts', () => {
  const bytes = new Uint8Array([0xaa, 0xbb]);
  assert.equal(formatSqlValue(bytes, 'mysql'), "X'AABB'");
  assert.equal(formatSqlValue(bytes, 'postgres'), `'\\xaabb'::bytea`);
  assert.equal(formatSqlValue(bytes, 'mssql'), '0xAABB');
  assert.equal(formatSqlValue(bytes, 'oracle'), "HEXTORAW('AABB')");
});

test('empty binary still produces a valid literal', () => {
  assert.equal(formatSqlValue(new Uint8Array([]), 'mysql'), "X''");
  assert.equal(formatSqlValue(new Uint8Array([]), 'mssql'), '0x');
});

// ── dates ───────────────────────────────────────────────────────────────────
//
// toISOString() shifted the value by the local offset and appended a Z that
// MySQL's DATETIME rejects outright, so an edit either failed or silently
// stored a different instant. Drivers build these Dates from the server's wall
// clock, so the wall clock is what has to go back.

test('a date is written as local wall-clock time, not shifted to UTC', () => {
  const value = new Date(2026, 0, 2, 3, 4, 5, 678);
  assert.equal(formatSqlValue(value, 'mysql'), "'2026-01-02 03:04:05.678'");
  assert.equal(formatSqlValue(value, 'postgres'), "'2026-01-02 03:04:05.678'");
});

test('SQL Server gets the ISO T form, which no DATEFORMAT setting reinterprets', () => {
  const value = new Date(2026, 0, 2, 3, 4, 5, 678);
  assert.equal(formatSqlValue(value, 'mssql'), "'2026-01-02T03:04:05.678'");
});

test('Oracle gets an explicit format model rather than trusting NLS_DATE_FORMAT', () => {
  const value = new Date(2026, 0, 2, 3, 4, 5, 678);
  assert.equal(
    formatSqlValue(value, 'oracle'),
    `TO_TIMESTAMP('2026-01-02 03:04:05.678','YYYY-MM-DD HH24:MI:SS.FF3')`,
  );
});

test('an invalid date is refused rather than written as "Invalid Date"', () => {
  assert.throws(() => formatSqlValue(new Date(NaN), 'mysql'), /valid date/i);
});

// ── buildUpdateStatement ────────────────────────────────────────────────────

test('an update targets one row by its primary key', () => {
  const sql = buildUpdateStatement({
    engine: 'postgres',
    table: { name: 'patients' },
    column: 'full_name',
    value: 'Ada',
    keys: [{ column: 'id', value: 7 }],
  });

  assert.equal(sql, `UPDATE "patients" SET "full_name" = 'Ada' WHERE "id" = 7`);
});

// Two schemas can hold the same table name, and an unqualified UPDATE resolves
// through search_path — to a different table than the grid is showing.
test('the schema is carried into the statement', () => {
  const sql = buildUpdateStatement({
    engine: 'postgres',
    table: { schema: 'tenant_a', name: 'patients' },
    column: 'full_name',
    value: 'Ada',
    keys: [{ column: 'id', value: 7 }],
  });

  assert.match(sql, /^UPDATE "tenant_a"\."patients" /);
});

test('a composite key contributes every column to the WHERE', () => {
  const sql = buildUpdateStatement({
    engine: 'mysql',
    table: { name: 'visit_meds' },
    column: 'dose',
    value: 5,
    keys: [{ column: 'visit_id', value: 1 }, { column: 'med_id', value: 2 }],
  });

  assert.match(sql, /WHERE `visit_id` = 1 AND `med_id` = 2$/);
});

test('a NULL key uses IS NULL, not = NULL', () => {
  // `= NULL` matches nothing, so the update would silently do nothing.
  const sql = buildUpdateStatement({
    engine: 'postgres',
    table: { name: 't' },
    column: 'c',
    value: 1,
    keys: [{ column: 'k', value: null }],
  });

  assert.match(sql, /WHERE "k" IS NULL$/);
});

test('an update with no key columns is refused', () => {
  // Without a WHERE this rewrites the entire table.
  assert.throws(
    () => buildUpdateStatement({
      engine: 'postgres', table: { name: 't' }, column: 'c', value: 1, keys: [],
    }),
    /primary key/i,
  );
});

test('table and column names are quoted as identifiers, per engine', () => {
  const each = ENGINES.map((engine) => buildUpdateStatement({
    engine, table: { name: 'order' }, column: 'select', value: 1, keys: [{ column: 'id', value: 1 }],
  }));
  assert.ok(each[0].includes('`order`'), 'mysql');
  assert.ok(each[1].includes('"order"'), 'postgres');
  assert.ok(each[2].includes('[order]'), 'mssql');
  assert.ok(each[3].includes('"order"'), 'oracle');
});

test('an injection payload in a value cannot end the statement', () => {
  const sql = buildUpdateStatement({
    engine: 'postgres',
    table: { name: 't' },
    column: 'c',
    value: "x'; DROP TABLE t; --",
    keys: [{ column: 'id', value: 1 }],
  });

  assert.equal((sql.match(/'/g) || []).length % 2, 0, 'quotes must stay balanced');
  assert.ok(sql.includes("x''; DROP"), 'the embedded quote must be doubled');
});

// ── buildDeleteStatement ────────────────────────────────────────────────────

test('a delete targets one row by its primary key', () => {
  const sql = buildDeleteStatement({
    engine: 'mssql',
    table: { name: 'patients' },
    keys: [{ column: 'id', value: 7 }],
  });

  assert.equal(sql, 'DELETE FROM [patients] WHERE [id] = 7');
});

test('a delete carries the schema too', () => {
  const sql = buildDeleteStatement({
    engine: 'postgres',
    table: { schema: 'tenant_a', name: 'patients' },
    keys: [{ column: 'id', value: 7 }],
  });

  assert.match(sql, /^DELETE FROM "tenant_a"\."patients" /);
});

test('a delete with no key columns is refused', () => {
  // Without a WHERE this empties the table.
  assert.throws(
    () => buildDeleteStatement({ engine: 'mysql', table: { name: 't' }, keys: [] }),
    /primary key/i,
  );
});
