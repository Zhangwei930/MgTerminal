import test from "node:test";
import assert from "node:assert/strict";

import {
  hashVaultPlatformUnlockPin,
  isVaultPlatformUnlockEnabled,
  normalizeVaultPlatformUnlockConfig,
  resolveVaultPlatformUnlockMethods,
  validateVaultPlatformUnlockPin,
  verifyVaultPlatformUnlockPin,
} from "./vaultPlatformUnlock.ts";

test("normalize defaults to disabled", () => {
  assert.deepEqual(normalizeVaultPlatformUnlockConfig(null), { enabled: false });
  assert.equal(isVaultPlatformUnlockEnabled(normalizeVaultPlatformUnlockConfig({ enabled: true })), true);
});

test("PIN validation", () => {
  assert.equal(validateVaultPlatformUnlockPin("12").ok, false);
  assert.equal(validateVaultPlatformUnlockPin("abcd").ok, false);
  assert.equal(validateVaultPlatformUnlockPin("1234").ok, true);
});

test("PIN hash verify round-trip", async () => {
  const hashed = await hashVaultPlatformUnlockPin("135790");
  const config = normalizeVaultPlatformUnlockConfig({
    enabled: true,
    pinHash: hashed.pinHash,
    pinSalt: hashed.pinSalt,
    pinIterations: hashed.pinIterations,
  });
  assert.equal(await verifyVaultPlatformUnlockPin("135790", config), true);
  assert.equal(await verifyVaultPlatformUnlockPin("0000", config), false);
});

test("resolve unlock methods", () => {
  assert.deepEqual(
    resolveVaultPlatformUnlockMethods({
      config: { enabled: false },
      platformAuthAvailable: true,
    }),
    ["none"],
  );
  assert.deepEqual(
    resolveVaultPlatformUnlockMethods({
      config: { enabled: true, pinHash: "a", pinSalt: "b" },
      platformAuthAvailable: true,
    }),
    ["platform", "pin"],
  );
});
