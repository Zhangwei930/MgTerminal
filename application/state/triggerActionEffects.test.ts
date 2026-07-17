import test from "node:test";
import assert from "node:assert/strict";

import { executeTriggerActions } from "./triggerActionEffects.ts";
import { sessionActivityStore } from "./sessionActivityStore.ts";

test("executeTriggerActions runs notify, markTab, and runScript hooks", async () => {
  const ran: string[] = [];
  sessionActivityStore.clearTab("sess-1");

  await executeTriggerActions(
    [{ type: "markTab" }, { type: "runScript" }, { type: "sound" }],
    {
      sessionId: "sess-1",
      snippet: { id: "s1", label: "Alert", command: "nct.log(1)", kind: "script" },
      runScript: async () => {
        ran.push("script");
      },
    },
  );

  assert.deepEqual(ran, ["script"]);
  assert.equal(sessionActivityStore.getSnapshot()["sess-1"], true);
  sessionActivityStore.clearTab("sess-1");
});

test("executeTriggerActions continues after a failing action", async () => {
  const ran: string[] = [];
  await executeTriggerActions(
    [{ type: "runScript" }, { type: "markTab" }],
    {
      sessionId: "sess-2",
      snippet: { id: "s2", label: "x", command: "1", kind: "script" },
      runScript: async () => {
        ran.push("script");
        throw new Error("boom");
      },
    },
  );
  assert.deepEqual(ran, ["script"]);
  assert.equal(sessionActivityStore.getSnapshot()["sess-2"], true);
  sessionActivityStore.clearTab("sess-2");
});
