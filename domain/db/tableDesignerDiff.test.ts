import assert from 'node:assert/strict';
import test from 'node:test';
import { type DesignerRow, diffTableDesign } from './tableDesignerDiff';

const table = { schema: 'app', name: 'patients' };
const base: DesignerRow[] = [
  { name: 'id', dataType: 'integer', nullable: false, primaryKey: true },
  { name: 'name', dataType: 'text', nullable: true },
];
/** The rows as the designer holds them: server columns carry originalName. */
const asRows = (columns: DesignerRow[]): DesignerRow[] =>
  columns.map((c) => ({ ...c, originalName: c.name }));

const diff = (edited: DesignerRow[]) =>
  diffTableDesign({ engine: 'postgres', table, original: base, edited });

test('an untouched design produces no statements', () => {
  assert.deepEqual(diff(asRows(base)), []);
});

test('a new row becomes ADD COLUMN', () => {
  const statements = diff([...asRows(base), { name: 'notes', dataType: 'text', nullable: true }]);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /ADD COLUMN "notes" text;/);
});

test('a removed row becomes DROP COLUMN', () => {
  const statements = diff(asRows(base).filter((c) => c.name !== 'name'));
  assert.deepEqual(statements, ['ALTER TABLE "app"."patients" DROP COLUMN "name";']);
});

test('a renamed row becomes RENAME COLUMN, keyed on where it came from', () => {
  const rows = asRows(base);
  rows[1] = { ...rows[1], name: 'full_name' };
  const statements = diff(rows);
  assert.deepEqual(statements, ['ALTER TABLE "app"."patients" RENAME COLUMN "name" TO "full_name";']);
});

test('a changed type becomes ALTER COLUMN', () => {
  const rows = asRows(base);
  rows[1] = { ...rows[1], dataType: 'varchar(120)' };
  const statements = diff(rows);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /ALTER COLUMN "name" TYPE varchar\(120\)/);
});

test('a changed nullability alone still emits the change', () => {
  const rows = asRows(base);
  rows[1] = { ...rows[1], nullable: false };
  const statements = diff(rows);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /SET NOT NULL/);
});

// A rename and a retype in one edit are two different statements, and the
// rename has to land first or the retype names a column that is not there yet.
test('a row that is both renamed and retyped renames before it retypes', () => {
  const rows = asRows(base);
  rows[1] = { ...rows[1], name: 'full_name', dataType: 'varchar(120)' };
  const statements = diff(rows);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /RENAME COLUMN "name" TO "full_name"/);
  assert.match(statements[1], /ALTER COLUMN "full_name" TYPE varchar\(120\)/);
});

// Dropping first would throw away data the user may still be moving out of the
// old column with the statements that come before it.
test('drops come last', () => {
  const rows = [
    ...asRows(base).filter((c) => c.name !== 'name'),
    { name: 'notes', dataType: 'text', nullable: true },
  ];
  const statements = diff(rows);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /ADD COLUMN "notes"/);
  assert.match(statements[1], /DROP COLUMN "name"/);
});

test('a design with every column removed is refused rather than emptying the table', () => {
  assert.throws(() => diff([]), /at least one column/i);
});

test('two rows claiming the same name are refused', () => {
  const rows = asRows(base);
  rows[1] = { ...rows[1], name: 'id' };
  assert.throws(() => diff(rows), /duplicate column/i);
});

test('a row with no name is refused before anything is generated', () => {
  const rows = [...asRows(base), { name: '  ', dataType: 'text', nullable: true }];
  assert.throws(() => diff(rows), /name/i);
});

test('a row with no type is refused', () => {
  const rows = [...asRows(base), { name: 'notes', dataType: '', nullable: true }];
  assert.throws(() => diff(rows), /type/i);
});
