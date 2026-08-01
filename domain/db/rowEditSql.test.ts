import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbEngine } from '../models';
import { buildDeleteStatement, buildUpdateStatement, formatSqlValue } from './rowEditSql';

const ENGINES: DbEngine[] = ['mysql', 'postgres', 'mssql', 'oracle'];

// ── formatSqlValue ──────────────────────────────────────────────────────────

test('a string is quoted with its quotes doubled', () => {
  assert.equal(formatSqlValue("it's"), "'it''s'");
});

test('null is NULL, not the string "null"', () => {
  assert.equal(formatSqlValue(null), 'NULL');
  assert.equal(formatSqlValue(undefined), 'NULL');
});

test('numbers and booleans are written bare', () => {
  assert.equal(formatSqlValue(42), '42');
  assert.equal(formatSqlValue(1.5), '1.5');
  assert.equal(formatSqlValue(true), 'TRUE');
  assert.equal(formatSqlValue(false), 'FALSE');
});

test('a non-finite number is rejected rather than written as NaN', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => formatSqlValue(bad), /finite/i, `should reject ${String(bad)}`);
  }
});

test('a date is written as a quoted ISO timestamp', () => {
  const value = formatSqlValue(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));
  assert.match(value, /^'2026-01-02/);
});

// ── buildUpdateStatement ────────────────────────────────────────────────────

test('an update targets one row by its primary key', () => {
  const sql = buildUpdateStatement({
    engine: 'postgres',
    table: 'patients',
    column: 'full_name',
    value: 'Ada',
    keys: [{ column: 'id', value: 7 }],
  });

  assert.equal(sql, `UPDATE "patients" SET "full_name" = 'Ada' WHERE "id" = 7`);
});

test('a composite key contributes every column to the WHERE', () => {
  const sql = buildUpdateStatement({
    engine: 'mysql',
    table: 'visit_meds',
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
    table: 't',
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
      engine: 'postgres', table: 't', column: 'c', value: 1, keys: [],
    }),
    /primary key/i,
  );
});

test('table and column names are quoted as identifiers, per engine', () => {
  const each = ENGINES.map((engine) => buildUpdateStatement({
    engine, table: 'order', column: 'select', value: 1, keys: [{ column: 'id', value: 1 }],
  }));
  assert.ok(each[0].includes('`order`'), 'mysql');
  assert.ok(each[1].includes('"order"'), 'postgres');
  assert.ok(each[2].includes('[order]'), 'mssql');
  assert.ok(each[3].includes('"order"'), 'oracle');
});

test('an injection payload in a value cannot end the statement', () => {
  const sql = buildUpdateStatement({
    engine: 'postgres',
    table: 't',
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
    table: 'patients',
    keys: [{ column: 'id', value: 7 }],
  });

  assert.equal(sql, 'DELETE FROM [patients] WHERE [id] = 7');
});

test('a delete with no key columns is refused', () => {
  // Without a WHERE this empties the table.
  assert.throws(
    () => buildDeleteStatement({ engine: 'mysql', table: 't', keys: [] }),
    /primary key/i,
  );
});
