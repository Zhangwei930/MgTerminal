import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultPortForEngine } from './dbClient.ts';

test('defaultPortForEngine returns the standard port for mysql', () => {
  assert.equal(defaultPortForEngine('mysql'), 3306);
});

test('defaultPortForEngine returns the standard port for postgres', () => {
  assert.equal(defaultPortForEngine('postgres'), 5432);
});
