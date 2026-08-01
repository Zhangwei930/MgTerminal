import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbEngine } from '../models';
import { buildPreviewSelect, quoteSqlIdentifier } from './previewQuery';

const ENGINES: DbEngine[] = ['mysql', 'postgres', 'mssql', 'oracle'];

// ── quoteSqlIdentifier ──────────────────────────────────────────────────────
//
// A table name here goes into SQL the user is about to run. It is an
// *identifier*, not a literal, so single-quoting it is wrong — each engine has
// its own delimiter, and its own way of escaping that delimiter.

test('each engine uses its own identifier delimiter', () => {
  assert.equal(quoteSqlIdentifier('mysql', 'users'), '`users`');
  assert.equal(quoteSqlIdentifier('postgres', 'users'), '"users"');
  assert.equal(quoteSqlIdentifier('oracle', 'users'), '"users"');
  assert.equal(quoteSqlIdentifier('mssql', 'users'), '[users]');
});

test('an embedded delimiter is doubled, not dropped', () => {
  assert.equal(quoteSqlIdentifier('mysql', 'we`ird'), '`we``ird`');
  assert.equal(quoteSqlIdentifier('postgres', 'we"ird'), '"we""ird"');
  assert.equal(quoteSqlIdentifier('mssql', 'we]ird'), '[we]]ird]');
});

test('a name carrying the wrong engine delimiter is left alone', () => {
  // A backtick is not special in Postgres; escaping it would corrupt the name.
  assert.equal(quoteSqlIdentifier('postgres', 'we`ird'), '"we`ird"');
});

test('an injection payload cannot escape the identifier', () => {
  for (const engine of ENGINES) {
    const quoted = quoteSqlIdentifier(engine, 'x`"]; DROP TABLE t; --');
    const delimiter = quoted[0];
    const closing = engine === 'mssql' ? ']' : delimiter;
    const inner = quoted.slice(1, -1);
    // Every occurrence of the closing delimiter inside must be doubled, so none
    // of them can terminate the identifier early.
    assert.equal(
      inner.split(closing).length - 1,
      (inner.match(new RegExp(`\\${closing}\\${closing}`, 'g')) || []).length * 2,
      `${engine} left an unescaped delimiter`,
    );
  }
});

test('non-strings are rejected rather than coerced', () => {
  for (const bad of [null, undefined, 42, {}]) {
    assert.throws(
      () => quoteSqlIdentifier('mysql', bad as unknown as string),
      /string/i,
      `should reject ${JSON.stringify(bad)}`,
    );
  }
});

test('an empty name is rejected — it cannot produce valid SQL', () => {
  assert.throws(() => quoteSqlIdentifier('mysql', ''), /empty/i);
});

// ── buildPreviewSelect ──────────────────────────────────────────────────────

test('every engine produces a runnable preview select', () => {
  for (const engine of ENGINES) {
    const sql = buildPreviewSelect(engine, 'patients');
    assert.match(sql, /^SELECT /);
    assert.ok(sql.includes('patients'), `${engine} lost the table name`);
  }
});

test('each engine uses its own row-limiting syntax', () => {
  // The whole reason this is not one template string.
  assert.match(buildPreviewSelect('mysql', 't'), /LIMIT 100/);
  assert.match(buildPreviewSelect('postgres', 't'), /LIMIT 100/);
  assert.match(buildPreviewSelect('mssql', 't'), /SELECT TOP 100/);
  assert.match(buildPreviewSelect('oracle', 't'), /FETCH FIRST 100 ROWS ONLY/);
});

test('SQL Server puts TOP before the column list, not after the table', () => {
  const sql = buildPreviewSelect('mssql', 't');
  assert.ok(sql.indexOf('TOP') < sql.indexOf('FROM'), 'TOP must precede FROM');
});

test('the row limit is configurable', () => {
  assert.match(buildPreviewSelect('postgres', 't', 5), /LIMIT 5/);
  assert.match(buildPreviewSelect('mssql', 't', 5), /TOP 5/);
});

test('a non-integer limit is rejected rather than interpolated', () => {
  // Otherwise the limit is a second injection point.
  for (const bad of ['10; DROP TABLE t', 0, -1, 1.5, NaN]) {
    assert.throws(
      () => buildPreviewSelect('postgres', 't', bad as unknown as number),
      /limit/i,
      `should reject limit ${String(bad)}`,
    );
  }
});

test('the table name is quoted as an identifier in the preview', () => {
  assert.match(buildPreviewSelect('mysql', 'order'), /`order`/);
  // A reserved word is exactly why this must be quoted at all.
  assert.match(buildPreviewSelect('postgres', 'order'), /"order"/);
});

test('an unknown engine is rejected loudly', () => {
  assert.throws(() => buildPreviewSelect('cassandra' as DbEngine, 't'), /unsupported|unknown/i);
});
