import test from "node:test";
import assert from "node:assert/strict";

import { performSafeTerminalPaste } from "./safeTerminalPaste.ts";

const makeTerm = () => {
  const pasted: string[] = [];
  return {
    pasted,
    paste: (text: string) => {
      pasted.push(text);
    },
    scrollToBottom: () => {},
    focus: () => {},
    buffer: { active: { cursorY: 0, baseY: 0, cursorX: 0, getLine: () => null } },
    cols: 80,
    rows: 24,
    write: () => {},
  };
};

test("safe paste with defaults uses xterm paste path", async () => {
  const term = makeTerm();
  const writes: string[] = [];
  const result = await performSafeTerminalPaste({
    text: "echo hi",
    term: term as never,
    sessionId: "s1",
    terminalBackend: {
      writeToSession: (_id, data) => writes.push(data),
    },
  });
  assert.equal(result, "pasted");
  assert.deepEqual(term.pasted, ["echo hi"]);
  assert.deepEqual(writes, []);
});

test("dangerous paste cancels when confirm returns false", async () => {
  const term = makeTerm();
  const result = await performSafeTerminalPaste({
    text: "rm -rf /",
    term: term as never,
    sessionId: "s1",
    settings: { confirmDangerousPaste: true },
    terminalBackend: {
      writeToSession: () => assert.fail("should not write"),
    },
    confirmDangerous: async () => false,
  });
  assert.equal(result, "cancelled");
  assert.deepEqual(term.pasted, []);
});

test("dangerous paste proceeds when confirm returns true", async () => {
  const term = makeTerm();
  const result = await performSafeTerminalPaste({
    text: "rm -rf /tmp/x",
    term: term as never,
    sessionId: "s1",
    settings: { confirmDangerousPaste: true },
    terminalBackend: {
      writeToSession: () => {},
    },
    confirmDangerous: async () => true,
  });
  assert.equal(result, "pasted");
  assert.deepEqual(term.pasted, ["rm -rf /tmp/x"]);
});

test("line delay uses writeToSession chunks instead of term.paste", async () => {
  const term = makeTerm();
  const writes: string[] = [];
  const result = await performSafeTerminalPaste({
    text: "one\ntwo\n",
    term: term as never,
    sessionId: "s1",
    settings: { pasteLineDelayMs: 1 },
    terminalBackend: {
      writeToSession: (_id, data) => writes.push(data),
    },
  });
  assert.equal(result, "pasted");
  assert.deepEqual(term.pasted, []);
  assert.deepEqual(writes, ["one\n", "two\n"]);
});

test("wait-for-prompt timeout withholds remaining lines", async () => {
  const term = makeTerm();
  const writes: string[] = [];
  const result = await performSafeTerminalPaste({
    text: "first\nsecond\nthird\n",
    term: term as never,
    sessionId: "s1",
    settings: { pasteWaitForPrompt: true },
    waitForPromptTimeoutMs: 60,
    isAtPrompt: () => false, // shell never returns to a prompt
    terminalBackend: {
      writeToSession: (_id, data) => writes.push(data),
    },
  });
  assert.equal(result, "timed-out");
  // Only the first line is sent; the rest are withheld from the running program.
  assert.deepEqual(writes, ["first\n"]);
});

test("wait-for-prompt sends all lines once the prompt returns", async () => {
  const term = makeTerm();
  const writes: string[] = [];
  const result = await performSafeTerminalPaste({
    text: "a\nb\n",
    term: term as never,
    sessionId: "s1",
    settings: { pasteWaitForPrompt: true },
    waitForPromptTimeoutMs: 500,
    isAtPrompt: () => true,
    terminalBackend: {
      writeToSession: (_id, data) => writes.push(data),
    },
  });
  assert.equal(result, "pasted");
  assert.deepEqual(writes, ["a\n", "b\n"]);
});
