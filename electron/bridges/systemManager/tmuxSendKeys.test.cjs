"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createTmuxOpsApi, shQuote } = require("./tmuxOps.cjs");

/** Captures the shell command the api would run and reports success. */
function createApiSpy() {
  const commands = [];
  const api = createTmuxOpsApi({
    execOnSession: async (_event, _sessionId, command) => {
      commands.push(command);
      return { success: true, stdout: "", stderr: "" };
    },
  });
  return { api, commands };
}

function sendKeysCommand(commands) {
  return commands.find((command) => command.includes("send-keys"));
}

test("sendKeys targets an explicit pane when one is given", async () => {
  const { api, commands } = createApiSpy();
  const result = await api.tmuxAction({}, {
    sessionId: "s1",
    action: "sendKeys",
    sessionName: "work",
    windowIndex: 2,
    paneIndex: 1,
    keys: "ls -la",
  });
  assert.equal(result.success, true, result.error);
  assert.match(sendKeysCommand(commands), /send-keys -t 'work':2\.1 'ls -la' C-m/);
});

test("sendKeys without a pane targets the window's active pane", async () => {
  // tmux resolves `session:window` to whichever pane is active, which is what a
  // user typing into a window expects. Requiring paneIndex made the action
  // unreachable from a UI that does not enumerate panes.
  const { api, commands } = createApiSpy();
  const result = await api.tmuxAction({}, {
    sessionId: "s1",
    action: "sendKeys",
    sessionName: "work",
    windowIndex: 2,
    keys: "make test",
  });
  assert.equal(result.success, true, result.error);
  assert.match(sendKeysCommand(commands), /send-keys -t 'work':2 'make test' C-m/);
});

test("sendKeys still needs a session and a window", async () => {
  const { api, commands } = createApiSpy();
  assert.equal(
    (await api.tmuxAction({}, { sessionId: "s1", action: "sendKeys", windowIndex: 0, keys: "x" })).success,
    false,
  );
  assert.equal(
    (await api.tmuxAction({}, { sessionId: "s1", action: "sendKeys", sessionName: "work", keys: "x" })).success,
    false,
  );
  assert.equal(sendKeysCommand(commands), undefined, "nothing may reach the shell");
});

test("shQuote survives a real shell, so sent keys cannot break out", () => {
  // send-keys interpolates user text straight into a tmux command line, so the
  // quoting primitive is the whole defence. Ask sh what it actually expands to.
  for (const payload of ["'; rm -rf /tmp/x; echo '", 'plain', '$(id)', '`id`', "a'b\"c"]) {
    const expanded = execFileSync("sh", ["-c", `printf %s ${shQuote(payload)}`], { encoding: "utf8" });
    assert.equal(expanded, payload);
  }
});

test("enter: false omits the trailing C-m", async () => {
  const { api, commands } = createApiSpy();
  await api.tmuxAction({}, {
    sessionId: "s1",
    action: "sendKeys",
    sessionName: "work",
    windowIndex: 0,
    keys: "partial",
    enter: false,
  });
  assert.ok(!sendKeysCommand(commands).endsWith(" C-m"));
});
