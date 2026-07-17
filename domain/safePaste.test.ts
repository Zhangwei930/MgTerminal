import test from "node:test";
import assert from "node:assert/strict";

import {
  clampPasteCharDelayMs,
  clampPasteLineDelayMs,
  DEFAULT_SAFE_PASTE_SETTINGS,
  inspectDangerousPaste,
  needsThrottledPaste,
  normalizeSafePasteSettings,
  splitPasteIntoLineChunks,
} from "./safePaste.ts";

test("defaults keep legacy paste behavior (no throttle, no confirm)", () => {
  const settings = normalizeSafePasteSettings();
  assert.deepEqual(settings, DEFAULT_SAFE_PASTE_SETTINGS);
  assert.equal(needsThrottledPaste(settings), false);
});

test("clamp paste delays", () => {
  assert.equal(clampPasteCharDelayMs(-1), 0);
  assert.equal(clampPasteCharDelayMs(5), 5);
  assert.equal(clampPasteCharDelayMs(9999), 200);
  assert.equal(clampPasteLineDelayMs(250), 250);
  assert.equal(clampPasteLineDelayMs(99999), 5000);
});

test("needsThrottledPaste when any pacing option is set", () => {
  assert.equal(needsThrottledPaste({ ...DEFAULT_SAFE_PASTE_SETTINGS, pasteCharDelayMs: 1 }), true);
  assert.equal(needsThrottledPaste({ ...DEFAULT_SAFE_PASTE_SETTINGS, pasteLineDelayMs: 10 }), true);
  assert.equal(needsThrottledPaste({ ...DEFAULT_SAFE_PASTE_SETTINGS, pasteWaitForPrompt: true }), true);
});

test("inspectDangerousPaste flags destructive commands", () => {
  const result = inspectDangerousPaste("echo safe\nrm -rf /\necho after");
  assert.equal(result.dangerous, true);
  assert.ok(result.matchedPattern);
  assert.ok(result.sampleLine?.includes("rm"));
});

test("inspectDangerousPaste allows ordinary text", () => {
  assert.equal(inspectDangerousPaste("ls -la\necho hello").dangerous, false);
});

test("splitPasteIntoLineChunks preserves line endings", () => {
  assert.deepEqual(splitPasteIntoLineChunks("a\nb\n"), ["a\n", "b\n"]);
  assert.deepEqual(splitPasteIntoLineChunks("a\r\nb"), ["a\r\n", "b"]);
  assert.deepEqual(splitPasteIntoLineChunks("solo"), ["solo"]);
});
