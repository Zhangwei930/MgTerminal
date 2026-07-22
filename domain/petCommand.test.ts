import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCommandString } from './petCommand';

test('parseCommandString splits on whitespace', () => {
  assert.deepEqual(parseCommandString('open -a Terminal'), ['open', '-a', 'Terminal']);
});

test('parseCommandString collapses repeated whitespace', () => {
  assert.deepEqual(parseCommandString('  code   ~/projects/foo  '), ['code', '~/projects/foo']);
});

test('parseCommandString keeps double-quoted segments as one token', () => {
  assert.deepEqual(
    parseCommandString('open "/Applications/Visual Studio Code.app"'),
    ['open', '/Applications/Visual Studio Code.app'],
  );
});

test('parseCommandString keeps single-quoted segments as one token', () => {
  assert.deepEqual(parseCommandString("echo 'hello world'"), ['echo', 'hello world']);
});

test('parseCommandString returns an empty array for blank input', () => {
  assert.deepEqual(parseCommandString(''), []);
  assert.deepEqual(parseCommandString('   '), []);
});

test('parseCommandString tolerates an unterminated quote by taking the rest of the string', () => {
  assert.deepEqual(parseCommandString('echo "unterminated'), ['echo', 'unterminated']);
});
