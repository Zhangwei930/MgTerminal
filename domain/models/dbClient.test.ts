import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultPortForEngine } from './dbClient.ts';

test('defaultPortForEngine returns the standard port for mysql', () => {
  assert.equal(defaultPortForEngine('mysql'), 3306);
});

test('defaultPortForEngine returns the standard port for postgres', () => {
  assert.equal(defaultPortForEngine('postgres'), 5432);
});

test('defaultPortForEngine returns the standard port for mssql', () => {
  assert.equal(defaultPortForEngine('mssql'), 1433);
});

test('defaultPortForEngine returns the standard port for oracle', () => {
  assert.equal(defaultPortForEngine('oracle'), 1521);
});
