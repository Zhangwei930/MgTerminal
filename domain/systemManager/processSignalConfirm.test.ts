import test from "node:test";
import assert from "node:assert/strict";

import { getProcessSignalConfirm } from "./processState.ts";

test("SIGKILL uses the dedicated kill confirmation copy", () => {
  assert.deepEqual(getProcessSignalConfirm("KILL"), {
    titleKey: "systemManager.processes.kill",
    messageKey: "systemManager.processes.confirmKill",
    destructive: true,
  });
});

test("non-KILL signals reuse the generic signal confirmation copy", () => {
  assert.deepEqual(getProcessSignalConfirm("TERM"), {
    titleKey: "systemManager.processes.term",
    messageKey: "systemManager.processes.confirmSignal",
    destructive: true,
  });
  assert.deepEqual(getProcessSignalConfirm("HUP"), {
    titleKey: "systemManager.processes.hup",
    messageKey: "systemManager.processes.confirmSignal",
    destructive: true,
  });
});

test("job-control signals are not marked destructive", () => {
  assert.deepEqual(getProcessSignalConfirm("STOP"), {
    titleKey: "systemManager.processes.stop",
    messageKey: "systemManager.processes.confirmSignal",
    destructive: false,
  });
  assert.deepEqual(getProcessSignalConfirm("CONT"), {
    titleKey: "systemManager.processes.cont",
    messageKey: "systemManager.processes.confirmSignal",
    destructive: false,
  });
});

test("unknown signals fall back to the terminate copy and stay destructive", () => {
  assert.deepEqual(getProcessSignalConfirm("USR1"), {
    titleKey: "systemManager.processes.term",
    messageKey: "systemManager.processes.confirmSignal",
    destructive: true,
  });
});
