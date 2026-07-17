import test from "node:test";
import assert from "node:assert/strict";

import {
  isTriggerActionEnabled,
  normalizeTriggerActions,
  resolveTriggerActions,
  toggleTriggerAction,
  triggerActionsIncludeRunScript,
} from "./triggerActions.ts";

test("resolveTriggerActions defaults to runScript when unset", () => {
  assert.deepEqual(resolveTriggerActions({}), [{ type: "runScript" }]);
  assert.deepEqual(resolveTriggerActions({ triggerActions: null }), [{ type: "runScript" }]);
});

test("resolveTriggerActions treats explicit empty list as no actions", () => {
  assert.deepEqual(resolveTriggerActions({ triggerActions: [] }), []);
});

test("normalizeTriggerActions drops invalid and duplicates", () => {
  assert.deepEqual(
    normalizeTriggerActions([
      { type: "notify", title: "Hi" },
      { type: "notify", title: "Other" },
      { type: "nope" },
      { type: "sound" },
      null,
    ]),
    [{ type: "notify", title: "Hi" }, { type: "sound" }],
  );
});

test("toggleTriggerAction enables and disables", () => {
  const withNotify = toggleTriggerAction([{ type: "runScript" }], "notify", true);
  assert.deepEqual(withNotify, [{ type: "runScript" }, { type: "notify" }]);
  assert.deepEqual(toggleTriggerAction(withNotify, "runScript", false), [{ type: "notify" }]);
});

test("isTriggerActionEnabled treats missing list as runScript only", () => {
  assert.equal(isTriggerActionEnabled(undefined, "runScript"), true);
  assert.equal(isTriggerActionEnabled(undefined, "notify"), false);
  assert.equal(isTriggerActionEnabled([{ type: "sound" }], "runScript"), false);
  assert.equal(isTriggerActionEnabled([{ type: "sound" }], "sound"), true);
});

test("triggerActionsIncludeRunScript", () => {
  assert.equal(triggerActionsIncludeRunScript([{ type: "runScript" }]), true);
  assert.equal(triggerActionsIncludeRunScript([{ type: "notify" }]), false);
});
