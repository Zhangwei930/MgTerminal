import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbEngine } from '../models';
import { buildExplainQuery, canExplain, explainFollowUpQuery } from './explainQuery';

const ENGINES: DbEngine[] = ['mysql', 'postgres', 'mssql', 'oracle'];

// ── canExplain ──────────────────────────────────────────────────────────────
//
// EXPLAIN on the wrong statement is not a read: on SQL Server the plan is
// produced by *executing* under SHOWPLAN, and Postgres's EXPLAIN ANALYZE runs
// the statement for real. Restricting it to SELECT keeps "show me the plan"
// from being a write.

test('a select can be explained', () => {
  assert.equal(canExplain('SELECT * FROM patients'), true);
  assert.equal(canExplain('  with x as (select 1) select * from x'), true);
});

test('a write cannot be explained', () => {
  for (const sql of [
    'UPDATE patients SET name = 1',
    'DELETE FROM patients',
    'INSERT INTO patients VALUES (1)',
    'DROP TABLE patients',
    'TRUNCATE TABLE patients',
  ]) {
    assert.equal(canExplain(sql), false, `${sql} must not be explainable`);
  }
});

test('an empty statement cannot be explained', () => {
  assert.equal(canExplain(''), false);
  assert.equal(canExplain('   '), false);
});

test('a write hidden behind a comment is still a write', () => {
  assert.equal(canExplain('-- harmless\nDELETE FROM patients'), false);
});

test('multiple statements cannot be explained', () => {
  // Only the first would be planned; the rest would just run.
  assert.equal(canExplain('SELECT 1; DELETE FROM patients'), false);
});

// ── buildExplainQuery ───────────────────────────────────────────────────────

test('each engine wraps the statement its own way', () => {
  const sql = 'SELECT * FROM patients';
  assert.match(buildExplainQuery('mysql', sql), /^EXPLAIN /);
  assert.match(buildExplainQuery('postgres', sql), /^EXPLAIN /);
  assert.match(buildExplainQuery('oracle', sql), /EXPLAIN PLAN FOR/i);
});

test('postgres does not use ANALYZE', () => {
  // EXPLAIN ANALYZE executes the statement. A plan request must not.
  assert.ok(!/analyze/i.test(buildExplainQuery('postgres', 'SELECT 1')));
});

test('the original statement is carried through unchanged', () => {
  const sql = "SELECT * FROM patients WHERE note = 'a;b'";
  for (const engine of ENGINES) {
    assert.ok(buildExplainQuery(engine, sql).includes(sql), `${engine} altered the statement`);
  }
});

test('sql server asks for the plan without running the statement', () => {
  // SHOWPLAN_ALL makes the server return a plan instead of executing.
  assert.match(buildExplainQuery('mssql', 'SELECT 1'), /SHOWPLAN/i);
});

test('a non-select is refused rather than wrapped', () => {
  for (const engine of ENGINES) {
    assert.throws(() => buildExplainQuery(engine, 'DELETE FROM patients'), /select/i, engine);
  }
});

test('an unknown engine is rejected loudly', () => {
  assert.throws(() => buildExplainQuery('cassandra' as DbEngine, 'SELECT 1'), /unsupported|unknown/i);
});

// ── explainFollowUpQuery ────────────────────────────────────────────────────

test('oracle needs a second query to read the plan back', () => {
  // EXPLAIN PLAN FOR returns nothing — it writes to PLAN_TABLE. Without the
  // follow-up the user sees an empty result and assumes it failed.
  const followUp = explainFollowUpQuery('oracle');
  assert.ok(followUp);
  assert.match(followUp, /PLAN_TABLE|DBMS_XPLAN/i);
});

test('every other engine returns the plan directly', () => {
  for (const engine of ['mysql', 'postgres', 'mssql'] as DbEngine[]) {
    assert.equal(explainFollowUpQuery(engine), null, engine);
  }
});
