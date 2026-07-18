"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateIpcSender, withTrustedIpcSender } = require("./ipcSenderGuard.cjs");

test("validateIpcSender rejects missing sender", () => {
  const res = validateIpcSender({});
  assert.equal(res.ok, false);
  assert.equal(res.error, "missing_sender");
});

test("validateIpcSender rejects destroyed sender", () => {
  const res = validateIpcSender({
    sender: { isDestroyed: () => true, getType: () => "window", getURL: () => "file://x" },
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, "destroyed_sender");
});

test("validateIpcSender rejects webview type", () => {
  const res = validateIpcSender({
    sender: { isDestroyed: () => false, getType: () => "webview", getURL: () => "file://x" },
  });
  assert.equal(res.ok, false);
  assert.equal(res.error, "untrusted_sender_type");
});

test("validateIpcSender accepts local file URL without BrowserWindow", () => {
  const res = validateIpcSender({
    sender: { isDestroyed: () => false, getType: () => "window", getURL: () => "file:///app/index.html" },
  });
  assert.equal(res.ok, true);
});

test("withTrustedIpcSender short-circuits untrusted callers", () => {
  let called = false;
  const wrapped = withTrustedIpcSender(() => {
    called = true;
    return { ok: true };
  });
  const out = wrapped({});
  assert.equal(called, false);
  assert.deepEqual(out, { success: false, error: "missing_sender" });
});
