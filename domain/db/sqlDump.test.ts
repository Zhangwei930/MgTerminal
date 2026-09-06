import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbEngine } from '../models';
import { buildInsertStatementList, buildInsertStatements } from './sqlDump';

const columns = [{ name: 'id' }, { name: 'name' }];
const build = (rows: unknown[][], engine: DbEngine = 'postgres', batchSize?: number) =>
  buildInsertStatements({ engine, table: 'patients', columns, rows, batchSize });

test('one row becomes one INSERT', () => {
  assert.equal(build([[1, 'Ada']]), `INSERT INTO "patients" ("id", "name") VALUES\n  (1, 'Ada');`);
});

test('rows are batched into a single multi-row INSERT', () => {
  const sql = build([[1, 'a'], [2, 'b']]);
  assert.equal(sql.match(/INSERT INTO/g)?.length, 1, 'one statement, not one per row');
  assert.match(sql, /\(1, 'a'\),\n {2}\(2, 'b'\);/);
});

test('a large result is split into several statements', () => {
  // One statement with a hundred thousand rows is rejected by most servers and
  // unreadable in an editor either way.
  const rows = Array.from({ length: 5 }, (_, i) => [i, `n${i}`]);
  const sql = build(rows, 'postgres', 2);
  assert.equal(sql.match(/INSERT INTO/g)?.length, 3, '2 + 2 + 1');
});

test('identifiers are quoted for the engine', () => {
  assert.ok(build([[1, 'a']], 'mysql').includes('`patients` (`id`, `name`)'));
  assert.ok(build([[1, 'a']], 'mssql').includes('[patients] ([id], [name])'));
});

test('a string value has its quotes doubled', () => {
  assert.match(build([[1, "it's"]]), /'it''s'/);
});

test('null is written as NULL, not as an empty string', () => {
  assert.match(build([[1, null]]), /\(1, NULL\)/);
});

test('a boolean is written bare', () => {
  assert.match(build([[1, true]]), /\(1, TRUE\)/);
});

test('a date is written as local wall-clock time the server will read back', () => {
  // toISOString() shifted the value by the local offset and appended a Z that
  // MySQL's DATETIME rejects, so a dump either failed to restore or restored a
  // different instant than it was taken from.
  const value = new Date(2026, 0, 2, 3, 4, 5, 678);
  assert.match(build([[1, value]]), /'2026-01-02 03:04:05\.678'/);
});

test('binary is dumped as a byte literal, not as a JSON object', () => {
  // A bytea/BLOB column arrives as a Buffer and crosses IPC as a Uint8Array.
  // Serialising it as {"0":170,"1":187} restores silently corrupted data.
  assert.match(build([[1, new Uint8Array([0xaa, 0xbb])]]), /'\\xaabb'::bytea/);
  assert.match(build([[1, new Uint8Array([0xaa, 0xbb])]], 'mysql'), /X'AABB'/);
});

test('every cell is formatted for the engine, whatever its position in the row', () => {
  // row.map(formatSqlValue) handed Array#map's index to the engine parameter,
  // so only column 0 was ever formatted for the real engine.
  const sql = buildInsertStatements({
    engine: 'mssql',
    table: 'flags',
    columns: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    rows: [[true, true, true]],
  });
  assert.match(sql, /\(1, 1, 1\)/, 'SQL Server has no TRUE keyword in any column');
});

test('a schema-qualified target keeps its two parts separate', () => {
  const sql = buildInsertStatements({
    engine: 'postgres',
    table: { schema: 'tenant_a', name: 'patients' },
    columns,
    rows: [[1, 'Ada']],
  });
  assert.match(sql, /INSERT INTO "tenant_a"\."patients"/);
});

test('an object value is serialised as JSON, not [object Object]', () => {
  assert.match(build([[1, { a: 1 }]]), /'\{"a":1\}'/);
});

test('an injection payload cannot end the statement', () => {
  const sql = build([[1, "x'; DROP TABLE t; --"]]);
  assert.equal((sql.match(/'/g) || []).length % 2, 0, 'quotes must stay balanced');
  assert.ok(sql.includes("x''; DROP"));
});

test('no rows produces no statements at all', () => {
  // An INSERT with an empty VALUES list is a syntax error.
  assert.equal(build([]), '');
});

test('a row with the wrong column count is refused', () => {
  // Emitting it would produce a statement the server rejects, at whatever point
  // in the file it happens to be.
  assert.throws(() => build([[1, 'a'], [2]]), /column/i);
});

test('a table with no columns is refused', () => {
  assert.throws(
    () => buildInsertStatements({ engine: 'postgres', table: 't', columns: [], rows: [[1]] }),
    /column/i,
  );
});

// ── statements as a list ────────────────────────────────────────────────────
//
// Callers that run the statements one at a time used to recover them by
// splitting the joined string on the blank line between them. A cell holding a
// blank line — a notes or description column, routinely — contains that exact
// delimiter, so the split cut through the middle of a string literal and both
// halves were syntax errors.

test('a value containing a blank line does not split a statement in two', () => {
  const rows = [[1, 'first paragraph\n\nsecond paragraph']];
  const list = buildInsertStatementList({
    engine: 'postgres', table: 'notes', columns, rows,
  });

  assert.equal(list.length, 1, 'one row is one statement, whatever is in it');
  assert.match(list[0], /first paragraph\n\nsecond paragraph/);
  assert.equal((list[0].match(/'/g) || []).length % 2, 0, 'quotes stay balanced');
});

test('the list and the joined form hold the same statements', () => {
  const rows = Array.from({ length: 5 }, (_, i) => [i, `n${i}`]);
  const list = buildInsertStatementList({
    engine: 'postgres', table: 'patients', columns, rows, batchSize: 2,
  });
  assert.equal(list.length, 3, '2 + 2 + 1');
  assert.equal(list.join('\n\n'), buildInsertStatements({
    engine: 'postgres', table: 'patients', columns, rows, batchSize: 2,
  }));
});

test('no rows yields no statements rather than one empty string', () => {
  assert.deepEqual(
    buildInsertStatementList({ engine: 'postgres', table: 't', columns, rows: [] }),
    [],
  );
});
