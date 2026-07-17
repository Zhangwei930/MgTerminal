"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createVaultUnlockGate,
  hashPin,
  verifyPin,
} = require("./vaultUnlockGate.cjs");

function tmpUserData() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "magies-vault-gate-"));
}

test("cross-compatible with WebCrypto-style PBKDF2 hash and verify", () => {
  const hashed = hashPin("123456", undefined, 120_000);
  assert.equal(
    verifyPin("123456", { pinHash: hashed.pinHash, pinSalt: hashed.pinSalt, pinIterations: 120_000 }),
    true,
  );
  assert.equal(
    verifyPin("000000", { pinHash: hashed.pinHash, pinSalt: hashed.pinSalt, pinIterations: 120_000 }),
    false,
  );
});

test("disabled gate never locks and always allows decryption", () => {
  const dir = tmpUserData();
  try {
    const gate = createVaultUnlockGate({ userDataPath: dir });
    assert.equal(gate.isLocked(), false);
    assert.doesNotThrow(() => gate.assertUnlocked());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("configuring a PIN persists, enables, and unlocks the current session", () => {
  const dir = tmpUserData();
  try {
    const gate = createVaultUnlockGate({ userDataPath: dir });
    const result = gate.configure({ pin: "4321" });
    assert.equal(result.success, true);
    assert.equal(result.status.enabled, true);
    assert.equal(result.status.hasPin, true);
    assert.equal(gate.isLocked(), false);

    // A fresh process (reload) starts locked.
    const reloaded = createVaultUnlockGate({ userDataPath: dir });
    assert.equal(reloaded.isLocked(), true);
    assert.throws(() => reloaded.assertUnlocked(), /locked/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("locked gate rejects wrong PIN and accepts the correct one", () => {
  const dir = tmpUserData();
  try {
    createVaultUnlockGate({ userDataPath: dir }).configure({ pin: "9182" });
    const gate = createVaultUnlockGate({ userDataPath: dir });
    assert.equal(gate.isLocked(), true);

    const wrong = gate.unlockWithPin("0000");
    assert.equal(wrong.success, false);
    assert.equal(gate.isLocked(), true);
    assert.throws(() => gate.assertUnlocked());

    const right = gate.unlockWithPin("9182");
    assert.equal(right.success, true);
    assert.equal(gate.isLocked(), false);
    assert.doesNotThrow(() => gate.assertUnlocked());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("platform unlock only clears the lock when the prompt succeeds", async () => {
  const dir = tmpUserData();
  try {
    createVaultUnlockGate({ userDataPath: dir }).configure({ pin: "5678" });

    let answer = { success: false, error: "cancelled" };
    const gate = createVaultUnlockGate({
      userDataPath: dir,
      platformPrompt: async () => answer,
    });
    const denied = await gate.unlockWithPlatform("reason");
    assert.equal(denied.success, false);
    assert.equal(gate.isLocked(), true);

    answer = { success: true };
    const ok = await gate.unlockWithPlatform("reason");
    assert.equal(ok.success, true);
    assert.equal(gate.isLocked(), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("lock() re-locks an enabled vault", () => {
  const dir = tmpUserData();
  try {
    const gate = createVaultUnlockGate({ userDataPath: dir });
    gate.configure({ pin: "1234" });
    assert.equal(gate.isLocked(), false);
    gate.lock();
    assert.equal(gate.isLocked(), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("adoptLegacyConfig imports renderer config once and starts locked", () => {
  const dir = tmpUserData();
  try {
    const legacy = hashPin("246810", undefined, 120_000);
    const gate = createVaultUnlockGate({ userDataPath: dir });
    const res = gate.adoptLegacyConfig({
      enabled: true,
      pinHash: legacy.pinHash,
      pinSalt: legacy.pinSalt,
      pinIterations: 120_000,
    });
    assert.equal(res.adopted, true);
    assert.equal(gate.isLocked(), true);
    assert.equal(gate.unlockWithPin("246810").success, true);

    // Does not clobber an already-configured gate.
    const again = gate.adoptLegacyConfig({ enabled: true, pinHash: "x", pinSalt: "y" });
    assert.equal(again.adopted, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("disable clears config and unlocks", () => {
  const dir = tmpUserData();
  try {
    const gate = createVaultUnlockGate({ userDataPath: dir });
    gate.configure({ pin: "1111" });
    const res = gate.configure({ disable: true });
    assert.equal(res.status.enabled, false);
    assert.equal(gate.isLocked(), false);
    // Reload confirms persistence of the disabled state.
    assert.equal(createVaultUnlockGate({ userDataPath: dir }).isLocked(), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
