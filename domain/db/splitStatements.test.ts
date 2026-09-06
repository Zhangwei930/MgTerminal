import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSqlStatements } from './splitStatements';

test('a single statement comes back as one, without its terminator', () => {
  assert.deepEqual(splitSqlStatements('SELECT 1'), ['SELECT 1']);
  assert.deepEqual(splitSqlStatements('SELECT 1;'), ['SELECT 1']);
  assert.deepEqual(splitSqlStatements('  SELECT 1 ;  '), ['SELECT 1']);
});

test('statements split on the semicolons between them', () => {
  assert.deepEqual(
    splitSqlStatements('SELECT 1; SELECT 2;'),
    ['SELECT 1', 'SELECT 2'],
  );
});

test('empty statements between terminators are dropped', () => {
  assert.deepEqual(splitSqlStatements('SELECT 1;;\n;SELECT 2'), ['SELECT 1', 'SELECT 2']);
  assert.deepEqual(splitSqlStatements(''), []);
  assert.deepEqual(splitSqlStatements('   ;  '), []);
});

// The whole point of parsing rather than String.split(';').
test('a semicolon inside a string literal does not split', () => {
  assert.deepEqual(
    splitSqlStatements("INSERT INTO t VALUES ('a;b'); SELECT 1"),
    ["INSERT INTO t VALUES ('a;b')", 'SELECT 1'],
  );
});

test('a doubled quote inside a literal does not end it', () => {
  assert.deepEqual(
    splitSqlStatements("SELECT 'it''s; fine'; SELECT 2"),
    ["SELECT 'it''s; fine'", 'SELECT 2'],
  );
});

test('a semicolon inside a quoted identifier does not split', () => {
  assert.deepEqual(
    splitSqlStatements('SELECT "a;b" FROM t; SELECT 2'),
    ['SELECT "a;b" FROM t', 'SELECT 2'],
  );
  assert.deepEqual(
    splitSqlStatements('SELECT `a;b` FROM t; SELECT 2'),
    ['SELECT `a;b` FROM t', 'SELECT 2'],
  );
  assert.deepEqual(
    splitSqlStatements('SELECT [a;b] FROM t; SELECT 2'),
    ['SELECT [a;b] FROM t', 'SELECT 2'],
  );
});

test('a semicolon inside a comment does not split', () => {
  assert.deepEqual(
    splitSqlStatements('SELECT 1 -- trailing; comment\n; SELECT 2'),
    ['SELECT 1 -- trailing; comment', 'SELECT 2'],
  );
  assert.deepEqual(
    splitSqlStatements('SELECT 1 /* a; b */; SELECT 2'),
    ['SELECT 1 /* a; b */', 'SELECT 2'],
  );
});

test('a statement that is only a comment is not run', () => {
  assert.deepEqual(splitSqlStatements('-- just a note'), []);
  assert.deepEqual(splitSqlStatements('/* note */;'), []);
  assert.deepEqual(splitSqlStatements('SELECT 1; -- note'), ['SELECT 1']);
});

test('an unterminated literal keeps the rest as one statement rather than splitting inside it', () => {
  // Better to hand the server one broken statement it will reject with a clear
  // message than to slice it into fragments that each fail differently.
  assert.deepEqual(splitSqlStatements("SELECT 'oops; SELECT 2"), ["SELECT 'oops; SELECT 2"]);
});

test('a dollar-quoted Postgres body keeps its semicolons', () => {
  const fn = `CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 1`;
  assert.deepEqual(splitSqlStatements(fn), [
    'CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql',
    'SELECT 1',
  ]);
});

test('a tagged dollar quote is matched by its tag', () => {
  const sql = `SELECT $tag$ a; b $tag$; SELECT 2`;
  assert.deepEqual(splitSqlStatements(sql), ['SELECT $tag$ a; b $tag$', 'SELECT 2']);
});
