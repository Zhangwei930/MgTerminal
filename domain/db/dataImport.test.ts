import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImportStatements,
  inferColumnType,
  parseDelimited,
  parseJsonRows,
  sniffDelimiter,
} from './dataImport';

// ── parseDelimited ──────────────────────────────────────────────────────────
//
// RFC 4180, because the files that land here come out of Excel: quoted fields,
// doubled quotes inside them, and newlines inside those.

test('a plain file splits into a header and rows', () => {
  const parsed = parseDelimited('id,name\n1,Ada\n2,Grace');
  assert.deepEqual(parsed.headers, ['id', 'name']);
  assert.deepEqual(parsed.rows, [['1', 'Ada'], ['2', 'Grace']]);
});

test('a quoted field keeps its commas', () => {
  const parsed = parseDelimited('id,name\n1,"Lovelace, Ada"');
  assert.deepEqual(parsed.rows, [['1', 'Lovelace, Ada']]);
});

test('a doubled quote inside a quoted field is one quote', () => {
  const parsed = parseDelimited('a\n"she said ""hi"""');
  assert.deepEqual(parsed.rows, [['she said "hi"']]);
});

test('a newline inside a quoted field does not start a row', () => {
  const parsed = parseDelimited('a,b\n"line1\nline2",x');
  assert.deepEqual(parsed.rows, [['line1\nline2', 'x']]);
});

test('CRLF line endings are handled, and a trailing newline adds no row', () => {
  const parsed = parseDelimited('a,b\r\n1,2\r\n');
  assert.deepEqual(parsed.rows, [['1', '2']]);
});

test('an empty field is an empty string, not a dropped column', () => {
  const parsed = parseDelimited('a,b,c\n1,,3');
  assert.deepEqual(parsed.rows, [['1', '', '3']]);
});

test('a tab-separated file parses when told the delimiter', () => {
  const parsed = parseDelimited('a\tb\n1\t2', { delimiter: '\t' });
  assert.deepEqual(parsed.rows, [['1', '2']]);
});

test('a row with the wrong column count is reported, not silently padded', () => {
  assert.throws(() => parseDelimited('a,b\n1,2,3'), /row 1/i);
});

test('an empty file yields no headers rather than one empty column', () => {
  assert.deepEqual(parseDelimited('').headers, []);
  assert.deepEqual(parseDelimited('   ').headers, []);
});

// ── sniffDelimiter ──────────────────────────────────────────────────────────

test('the delimiter is guessed from the header line', () => {
  assert.equal(sniffDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(sniffDelimiter('a\tb\tc\n1\t2\t3'), '\t');
  assert.equal(sniffDelimiter('a;b;c\n1;2;3'), ';');
});

test('a single-column file falls back to a comma', () => {
  assert.equal(sniffDelimiter('name\nAda'), ',');
});

// ── inferColumnType ─────────────────────────────────────────────────────────

test('a column of integers is an integer column', () => {
  assert.match(inferColumnType(['1', '2', '30'], 'postgres'), /int/i);
});

test('a decimal point makes it a decimal column, not an integer one', () => {
  assert.match(inferColumnType(['1.5', '2'], 'postgres'), /numeric|decimal|float|double/i);
});

test('anything else is text sized to the longest value', () => {
  const type = inferColumnType(['ada', 'grace'], 'mysql');
  assert.match(type, /varchar\(\d+\)/i);
});

test('blanks are ignored when deciding the type', () => {
  assert.match(inferColumnType(['1', '', '2'], 'postgres'), /int/i);
});

test('an all-blank column still gets a usable type', () => {
  assert.ok(inferColumnType(['', ''], 'postgres').length > 0);
});

// A value that is all digits but too long for a 64-bit integer is an
// identifier, not a number — importing it as one silently rounds it.
test('digits too long to be an integer are treated as text', () => {
  assert.match(inferColumnType(['123456789012345678901234'], 'postgres'), /varchar|text/i);
});

// ── parseJsonRows ───────────────────────────────────────────────────────────

test('an array of objects becomes headers and rows', () => {
  const parsed = parseJsonRows('[{"id":1,"name":"Ada"},{"id":2,"name":"Grace"}]');
  assert.deepEqual(parsed.headers, ['id', 'name']);
  assert.deepEqual(parsed.rows, [['1', 'Ada'], ['2', 'Grace']]);
});

test('a key missing from a later object becomes an empty cell', () => {
  const parsed = parseJsonRows('[{"a":1,"b":2},{"a":3}]');
  assert.deepEqual(parsed.headers, ['a', 'b']);
  assert.deepEqual(parsed.rows, [['1', '2'], ['3', '']]);
});

test('JSON that is not an array of objects is refused', () => {
  assert.throws(() => parseJsonRows('{"a":1}'), /array/i);
  assert.throws(() => parseJsonRows('[1,2]'), /object/i);
  assert.throws(() => parseJsonRows('not json'), /JSON/i);
});

// ── buildImportStatements ───────────────────────────────────────────────────

test('importing into an existing table is INSERTs only', () => {
  const statements = buildImportStatements({
    engine: 'postgres',
    table: { name: 'people' },
    headers: ['id', 'name'],
    rows: [['1', 'Ada']],
    createTable: false,
  });
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^INSERT INTO "people" \("id", "name"\)/);
});

test('creating the table first puts CREATE TABLE ahead of the data', () => {
  const statements = buildImportStatements({
    engine: 'postgres',
    table: { name: 'people' },
    headers: ['id', 'name'],
    rows: [['1', 'Ada']],
    createTable: true,
  });
  assert.match(statements[0], /^CREATE TABLE "people"/);
  assert.match(statements[1], /^INSERT INTO/);
});

test('a blank cell is imported as NULL, not as an empty string', () => {
  // A CSV cannot tell them apart, and NULL is the reading that lets a numeric
  // or date column accept the row at all.
  const statements = buildImportStatements({
    engine: 'postgres',
    table: { name: 't' },
    headers: ['a', 'b'],
    rows: [['1', '']],
    createTable: false,
  });
  assert.match(statements[0], /\('1', NULL\)/);
});

test('values are quoted, so a payload in a cell cannot end the statement', () => {
  const statements = buildImportStatements({
    engine: 'postgres',
    table: { name: 't' },
    headers: ['a'],
    rows: [["x'); DROP TABLE t; --"]],
    createTable: false,
  });
  assert.equal((statements[0].match(/'/g) || []).length % 2, 0);
  assert.ok(statements[0].includes("x''); DROP"));
});

test('a header that is not a valid target column is still quoted as an identifier', () => {
  const statements = buildImportStatements({
    engine: 'mysql',
    table: { name: 't' },
    headers: ['order'],
    rows: [['1']],
    createTable: false,
  });
  assert.match(statements[0], /\(`order`\)/);
});

test('an import with no headers is refused', () => {
  assert.throws(
    () => buildImportStatements({
      engine: 'mysql', table: { name: 't' }, headers: [], rows: [], createTable: false,
    }),
    /column/i,
  );
});

test('large imports are split into batches rather than one giant INSERT', () => {
  const rows = Array.from({ length: 250 }, (_, i) => [String(i)]);
  const statements = buildImportStatements({
    engine: 'mysql', table: { name: 't' }, headers: ['a'], rows, createTable: false, batchSize: 100,
  });
  assert.equal(statements.length, 3, '100 + 100 + 50');
});

// MySQL caps a row at 65535 bytes across all its columns, and utf8mb4 counts
// four per character — so a handful of varchar(4000) columns cannot coexist.
// A wide file was producing a CREATE TABLE the server refuses.
test('a wide text column becomes TEXT rather than a varchar too wide to share a row', () => {
  const long = 'x'.repeat(600);
  assert.match(inferColumnType([long], 'mysql'), /^text$/i);
  assert.match(inferColumnType([long], 'mariadb'), /^text$/i);
});

test('a narrow text column still gets a sized varchar', () => {
  assert.match(inferColumnType(['ada'], 'mysql'), /^varchar\(\d+\)$/i);
});

test('the varchar it does give stays inside what a row can hold', () => {
  const type = inferColumnType(['y'.repeat(200)], 'mysql');
  const width = Number(/varchar\((\d+)\)/i.exec(type)?.[1] ?? 0);
  assert.ok(width > 0 && width <= 1000, `varchar(${width}) is too wide to share a row`);
});
