import assert from 'node:assert/strict';
import test from 'node:test';

import { displayCommandPrefix, extractDisplayCommand } from './tool-call';

// Codex (SDK) emits command_execution.command as a STRING that wraps the real
// command in `<shell> -lc '<full>'`. Under Skills + CLI the real command is a
// magies-terminal-tool-cli call. The title must unwrap the shell layer first, else the
// outer quote leaks (the "magiesTerminal: \"" / "magiesTerminal: …md\"" garbage titles).

test('unwraps a /bin/zsh -lc string wrapper (codex SDK shape)', () => {
  assert.equal(
    extractDisplayCommand({ command: `/bin/zsh -lc 'echo "hi"'` }),
    'echo "hi"',
  );
});

test('codex Skills+CLI exec: unwrap shell + magiesTerminal-cli -> remote command', () => {
  assert.equal(
    extractDisplayCommand({
      command: `/bin/zsh -lc '"/abs/magies-terminal-tool-cli" exec --session X -- "uptime"'`,
    }),
    'uptime',
  );
});

test('codex Skills+CLI session subcommand -> friendly title', () => {
  assert.equal(
    extractDisplayCommand({
      command: `/bin/zsh -lc '"/abs/magies-terminal-tool-cli" session --session X'`,
    }),
    'magiesTerminal: inspect session',
  );
});

test('raw (unwrapped) magies-terminal-tool-cli exec still works', () => {
  assert.equal(
    extractDisplayCommand({ command: `"/abs/magies-terminal-tool-cli" exec --session X -- "uptime"` }),
    'uptime',
  );
});

test('magies-terminal-tool-cli env -> list sessions', () => {
  assert.equal(extractDisplayCommand({ command: 'magies-terminal-tool-cli env' }), 'magiesTerminal: list sessions');
});

test('array shell-wrap shape still unwraps (regression)', () => {
  assert.equal(
    extractDisplayCommand({ command: ['zsh', '-lc', 'ls -la /tmp'] }),
    'ls -la /tmp',
  );
});

test('plain command passes through unchanged', () => {
  assert.equal(extractDisplayCommand({ command: 'ls -la /tmp' }), 'ls -la /tmp');
});

test('empty / missing args -> null', () => {
  assert.equal(extractDisplayCommand(undefined), null);
  assert.equal(extractDisplayCommand({ command: '' }), null);
});

// A statement that changes data deserves the same treatment as a shell command:
// visible in the card title, not buried in the Arguments JSON below it. The
// approval card auto-expands so the JSON is reachable either way, but the user
// should be able to read what they are approving without hunting for it.
test('a SQL statement is shown like a command', () => {
  assert.equal(
    extractDisplayCommand({ sql: "UPDATE patients SET name = 'test' WHERE id = 1" }),
    "UPDATE patients SET name = 'test' WHERE id = 1",
  );
});

test('a multi-line SQL statement collapses to one line for the title', () => {
  // The title is a single truncating line; raw newlines would render oddly.
  // The unmodified statement is still in the Arguments block underneath.
  assert.equal(
    extractDisplayCommand({ sql: 'UPDATE patients\n  SET name = \'test\'\n  WHERE id = 1' }),
    "UPDATE patients SET name = 'test' WHERE id = 1",
  );
});

test('an explicit command still wins over sql', () => {
  assert.equal(
    extractDisplayCommand({ command: 'echo hi', sql: 'SELECT 1' }),
    'echo hi',
  );
});

test('a blank or absent sql does not produce an empty title', () => {
  assert.equal(extractDisplayCommand({ sql: '' }), null);
  assert.equal(extractDisplayCommand({ sql: '   ' }), null);
  assert.equal(extractDisplayCommand({ sql: 42 as unknown as string }), null);
  assert.equal(extractDisplayCommand({}), null);
});

// The title prefix is a shell prompt. A SQL statement is not a shell command,
// and in an approval card — where the whole point is understanding what you are
// agreeing to — mislabelling it as one is the wrong kind of wrong.
test('a shell command keeps the shell prompt', () => {
  assert.equal(displayCommandPrefix({ command: 'echo hi' }), '$ ');
});

test('a SQL statement is not prefixed with a shell prompt', () => {
  assert.notEqual(displayCommandPrefix({ sql: 'SELECT 1' }), '$ ');
  assert.match(displayCommandPrefix({ sql: 'SELECT 1' }), /sql/i);
});

test('a tool carrying both is treated as a shell command', () => {
  assert.equal(displayCommandPrefix({ command: 'echo hi', sql: 'SELECT 1' }), '$ ');
});

test('no args falls back to the shell prompt', () => {
  assert.equal(displayCommandPrefix(undefined), '$ ');
  assert.equal(displayCommandPrefix({}), '$ ');
});
