const test = require("node:test");
const assert = require("node:assert/strict");

const { isReadOnlyStatement, stripSqlNoise } = require("./sqlStatementKind.cjs");

/**
 * This classifier routes AI-issued SQL: read-only goes through db.query.readonly
 * with no prompt, anything else goes through db.query.write and must raise a
 * confirm-mode approval. So the dangerous direction is a write classified as a
 * read — that silently skips approval. Every ambiguous case must resolve to
 * "not read-only".
 */

const readOnly = (sql) => assert.equal(isReadOnlyStatement(sql), true, `expected read-only: ${sql}`);
const notReadOnly = (sql) => assert.equal(isReadOnlyStatement(sql), false, `expected NOT read-only: ${sql}`);

test("plain reads are read-only", () => {
  readOnly("SELECT 1");
  readOnly("select id, name from patients where id = 3");
  readOnly("SHOW TABLES");
  readOnly("EXPLAIN SELECT * FROM t");
  readOnly("DESCRIBE patients");
  readOnly("DESC patients");
  readOnly("WITH recent AS (SELECT * FROM visits) SELECT * FROM recent");
});

test("leading whitespace and mixed case do not matter", () => {
  readOnly("   \n\t SeLeCt 1");
  notReadOnly("   \n\t DeLeTe FROM t");
});

test("every CRUD write verb is not read-only", () => {
  for (const sql of [
    "INSERT INTO t VALUES (1)",
    "UPDATE t SET a = 1",
    "DELETE FROM t",
    "MERGE INTO t USING s ON (t.id = s.id) WHEN MATCHED THEN UPDATE SET t.a = s.a",
    "REPLACE INTO t VALUES (1)",
    "UPSERT INTO t VALUES (1)",
  ]) notReadOnly(sql);
});

test("DDL and privilege changes are not read-only", () => {
  for (const sql of [
    "DROP TABLE t",
    "CREATE TABLE t (id int)",
    "ALTER TABLE t ADD COLUMN a int",
    "TRUNCATE TABLE t",
    "RENAME TABLE a TO b",
    "GRANT SELECT ON t TO alice",
    "REVOKE SELECT ON t FROM alice",
  ]) notReadOnly(sql);
});

test("procedure calls are not read-only — their body is opaque", () => {
  notReadOnly("CALL do_something()");
  notReadOnly("EXEC sp_who");
  notReadOnly("EXECUTE some_proc");
});

test("transaction control is not read-only", () => {
  for (const sql of ["COMMIT", "ROLLBACK", "BEGIN", "START TRANSACTION", "SET autocommit = 0"]) {
    notReadOnly(sql);
  }
});

// ── the cases that actually matter ──────────────────────────────────────────

test("comments cannot smuggle a write past the leading keyword", () => {
  notReadOnly("/* harmless */ DELETE FROM t");
  notReadOnly("-- just looking\nDROP TABLE t");
  notReadOnly("/*x*/DELETE FROM t");
  notReadOnly("/* multi\n   line */ UPDATE t SET a = 1");
  readOnly("/* report */ SELECT 1");
  readOnly("-- report\nSELECT 1");
});

test("a trailing statement after a semicolon is not ignored", () => {
  notReadOnly("SELECT 1; DELETE FROM t");
  notReadOnly("SELECT 1;DROP TABLE t");
  notReadOnly("SELECT 1; -- ok\n UPDATE t SET a = 1");
  readOnly("SELECT 1; SELECT 2");
  readOnly("SELECT 1;");
  readOnly("SELECT 1 ;  ");
});

test("a write hidden in a CTE is not read-only", () => {
  // Postgres allows data-modifying statements inside WITH — the statement
  // starts with WITH and ends with SELECT, but it deletes rows.
  notReadOnly("WITH gone AS (DELETE FROM t RETURNING *) SELECT * FROM gone");
  notReadOnly("WITH x AS (INSERT INTO t VALUES (1) RETURNING id) SELECT * FROM x");
  notReadOnly("WITH x AS (UPDATE t SET a = 1 RETURNING *) SELECT count(*) FROM x");
});

test("SELECT that writes to disk or takes locks is not read-only", () => {
  notReadOnly("SELECT * FROM t INTO OUTFILE '/tmp/dump.csv'");
  notReadOnly("SELECT * FROM t INTO DUMPFILE '/tmp/dump.bin'");
  notReadOnly("SELECT * FROM t FOR UPDATE");
  notReadOnly("SELECT * FROM t LOCK IN SHARE MODE");
  notReadOnly("SELECT * INTO new_table FROM t");
});

test("keywords inside string literals do not flip the verdict", () => {
  // Would otherwise force a pointless approval on an ordinary read.
  readOnly("SELECT 'DELETE FROM t' AS note");
  readOnly("SELECT * FROM audit WHERE action = 'DROP TABLE'");
  readOnly(`SELECT "UPDATE" FROM t`);
  readOnly("SELECT * FROM t WHERE note = 'it''s a DELETE'");
});

test("identifiers merely containing a verb stay read-only", () => {
  readOnly("SELECT * FROM update_log");
  readOnly("SELECT deleted_at FROM patients");
  readOnly("SELECT * FROM t WHERE inserted_by = 1");
});

test("unparseable or empty input is never read-only", () => {
  for (const sql of ["", "   ", null, undefined, 42, {}, "\n\n", "/* only a comment */", ";;;"]) {
    assert.equal(isReadOnlyStatement(sql), false, `expected NOT read-only: ${JSON.stringify(sql)}`);
  }
});

test("an unrecognised leading keyword is not read-only", () => {
  notReadOnly("VACUUM");
  notReadOnly("LOAD DATA INFILE '/tmp/x' INTO TABLE t");
  notReadOnly("COPY t FROM '/tmp/x'");
  notReadOnly("frobnicate the database");
});

test("stripSqlNoise removes comments and literal contents, keeping structure", () => {
  assert.equal(stripSqlNoise("SELECT /* hi */ 1"), "SELECT  1");
  assert.equal(stripSqlNoise("SELECT 1 -- trailing\n, 2"), "SELECT 1 \n, 2");
  assert.equal(stripSqlNoise("SELECT 'abc'"), "SELECT ''");
  assert.equal(stripSqlNoise(`SELECT "abc"`), `SELECT ""`);
  assert.equal(
    stripSqlNoise("SELECT 'a''b'"),
    "SELECT ''",
    "an escaped quote must not end the literal early",
  );
});

// Verbs that only carry meaning as a *leading* keyword (SET, BEGIN, START,
// COMMIT, VACUUM, COPY...) are already rejected by the leading-keyword
// allowlist. Scanning for them anywhere would misfire on ordinary column names
// — and `start`, `end` and `set` are perfectly normal columns. Extra approvals
// on routine reads are the kind of friction that trains people to click
// through, which defeats the approval itself.
test("common column names that look like verbs stay read-only", () => {
  readOnly("SELECT start FROM appointments");
  readOnly("SELECT start, end FROM shifts");
  readOnly("SELECT set FROM lab_results");
  readOnly("SELECT * FROM t ORDER BY start DESC");
  readOnly("SELECT copy FROM documents");
  readOnly("SELECT cluster FROM nodes");
});

test("locking reads are still not read-only despite the relaxed scan", () => {
  notReadOnly("SELECT * FROM t FOR UPDATE");
  notReadOnly("SELECT * FROM t FOR SHARE");
  notReadOnly("SELECT * FROM t FOR NO KEY UPDATE");
  notReadOnly("SELECT * FROM t LOCK IN SHARE MODE");
});
