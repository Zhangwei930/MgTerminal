import test from "node:test";
import assert from "node:assert/strict";

import {
  COMMAND_PALETTE_ACTIONS,
  filterCommandPaletteActions,
  isOnboardingComplete,
  ONBOARDING_STEP_IDS,
  pickFirstConnectionTips,
} from "./onboarding";

test("onboarding step ids are three product steps", () => {
  assert.deepEqual([...ONBOARDING_STEP_IDS], ["addHost", "connect", "explore"]);
});

test("isOnboardingComplete accepts boolean and string true", () => {
  assert.equal(isOnboardingComplete(true), true);
  assert.equal(isOnboardingComplete("true"), true);
  assert.equal(isOnboardingComplete(false), false);
  assert.equal(isOnboardingComplete(null), false);
});

test("pickFirstConnectionTips returns prefix of tip catalog", () => {
  assert.deepEqual(pickFirstConnectionTips(2), ["openSftp", "saveWorkspace"]);
});

test("filterCommandPaletteActions matches keywords and ids", () => {
  const settings = filterCommandPaletteActions("settings");
  assert.ok(settings.some((a) => a.id === "open-settings"));
  const importHit = filterCommandPaletteActions("迁移");
  assert.ok(importHit.some((a) => a.id === "import-hosts"));
  assert.equal(filterCommandPaletteActions("zzzz-nope").length, 0);
  assert.equal(filterCommandPaletteActions("").length, COMMAND_PALETTE_ACTIONS.length);
});
