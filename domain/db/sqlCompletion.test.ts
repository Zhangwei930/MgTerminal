import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SQL_KEYWORDS,
  buildSqlCompletions,
  resolveQualifier,
  resolveQualifiedTable,
} from './sqlCompletion';

const tables = [
  { name: 'patients', kind: 'table' as const },
  { name: 'visits', kind: 'table' as const },
  { name: 'v_active_patients', kind: 'view' as const },
];

const columns = [
  { name: 'id', dataType: 'integer', nullable: false, position: 1 },
  { name: 'full_name', dataType: 'text', nullable: true, position: 2 },
];

const labels = (candidates: { label: string }[]) => candidates.map((c) => c.label);

// ── resolveQualifier ────────────────────────────────────────────────────────
//
// Whether the cursor sits right after `something.` decides the entire shape of
// the suggestion list: columns of that one table, or everything.

test('a bare word is not a qualifier', () => {
  assert.equal(resolveQualifier('SELECT * FROM pat'), null);
});

test('a trailing dot qualifies the word before it', () => {
  assert.equal(resolveQualifier('SELECT p.'), 'p');
});

test('a partially typed column still resolves its qualifier', () => {
  assert.equal(resolveQualifier('SELECT patients.fu'), 'patients');
});

test('a dot inside a number is not a qualifier', () => {
  // `LIMIT 1.` would otherwise look up a table called "1".
  assert.equal(resolveQualifier('SELECT 1.'), null);
});

test('only the nearest qualifier counts', () => {
  assert.equal(resolveQualifier('SELECT a.b, patients.'), 'patients');
});

// ── resolveQualifiedTable ───────────────────────────────────────────────────
//
// `p.` is useless unless we can work out that p is patients.

test('a qualifier that is a table name resolves to itself', () => {
  assert.equal(resolveQualifiedTable('SELECT * FROM patients', 'patients', tables), 'patients');
});

test('an alias introduced by FROM resolves to its table', () => {
  assert.equal(resolveQualifiedTable('SELECT * FROM patients p WHERE p.', 'p', tables), 'patients');
});

test('an alias introduced with AS resolves too', () => {
  assert.equal(resolveQualifiedTable('SELECT * FROM patients AS p WHERE p.', 'p', tables), 'patients');
});

test('an alias on a JOIN resolves', () => {
  const sql = 'SELECT * FROM patients p JOIN visits v ON v.patient_id = p.id WHERE v.';
  assert.equal(resolveQualifiedTable(sql, 'v', tables), 'visits');
});

test('matching is case-insensitive on both sides', () => {
  assert.equal(resolveQualifiedTable('select * from PATIENTS P where p.', 'p', tables), 'patients');
});

test('an unknown qualifier resolves to nothing', () => {
  assert.equal(resolveQualifiedTable('SELECT * FROM patients', 'zzz', tables), null);
});

test('a keyword is never mistaken for an alias', () => {
  // `FROM patients WHERE` must not make WHERE an alias of patients.
  assert.equal(resolveQualifiedTable('SELECT * FROM patients WHERE x.', 'where', tables), null);
});

// ── buildSqlCompletions ─────────────────────────────────────────────────────

test('an unqualified position offers keywords and tables', () => {
  const out = labels(buildSqlCompletions({ lineUpToCursor: 'SELECT * FROM ', tables, columns: null }));
  assert.ok(out.includes('patients'), 'tables must be offered');
  assert.ok(out.includes('SELECT'), 'keywords must be offered');
});

test('a qualified position offers only that table\'s columns', () => {
  const out = buildSqlCompletions({ lineUpToCursor: 'SELECT p.', tables, columns });
  assert.deepEqual(labels(out), ['id', 'full_name']);
  // Offering keywords or other tables after a dot is just noise.
  assert.ok(out.every((c) => c.kind === 'column'));
});

test('a qualified position with no columns yet offers nothing', () => {
  // Better an empty list than silently falling back to every table name, which
  // would suggest the qualifier resolved when it did not.
  const out = buildSqlCompletions({ lineUpToCursor: 'SELECT p.', tables, columns: null });
  assert.deepEqual(out, []);
});

test('views are distinguishable from tables', () => {
  const out = buildSqlCompletions({ lineUpToCursor: 'FROM ', tables, columns: null });
  const view = out.find((c) => c.label === 'v_active_patients');
  assert.equal(view?.kind, 'view');
});

test('a column carries its type and nullability as detail', () => {
  const out = buildSqlCompletions({ lineUpToCursor: 'SELECT p.', tables, columns });
  const id = out.find((c) => c.label === 'id');
  assert.match(id?.detail ?? '', /integer/);
  assert.match(id?.detail ?? '', /not null/i);
});

test('the keyword list covers the statements a DBA actually types', () => {
  for (const word of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'JOIN', 'WHERE', 'GROUP BY', 'ORDER BY']) {
    assert.ok(SQL_KEYWORDS.includes(word), `missing ${word}`);
  }
});

test('keywords are unique', () => {
  assert.equal(new Set(SQL_KEYWORDS).size, SQL_KEYWORDS.length);
});
