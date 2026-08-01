import assert from 'node:assert/strict';
import test from 'node:test';
import type { DbEngine } from '../models';
import { beginStatementFor, commitStatementFor, rollbackStatementFor } from './transactionSql';

const ENGINES: DbEngine[] = ['mysql', 'postgres', 'mssql', 'oracle'];

test('every engine can commit and roll back', () => {
  for (const engine of ENGINES) {
    assert.match(commitStatementFor(engine), /^COMMIT/i, `${engine} cannot commit`);
    assert.match(rollbackStatementFor(engine), /^ROLLBACK/i, `${engine} cannot roll back`);
  }
});

test('SQL Server spells the opening statement its own way', () => {
  assert.match(beginStatementFor('mssql') ?? '', /BEGIN TRANSACTION/i);
});

test('MySQL and Postgres open a transaction explicitly', () => {
  assert.match(beginStatementFor('mysql') ?? '', /BEGIN|START TRANSACTION/i);
  assert.match(beginStatementFor('postgres') ?? '', /BEGIN|START TRANSACTION/i);
});

test('Oracle has no opening statement at all', () => {
  // Oracle starts a transaction implicitly on the first DML, and a bare BEGIN
  // there is the start of a PL/SQL block — sending one would be a syntax error,
  // not a transaction.
  assert.equal(beginStatementFor('oracle'), null);
});

test('an unknown engine is rejected loudly', () => {
  assert.throws(() => commitStatementFor('cassandra' as DbEngine), /unsupported|unknown/i);
  assert.throws(() => beginStatementFor('cassandra' as DbEngine), /unsupported|unknown/i);
  assert.throws(() => rollbackStatementFor('cassandra' as DbEngine), /unsupported|unknown/i);
});
