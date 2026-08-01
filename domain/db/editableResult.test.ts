import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEditableTable } from './editableResult';

// A results grid can only offer to edit a cell if it knows which table the row
// came from — and getting that wrong writes to the wrong table. So this
// answers "no" for anything it cannot be certain of.

test('a plain single-table select is editable', () => {
  assert.equal(resolveEditableTable('SELECT * FROM patients'), 'patients');
});

test('an aliased single-table select is editable', () => {
  assert.equal(resolveEditableTable('SELECT p.id, p.name FROM patients p WHERE p.id > 3'), 'patients');
  assert.equal(resolveEditableTable('SELECT * FROM patients AS p'), 'patients');
});

test('trailing clauses do not prevent editing', () => {
  assert.equal(resolveEditableTable('SELECT * FROM patients ORDER BY id DESC LIMIT 100'), 'patients');
  assert.equal(resolveEditableTable('SELECT * FROM patients WHERE age > 40'), 'patients');
});

test('leading whitespace, comments and a trailing semicolon are tolerated', () => {
  assert.equal(resolveEditableTable('  select * from patients ;  '), 'patients');
  assert.equal(resolveEditableTable('-- recent\nSELECT * FROM patients'), 'patients');
});

test('a schema-qualified table keeps its qualifier', () => {
  // Editing must target the same table the rows came from, not a same-named
  // one in the search path.
  assert.equal(resolveEditableTable('SELECT * FROM public.patients'), 'public.patients');
});

// ── Everything below must refuse ────────────────────────────────────────────

test('a join is not editable', () => {
  // A row spans two tables; there is no single table to write back to.
  assert.equal(resolveEditableTable('SELECT * FROM patients p JOIN visits v ON v.pid = p.id'), null);
  assert.equal(resolveEditableTable('SELECT * FROM patients LEFT JOIN visits ON 1=1'), null);
});

test('a comma join is not editable', () => {
  assert.equal(resolveEditableTable('SELECT * FROM patients, visits'), null);
});

test('an aggregate or grouped result is not editable', () => {
  // The rows are computed, not stored.
  assert.equal(resolveEditableTable('SELECT count(*) FROM patients'), null);
  assert.equal(resolveEditableTable('SELECT dept, count(*) FROM patients GROUP BY dept'), null);
  assert.equal(resolveEditableTable('SELECT DISTINCT dept FROM patients'), null);
});

test('a set operation is not editable', () => {
  assert.equal(resolveEditableTable('SELECT * FROM patients UNION SELECT * FROM archive'), null);
  assert.equal(resolveEditableTable('SELECT * FROM a EXCEPT SELECT * FROM b'), null);
});

test('a subquery or CTE is not editable', () => {
  assert.equal(resolveEditableTable('SELECT * FROM (SELECT * FROM patients) t'), null);
  assert.equal(resolveEditableTable('WITH t AS (SELECT 1) SELECT * FROM t'), null);
});

test('anything that is not a SELECT is not editable', () => {
  assert.equal(resolveEditableTable('UPDATE patients SET x = 1'), null);
  assert.equal(resolveEditableTable('SHOW TABLES'), null);
  assert.equal(resolveEditableTable(''), null);
});

test('multiple statements are not editable', () => {
  // Only the last one produced the grid, and pinning that down is not worth
  // the risk of writing to the wrong table.
  assert.equal(resolveEditableTable('SELECT * FROM a; SELECT * FROM patients'), null);
});

test('a semicolon inside a string literal does not look like a second statement', () => {
  assert.equal(resolveEditableTable("SELECT * FROM patients WHERE note = 'a;b'"), 'patients');
});
