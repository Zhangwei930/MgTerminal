import test from "node:test";
import assert from "node:assert/strict";

import {
  TERMINAL_AUTO_RECONNECT_DELAY_MS,
  TERMINAL_AUTO_RECONNECT_MAX_ATTEMPTS,
  TERMINAL_AUTO_RECONNECT_MAX_DELAY_MS,
  canAttemptTerminalAutoReconnect,
  hasExhaustedAutoReconnectAttempts,
  isTerminalAutoReconnectEnabled,
  shouldAutoReconnectAfterExit,
  shouldContinueAutoReconnectAfterFailure,
  terminalAutoReconnectDelayMs,
} from "./terminalAutoReconnect";

const sshHost = {
  protocol: "ssh" as const,
  hostname: "example.com",
};

test("terminal auto reconnect uses a five second retry delay", () => {
  assert.equal(TERMINAL_AUTO_RECONNECT_DELAY_MS, 5000);
});

test("auto reconnect delay doubles per attempt and caps at the max delay", () => {
  assert.equal(terminalAutoReconnectDelayMs(1), 5000);
  assert.equal(terminalAutoReconnectDelayMs(2), 10000);
  assert.equal(terminalAutoReconnectDelayMs(3), 20000);
  assert.equal(terminalAutoReconnectDelayMs(4), 40000);
  assert.equal(terminalAutoReconnectDelayMs(5), TERMINAL_AUTO_RECONNECT_MAX_DELAY_MS);
  assert.equal(terminalAutoReconnectDelayMs(20), TERMINAL_AUTO_RECONNECT_MAX_DELAY_MS);
});

test("auto reconnect stops after the attempt limit is reached", () => {
  assert.equal(hasExhaustedAutoReconnectAttempts(0), false);
  assert.equal(hasExhaustedAutoReconnectAttempts(TERMINAL_AUTO_RECONNECT_MAX_ATTEMPTS - 1), false);
  assert.equal(hasExhaustedAutoReconnectAttempts(TERMINAL_AUTO_RECONNECT_MAX_ATTEMPTS), true);
  assert.equal(hasExhaustedAutoReconnectAttempts(TERMINAL_AUTO_RECONNECT_MAX_ATTEMPTS + 1), true);
});

test("terminal auto reconnect is disabled unless the setting is explicitly true", () => {
  assert.equal(isTerminalAutoReconnectEnabled(undefined), false);
  assert.equal(isTerminalAutoReconnectEnabled({ sshAutoReconnectEnabled: true }), true);
  assert.equal(isTerminalAutoReconnectEnabled({ sshAutoReconnectEnabled: false }), false);
});

test("unexpected SSH exits reconnect only after the tab has connected before", () => {
  assert.equal(
    shouldAutoReconnectAfterExit({
      evt: { reason: "closed" },
      host: sshHost,
      terminalSettings: { sshAutoReconnectEnabled: true },
      hasEverConnected: true,
    }),
    true,
  );

  assert.equal(
    shouldAutoReconnectAfterExit({
      evt: { reason: "closed" },
      host: sshHost,
      terminalSettings: { sshAutoReconnectEnabled: true },
      hasEverConnected: false,
    }),
    false,
  );
});

test("normal shell exits do not auto reconnect", () => {
  assert.equal(
    shouldAutoReconnectAfterExit({
      evt: { reason: "exited", exitCode: 0 },
      host: sshHost,
      terminalSettings: { sshAutoReconnectEnabled: true },
      hasEverConnected: true,
    }),
    false,
  );
});

test("auto reconnect ignores protocols that already have different lifecycle semantics", () => {
  const variants = [
    { protocol: "local" as const, hostname: "localhost" },
    { protocol: "serial" as const, hostname: "/dev/tty.usbserial" },
    { protocol: "telnet" as const, hostname: "router.local" },
    { protocol: "ssh" as const, hostname: "example.com", moshEnabled: true },
    { protocol: "ssh" as const, hostname: "example.com", etEnabled: true },
  ];

  for (const host of variants) {
    assert.equal(
      shouldAutoReconnectAfterExit({
        evt: { reason: "error", error: "connection reset" },
        host,
        terminalSettings: { sshAutoReconnectEnabled: true },
        hasEverConnected: true,
      }),
      false,
    );
  }
});

test("an active auto reconnect loop continues after failed retry attempts", () => {
  assert.equal(
    shouldContinueAutoReconnectAfterFailure({
      host: sshHost,
      terminalSettings: { sshAutoReconnectEnabled: true },
      loopActive: true,
    }),
    true,
  );

  assert.equal(
    shouldContinueAutoReconnectAfterFailure({
      host: sshHost,
      terminalSettings: { sshAutoReconnectEnabled: false },
      loopActive: true,
    }),
    false,
  );
});

test("terminal auto reconnect can start from live or fully hibernated runtimes", () => {
  assert.equal(
    canAttemptTerminalAutoReconnect({
      hasTerminalRuntime: true,
      isHibernated: false,
    }),
    true,
  );

  assert.equal(
    canAttemptTerminalAutoReconnect({
      hasTerminalRuntime: false,
      isHibernated: true,
    }),
    true,
  );

  assert.equal(
    canAttemptTerminalAutoReconnect({
      hasTerminalRuntime: false,
      isHibernated: false,
    }),
    false,
  );
});
