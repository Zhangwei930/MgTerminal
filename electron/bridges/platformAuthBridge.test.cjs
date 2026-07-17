"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlatformAuthBridge } = require("./platformAuthBridge.cjs");

test("platform auth unavailable without Touch ID", async () => {
  const bridge = createPlatformAuthBridge({
    electronModule: {
      systemPreferences: {
        canPromptTouchID: () => false,
      },
    },
  });
  const status = bridge.getStatus();
  assert.equal(status.available, false);
  const result = await bridge.prompt("test");
  assert.equal(result.success, false);
  assert.equal(result.error, "platform_unavailable");
});

test("platform auth prompts Touch ID when available", async () => {
  let called = false;
  const bridge = createPlatformAuthBridge({
    electronModule: {
      systemPreferences: {
        canPromptTouchID: () => true,
        promptTouchID: async (reason) => {
          called = true;
          assert.match(reason, /vault/i);
        },
      },
    },
  });
  // Force darwin path
  const original = process.platform;
  Object.defineProperty(process, "platform", { value: "darwin" });
  try {
    assert.equal(bridge.getStatus().available, true);
    const result = await bridge.prompt("Unlock MagiesTerminal vault");
    assert.equal(result.success, true);
    assert.equal(called, true);
  } finally {
    Object.defineProperty(process, "platform", { value: original });
  }
});
