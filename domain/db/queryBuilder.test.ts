import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSelectFromSpec, COMPARISON_OPERATORS } from './queryBuilder';

const table = { schema: 'app', name: 'patients' };
const spec = (over: Partial<Parameters<typeof buildSelectFromSpec>[0]> = {}) =>
  buildSelectFromSpec({ engine: 'postgres', table, columns: [], filters: [], sorts: [], ...over });

test('no columns selected means every column', () => {
  assert.equal(spec(), 'SELECT *\nFROM "app"."patients"');
});

test('chosen columns are quoted and listed in order', () => {
  assert.equal(
    spec({ columns: ['id', 'full name'] }),
    'SELECT "id", "full name"\nFROM "app"."patients"',
  );
});

test('a filter becomes a parameterless WHERE with the value quoted', () => {
  assert.equal(
    spec({ filters: [{ column: 'name', operator: '=', value: "O'Hara" }] }),
    `SELECT *\nFROM "app"."patients"\nWHERE "name" = 'O''Hara'`,
  );
});

test('several filters are ANDed in the order given', () => {
  const sql = spec({
    filters: [
      { column: 'age', operator: '>', value: '40' },
      { column: 'city', operator: '=', value: 'Oslo' },
    ],
  });
  assert.match(sql, /WHERE "age" > 40 AND "city" = 'Oslo'/);
});

test('a numeric-looking value is written as a number, text is quoted', () => {
  assert.match(spec({ filters: [{ column: 'n', operator: '=', value: '42' }] }), /= 42$/);
  assert.match(spec({ filters: [{ column: 'n', operator: '=', value: '42x' }] }), /= '42x'$/);
});

test('IS NULL and IS NOT NULL take no value', () => {
  assert.match(spec({ filters: [{ column: 'a', operator: 'IS NULL', value: '' }] }), /WHERE "a" IS NULL$/);
  assert.match(
    spec({ filters: [{ column: 'a', operator: 'IS NOT NULL', value: 'ignored' }] }),
    /WHERE "a" IS NOT NULL$/,
  );
});

test('LIKE wraps the value in wildcards only when the user has not', () => {
  assert.match(spec({ filters: [{ column: 'a', operator: 'LIKE', value: 'ada' }] }), /LIKE '%ada%'$/);
  assert.match(spec({ filters: [{ column: 'a', operator: 'LIKE', value: 'ada%' }] }), /LIKE 'ada%'$/);
});

test('sorts become an ORDER BY in the order given', () => {
  assert.match(
    spec({ sorts: [{ column: 'b', direction: 'desc' }, { column: 'a', direction: 'asc' }] }),
    /ORDER BY "b" DESC, "a" ASC$/,
  );
});

test('a limit is spelled for the engine', () => {
  assert.match(buildSelectFromSpec({
    engine: 'mysql', table, columns: [], filters: [], sorts: [], limit: 10,
  }), /LIMIT 10$/);
  assert.match(buildSelectFromSpec({
    engine: 'mssql', table, columns: [], filters: [], sorts: [], limit: 10,
  }), /^SELECT TOP 10 \*/);
  assert.match(buildSelectFromSpec({
    engine: 'oracle', table, columns: [], filters: [], sorts: [], limit: 10,
  }), /FETCH FIRST 10 ROWS ONLY$/);
});

test('everything together comes out in clause order', () => {
  const sql = spec({
    columns: ['id'],
    filters: [{ column: 'age', operator: '>=', value: '18' }],
    sorts: [{ column: 'id', direction: 'asc' }],
    limit: 5,
  });
  assert.equal(
    sql,
    'SELECT "id"\nFROM "app"."patients"\nWHERE "age" >= 18\nORDER BY "id" ASC\nLIMIT 5',
  );
});

// ── the parts that must not be interpolated raw ─────────────────────────────

test('an operator outside the known set is refused', () => {
  assert.throws(
    () => spec({ filters: [{ column: 'a', operator: '= 1 OR 1' as never, value: 'x' }] }),
    /operator/i,
  );
});

test('a payload in a value cannot end the statement', () => {
  const sql = spec({ filters: [{ column: 'a', operator: '=', value: "x'; DROP TABLE t; --" }] });
  assert.equal((sql.match(/'/g) || []).length % 2, 0, 'quotes stay balanced');
  assert.ok(sql.includes("x''; DROP"));
});

test('a payload in a column name is quoted as an identifier', () => {
  const sql = spec({ columns: ['a"; DROP TABLE t; --'] });
  assert.match(sql, /"a""; DROP TABLE t; --"/);
});

test('a limit that is not a positive integer is refused', () => {
  for (const bad of [0, -1, 2.5]) {
    assert.throws(
      () => buildSelectFromSpec({ engine: 'mysql', table, columns: [], filters: [], sorts: [], limit: bad }),
      /limit/i,
      String(bad),
    );
  }
});

test('the operator list is the one the UI offers', () => {
  assert.ok(COMPARISON_OPERATORS.includes('='));
  assert.ok(COMPARISON_OPERATORS.includes('IS NULL'));
  assert.ok(!COMPARISON_OPERATORS.includes('' as never));
});
