import assert from 'node:assert/strict';
import test from 'node:test';
import { UTF8_BOM, toCsv, toJson } from './resultExport';

const columns = [{ name: 'id' }, { name: 'name' }];

// ── CSV ─────────────────────────────────────────────────────────────────────

test('a header row names the columns', () => {
  assert.equal(toCsv(columns, []).trim(), 'id,name');
});

test('plain values are written unquoted', () => {
  assert.equal(toCsv(columns, [[1, 'Ada']]).trim().split('\n')[1], '1,Ada');
});

test('a value containing a comma is quoted', () => {
  assert.match(toCsv(columns, [[1, 'Lovelace, Ada']]), /"Lovelace, Ada"/);
});

test('an embedded quote is doubled inside a quoted field', () => {
  // RFC 4180. Backslash escaping is not CSV and Excel will not read it.
  assert.match(toCsv(columns, [[1, 'say "hi"']]), /"say ""hi"""/);
});

test('a newline inside a value is quoted rather than splitting the row', () => {
  const csv = toCsv(columns, [[1, 'line1\nline2']]);
  assert.match(csv, /"line1\nline2"/);
});

test('a carriage return is quoted too', () => {
  assert.match(toCsv(columns, [[1, 'a\r\nb']]), /"a\r\nb"/);
});

test('a column name needing quotes is quoted in the header', () => {
  assert.match(toCsv([{ name: 'full,name' }], []), /"full,name"/);
});

test('null is an empty field, not the text NULL', () => {
  // "NULL" would come back from a round-trip as a four-character string.
  assert.equal(toCsv(columns, [[1, null]]).trim().split('\n')[1], '1,');
});

test('a leading formula character is neutralised', () => {
  // Excel executes =cmd()... in a cell; prefixing with a quote is the standard
  // defence and keeps the value readable.
  for (const payload of ['=1+1', '+1', '-1', '@SUM(A1)']) {
    const csv = toCsv(columns, [[1, payload]]);
    assert.match(csv, /"'/, `${payload} was not neutralised`);
  }
});

test('a date is written as an ISO timestamp', () => {
  const csv = toCsv(columns, [[1, new Date(Date.UTC(2026, 0, 2))]]);
  assert.match(csv, /2026-01-02/);
});

test('rows are separated by CRLF', () => {
  // RFC 4180, and what Excel on Windows expects.
  assert.ok(toCsv(columns, [[1, 'a'], [2, 'b']]).includes('\r\n'));
});

test('the BOM is a separate export, not baked into the string', () => {
  // Callers writing to a file prepend it; callers copying to the clipboard
  // must not, or the paste starts with an invisible character.
  assert.ok(!toCsv(columns, [[1, 'a']]).startsWith(UTF8_BOM));
  assert.equal(UTF8_BOM, '﻿');
});

// ── JSON ────────────────────────────────────────────────────────────────────

test('json export maps each row onto the column names', () => {
  const parsed = JSON.parse(toJson(columns, [[1, 'Ada']]));
  assert.deepEqual(parsed, [{ id: 1, name: 'Ada' }]);
});

test('json keeps null as null, not as a string', () => {
  const parsed = JSON.parse(toJson(columns, [[1, null]]));
  assert.equal(parsed[0].name, null);
});

test('json writes dates as ISO strings', () => {
  const parsed = JSON.parse(toJson(columns, [[1, new Date(Date.UTC(2026, 0, 2))]]));
  assert.match(parsed[0].name, /^2026-01-02/);
});

test('json export of no rows is an empty array', () => {
  assert.equal(toJson(columns, []).trim(), '[]');
});
