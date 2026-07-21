import test from "node:test";
import assert from "node:assert/strict";

import { formatEta } from "./utils.ts";

test("sub-minute remaining time is shown in seconds", () => {
  assert.equal(formatEta(45 * 1024, 1024), "45s");
});

test("minutes carry a seconds remainder", () => {
  assert.equal(formatEta(150 * 1024, 1024), "2m 30s");
});

test("hours carry a minutes remainder and drop seconds", () => {
  assert.equal(formatEta(3900 * 1024, 1024), "1h 5m");
});

test("no ETA without a usable speed", () => {
  assert.equal(formatEta(1024, 0), "");
  assert.equal(formatEta(1024, -1), "");
});

test("no ETA once nothing is left to transfer", () => {
  assert.equal(formatEta(0, 1024), "");
  assert.equal(formatEta(-5, 1024), "");
});

test("rounds up so a nearly-done transfer never shows 0s", () => {
  assert.equal(formatEta(1, 1024), "1s");
});
