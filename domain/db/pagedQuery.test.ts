import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPagedQuery, canPaginate } from './pagedQuery';

// ── canPaginate ─────────────────────────────────────────────────────────────

test('a plain SELECT can be paged', () => {
  assert.equal(canPaginate('SELECT * FROM t'), true);
  assert.equal(canPaginate('  select a from t where b = 1  '), true);
  assert.equal(canPaginate('-- note\nSELECT * FROM t'), true);
});

test('anything that is not a SELECT cannot', () => {
  // Paging an UPDATE would silently change what it writes.
  assert.equal(canPaginate('UPDATE t SET a = 1'), false);
  assert.equal(canPaginate('INSERT INTO t VALUES (1)'), false);
  assert.equal(canPaginate('CREATE TABLE t (a int)'), false);
  assert.equal(canPaginate(''), false);
});

test('a WITH clause feeding a SELECT can be paged', () => {
  assert.equal(canPaginate('WITH x AS (SELECT 1) SELECT * FROM x'), true);
});

test('several statements cannot be paged as one', () => {
  assert.equal(canPaginate('SELECT 1; SELECT 2'), false);
});

// ── wrapping engines ────────────────────────────────────────────────────────

test('MySQL and friends wrap the query and page the wrapper', () => {
  assert.equal(
    buildPagedQuery('mysql', 'SELECT * FROM t', { limit: 100, offset: 0 }),
    'SELECT * FROM (SELECT * FROM t) AS magies_page LIMIT 100 OFFSET 0',
  );
  assert.equal(
    buildPagedQuery('sqlite', 'SELECT * FROM t', { limit: 50, offset: 50 }),
    'SELECT * FROM (SELECT * FROM t) AS magies_page LIMIT 50 OFFSET 50',
  );
});

test('a trailing semicolon is dropped before wrapping', () => {
  assert.match(buildPagedQuery('postgres', 'SELECT 1;', { limit: 10, offset: 0 }), /\(SELECT 1\) AS/);
});

test('Oracle wraps too, but takes no AS before the alias', () => {
  assert.equal(
    buildPagedQuery('oracle', 'SELECT * FROM t', { limit: 25, offset: 75 }),
    'SELECT * FROM (SELECT * FROM t) magies_page OFFSET 75 ROWS FETCH NEXT 25 ROWS ONLY',
  );
});

// ── SQL Server ──────────────────────────────────────────────────────────────
//
// It cannot be wrapped: a subquery carrying its own ORDER BY is a syntax error
// there, and dropping the ORDER BY would change which rows a page holds. So
// the clause is appended to the original statement instead.

test('SQL Server appends to a query that already orders', () => {
  assert.equal(
    buildPagedQuery('mssql', 'SELECT * FROM t ORDER BY id', { limit: 20, offset: 40 }),
    'SELECT * FROM t ORDER BY id OFFSET 40 ROWS FETCH NEXT 20 ROWS ONLY',
  );
});

test('SQL Server supplies an ordering when the query has none', () => {
  // OFFSET is only legal after ORDER BY, and (SELECT NULL) is the no-op form.
  assert.equal(
    buildPagedQuery('mssql', 'SELECT * FROM t', { limit: 20, offset: 0 }),
    'SELECT * FROM t ORDER BY (SELECT NULL) OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY',
  );
});

test('an ORDER BY inside a subquery does not count as the outer one', () => {
  const sql = 'SELECT * FROM (SELECT a FROM b ORDER BY a) x';
  const paged = buildPagedQuery('mssql', sql, { limit: 5, offset: 0 });
  assert.match(paged, /\) x ORDER BY \(SELECT NULL\) OFFSET/);
});

test('an ORDER BY inside a string literal does not count either', () => {
  const sql = "SELECT * FROM t WHERE note = 'order by x'";
  assert.match(buildPagedQuery('mssql', sql, { limit: 5, offset: 0 }), /ORDER BY \(SELECT NULL\)/);
});

test('SQL Server refuses a query that already pages itself', () => {
  assert.throws(
    () => buildPagedQuery('mssql', 'SELECT * FROM t ORDER BY id OFFSET 5 ROWS', { limit: 5, offset: 0 }),
    /already/i,
  );
});

// ── guards ──────────────────────────────────────────────────────────────────

test('a non-SELECT is refused rather than wrapped', () => {
  assert.throws(() => buildPagedQuery('mysql', 'DELETE FROM t', { limit: 10, offset: 0 }), /SELECT/i);
});

test('the limit and offset must be non-negative integers', () => {
  for (const bad of [0, -1, 1.5, NaN]) {
    assert.throws(
      () => buildPagedQuery('mysql', 'SELECT 1', { limit: bad, offset: 0 }),
      /limit/i,
      `limit ${bad}`,
    );
  }
  for (const bad of [-1, 1.5, NaN]) {
    assert.throws(
      () => buildPagedQuery('mysql', 'SELECT 1', { limit: 10, offset: bad }),
      /offset/i,
      `offset ${bad}`,
    );
  }
});

// ── quoted identifiers are not keywords ─────────────────────────────────────
//
// The scan masked string literals and comments but not quoted identifiers, so
// a column whose name happens to contain a paging keyword was read as one.

test('a column named "offset" does not look like a query that pages itself', () => {
  assert.doesNotThrow(
    () => buildPagedQuery('mssql', 'SELECT "offset" FROM t', { limit: 10, offset: 0 }),
    'a legitimate query was refused',
  );
  assert.doesNotThrow(
    () => buildPagedQuery('mssql', 'SELECT `offset` FROM t', { limit: 10, offset: 0 }),
  );
  assert.doesNotThrow(
    () => buildPagedQuery('mssql', 'SELECT [offset] FROM t', { limit: 10, offset: 0 }),
  );
});

test('a column named "order by" does not count as the statement ordering', () => {
  // Without an ORDER BY of its own, SQL Server needs one supplied — otherwise
  // the OFFSET clause is a syntax error.
  const sql = buildPagedQuery('mssql', 'SELECT "order by" FROM t', { limit: 10, offset: 0 });
  assert.match(sql, /ORDER BY \(SELECT NULL\) OFFSET/);
});

test('a parenthesis inside a quoted name does not shift the nesting depth', () => {
  // Depth is what tells an outer ORDER BY from a subquery's.
  const sql = buildPagedQuery('mssql', 'SELECT "a(b" FROM t ORDER BY id', { limit: 5, offset: 10 });
  assert.match(sql, /ORDER BY id OFFSET 10 ROWS FETCH NEXT 5 ROWS ONLY$/);
  assert.ok(!sql.includes('SELECT NULL'), 'the real ORDER BY was found');
});

test('a quoted name still does not hide a real keyword after it', () => {
  const sql = buildPagedQuery('mssql', 'SELECT "col" FROM t ORDER BY "col"', { limit: 5, offset: 0 });
  assert.match(sql, /ORDER BY "col" OFFSET 0 ROWS FETCH NEXT 5 ROWS ONLY$/);
});
