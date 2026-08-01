import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSyncScript, diffSchemas } from './schemaDiff';
import type { SchemaSnapshot } from './schemaDiff';

const col = (name: string, dataType = 'text', nullable = true) => ({ name, dataType, nullable });

const snapshot = (tables: Record<string, ReturnType<typeof col>[]>): SchemaSnapshot => ({
  tables: Object.entries(tables).map(([name, columns]) => ({ name, columns })),
});

const kinds = (diffs: { kind: string }[]) => diffs.map((d) => d.kind);

// ── diffSchemas ─────────────────────────────────────────────────────────────

test('identical schemas produce no differences', () => {
  const s = snapshot({ patients: [col('id', 'integer', false), col('name')] });
  assert.deepEqual(diffSchemas(s, snapshot({ patients: [col('id', 'integer', false), col('name')] })), []);
});

test('a table missing from the target is reported', () => {
  const diffs = diffSchemas(snapshot({ patients: [col('id')] }), snapshot({}));
  assert.deepEqual(kinds(diffs), ['table-missing']);
});

test('a table only in the target is reported separately', () => {
  // Not the same thing as a missing one: removing it destroys data.
  const diffs = diffSchemas(snapshot({}), snapshot({ legacy: [col('id')] }));
  assert.deepEqual(kinds(diffs), ['table-extra']);
});

test('a column missing from the target is reported', () => {
  const diffs = diffSchemas(
    snapshot({ patients: [col('id'), col('email')] }),
    snapshot({ patients: [col('id')] }),
  );
  assert.deepEqual(kinds(diffs), ['column-missing']);
});

test('a column only in the target is reported', () => {
  const diffs = diffSchemas(
    snapshot({ patients: [col('id')] }),
    snapshot({ patients: [col('id'), col('obsolete')] }),
  );
  assert.deepEqual(kinds(diffs), ['column-extra']);
});

test('a differing data type is reported', () => {
  const diffs = diffSchemas(
    snapshot({ patients: [col('age', 'integer')] }),
    snapshot({ patients: [col('age', 'text')] }),
  );
  assert.deepEqual(kinds(diffs), ['column-type']);
});

test('a differing nullability is reported', () => {
  const diffs = diffSchemas(
    snapshot({ patients: [col('id', 'integer', false)] }),
    snapshot({ patients: [col('id', 'integer', true)] }),
  );
  assert.deepEqual(kinds(diffs), ['column-nullable']);
});

test('names are compared case-insensitively', () => {
  // Postgres folds to lower case and Oracle to upper; the same table read from
  // each would otherwise look like two different tables.
  const diffs = diffSchemas(
    snapshot({ Patients: [col('ID', 'integer')] }),
    snapshot({ patients: [col('id', 'integer')] }),
  );
  assert.deepEqual(diffs, []);
});

test('the diff is stable regardless of table order', () => {
  const a = diffSchemas(snapshot({ a: [col('x')], b: [col('y')] }), snapshot({}));
  const b = diffSchemas(snapshot({ b: [col('y')], a: [col('x')] }), snapshot({}));
  assert.deepEqual(a, b);
});

test('an empty comparison is empty', () => {
  assert.deepEqual(diffSchemas(snapshot({}), snapshot({})), []);
});

// ── buildSyncScript ─────────────────────────────────────────────────────────
//
// The safety rule: only additive statements are runnable. Anything that can
// lose data is emitted commented out, so applying the script cannot destroy
// something by accident.

const lines = (script: string) => script.split('\n');
const runnable = (script: string) =>
  lines(script).filter((l) => l.trim() && !l.trim().startsWith('--'));

test('a missing table becomes a runnable CREATE TABLE', () => {
  const source = snapshot({ patients: [col('id', 'integer', false), col('name')] });
  const script = buildSyncScript('postgres', diffSchemas(source, snapshot({})), source);

  assert.match(script, /CREATE TABLE "patients"/);
  assert.ok(runnable(script).some((l) => l.includes('CREATE TABLE')));
});

test('a missing column becomes a runnable ADD COLUMN', () => {
  const source = snapshot({ patients: [col('id'), col('email', 'text')] });
  const diffs = diffSchemas(source, snapshot({ patients: [col('id')] }));
  const script = buildSyncScript('postgres', diffs, source);

  assert.match(script, /ALTER TABLE "patients" ADD COLUMN "email" text/);
  assert.ok(runnable(script).some((l) => l.includes('ADD COLUMN')));
});

test('a column added as NOT NULL is not runnable', () => {
  // The existing rows have no value for it, so the statement fails — or worse,
  // succeeds against an empty table and fails in production.
  const source = snapshot({ patients: [col('id'), col('code', 'text', false)] });
  const diffs = diffSchemas(source, snapshot({ patients: [col('id')] }));
  const script = buildSyncScript('postgres', diffs, source);

  const addLine = lines(script).find((l) => l.includes('ADD COLUMN "code"')) ?? '';
  assert.ok(addLine.trim().startsWith('--'), 'adding a NOT NULL column must be commented out');
});

test('dropping a table is emitted commented out', () => {
  const diffs = diffSchemas(snapshot({}), snapshot({ legacy: [col('id')] }));
  const script = buildSyncScript('postgres', diffs, snapshot({}));

  assert.match(script, /DROP TABLE/);
  assert.ok(!runnable(script).some((l) => l.includes('DROP TABLE')), 'DROP must not be runnable');
});

test('dropping a column is emitted commented out', () => {
  const source = snapshot({ patients: [col('id')] });
  const diffs = diffSchemas(source, snapshot({ patients: [col('id'), col('obsolete')] }));
  const script = buildSyncScript('postgres', diffs, source);

  assert.match(script, /DROP COLUMN/);
  assert.ok(!runnable(script).some((l) => l.includes('DROP COLUMN')));
});

test('a type change is emitted commented out', () => {
  // Narrowing a type truncates; there is no safe automatic answer.
  const source = snapshot({ patients: [col('age', 'integer')] });
  const diffs = diffSchemas(source, snapshot({ patients: [col('age', 'text')] }));
  const script = buildSyncScript('postgres', diffs, source);

  assert.ok(!runnable(script).some((l) => /TYPE|ALTER COLUMN/.test(l)));
});

test('tightening nullability is emitted commented out', () => {
  // SET NOT NULL fails if any existing row holds a null.
  const source = snapshot({ patients: [col('id', 'integer', false)] });
  const diffs = diffSchemas(source, snapshot({ patients: [col('id', 'integer', true)] }));
  const script = buildSyncScript('postgres', diffs, source);

  assert.ok(!runnable(script).some((l) => l.includes('NOT NULL')));
});

test('the script says what it will and will not do', () => {
  const source = snapshot({ patients: [col('id')] });
  const script = buildSyncScript('postgres', diffSchemas(source, snapshot({})), source);
  assert.match(script, /commented out/i);
});

test('no differences produces a script that says so and does nothing', () => {
  const script = buildSyncScript('postgres', [], snapshot({}));
  assert.deepEqual(runnable(script), []);
});

test('identifiers are quoted for the engine', () => {
  const source = snapshot({ order: [col('select')] });
  const script = buildSyncScript('mysql', diffSchemas(source, snapshot({})), source);
  assert.ok(script.includes('`order`'));
  assert.ok(script.includes('`select`'));
});
