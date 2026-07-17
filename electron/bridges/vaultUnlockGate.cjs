"use strict";

/**
 * Main-process authority for the opt-in "device unlock before vault secrets"
 * feature. The renderer store mirrors this for UX (deciding whether to show the
 * overlay / defer decryption), but the security boundary lives here: while the
 * vault is locked, credential decryption is refused no matter which renderer,
 * DevTools session, or peer window asks. Unlock requires a secret this process
 * verifies itself (PIN hash) or a platform-auth prompt this process performs.
 *
 * PIN hashing matches domain/vaultPlatformUnlock.ts (PBKDF2-SHA256, 256-bit
 * derived key, hex salt) so PINs configured before this gate existed still
 * verify after the config is adopted from the renderer.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const CONFIG_FILE = "vault-platform-unlock.json";
const DEFAULT_PIN_ITERATIONS = 120_000;
const MIN_PIN_ITERATIONS = 10_000;
const PIN_MIN_LEN = 4;
const PIN_MAX_LEN = 12;
const DERIVED_KEY_BYTES = 32;

function normalizeConfig(value) {
  if (!value || typeof value !== "object") return { enabled: false };
  const enabled = value.enabled === true;
  const pinHash = typeof value.pinHash === "string" && value.pinHash ? value.pinHash : undefined;
  const pinSalt = typeof value.pinSalt === "string" && value.pinSalt ? value.pinSalt : undefined;
  const rawIterations = Number(value.pinIterations);
  const pinIterations = pinHash
    ? (Number.isFinite(rawIterations)
      ? Math.max(MIN_PIN_ITERATIONS, Math.floor(rawIterations))
      : DEFAULT_PIN_ITERATIONS)
    : undefined;
  return { enabled, pinHash, pinSalt, pinIterations };
}

function validatePin(pin) {
  if (typeof pin !== "string") return { ok: false, reason: "empty" };
  const trimmed = pin.trim();
  if (trimmed.length < PIN_MIN_LEN) return { ok: false, reason: "too_short" };
  if (trimmed.length > PIN_MAX_LEN) return { ok: false, reason: "too_long" };
  if (!/^\d+$/.test(trimmed)) return { ok: false, reason: "digits_only" };
  return { ok: true };
}

function hashPin(pin, saltHex, iterations) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(
    Buffer.from(String(pin).trim(), "utf8"),
    salt,
    iterations,
    DERIVED_KEY_BYTES,
    "sha256",
  );
  return {
    pinHash: derived.toString("hex"),
    pinSalt: salt.toString("hex"),
    pinIterations: iterations,
  };
}

function verifyPin(pin, config) {
  if (!config?.pinHash || !config?.pinSalt) return false;
  const iterations = config.pinIterations || DEFAULT_PIN_ITERATIONS;
  const { pinHash } = hashPin(pin, config.pinSalt, iterations);
  const a = Buffer.from(pinHash, "hex");
  const b = Buffer.from(config.pinHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {{
 *   userDataPath?: string,
 *   fs?: typeof fs,
 *   platformPrompt?: (reason?: string) => Promise<{ success: boolean, error?: string }>,
 * }} [options]
 */
function createVaultUnlockGate(options = {}) {
  const fsRef = options.fs || fs;
  const platformPrompt = typeof options.platformPrompt === "function" ? options.platformPrompt : null;
  const configPath = options.userDataPath
    ? path.join(options.userDataPath, CONFIG_FILE)
    : null;

  let config = { enabled: false };
  let sessionUnlocked = false;

  const load = () => {
    if (!configPath) return;
    try {
      const raw = fsRef.readFileSync(configPath, "utf8");
      config = normalizeConfig(JSON.parse(raw));
    } catch {
      config = { enabled: false };
    }
    // A locked vault starts locked; nothing is unlocked until the user proves
    // presence this session.
    sessionUnlocked = !config.enabled;
  };

  const persist = () => {
    if (!configPath) return;
    try {
      fsRef.mkdirSync(path.dirname(configPath), { recursive: true });
      fsRef.writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
    } catch {
      // Best-effort; enforcement still holds for the current session.
    }
  };

  load();

  const isLocked = () => config.enabled === true && !sessionUnlocked;
  const hasPin = () => Boolean(config.enabled && config.pinHash && config.pinSalt);

  const status = () => ({
    enabled: config.enabled === true,
    locked: isLocked(),
    hasPin: hasPin(),
  });

  const assertUnlocked = () => {
    if (isLocked()) {
      const err = new Error("Vault is locked; unlock required before decryption.");
      err.code = "ERR_VAULT_LOCKED";
      throw err;
    }
  };

  const unlockWithPin = (pin) => {
    if (!config.enabled) {
      sessionUnlocked = true;
      return { success: true };
    }
    if (!hasPin()) return { success: false, error: "pin_unavailable" };
    if (!verifyPin(pin, config)) return { success: false, error: "pin_incorrect" };
    sessionUnlocked = true;
    return { success: true };
  };

  const unlockWithPlatform = async (reason) => {
    if (!config.enabled) {
      sessionUnlocked = true;
      return { success: true };
    }
    if (!platformPrompt) return { success: false, error: "platform_unavailable" };
    const result = await platformPrompt(reason);
    if (!result?.success) {
      return { success: false, error: result?.error || "platform_failed" };
    }
    sessionUnlocked = true;
    return { success: true };
  };

  const lock = () => {
    if (config.enabled) sessionUnlocked = false;
    return status();
  };

  const configure = (input) => {
    if (input?.disable === true || input?.enabled === false) {
      config = { enabled: false };
      sessionUnlocked = true;
      persist();
      return { success: true, status: status() };
    }
    const valid = validatePin(input?.pin);
    if (!valid.ok) return { success: false, error: valid.reason };
    const hashed = hashPin(input.pin, undefined, DEFAULT_PIN_ITERATIONS);
    config = {
      enabled: true,
      pinHash: hashed.pinHash,
      pinSalt: hashed.pinSalt,
      pinIterations: hashed.pinIterations,
    };
    // Configuring implies the user is present now.
    sessionUnlocked = true;
    persist();
    return { success: true, status: status() };
  };

  /**
   * One-time migration: the pre-gate config lived only in renderer
   * localStorage. Adopt it if this process has none, so upgrading users keep
   * their PIN and the boundary starts enforcing immediately.
   */
  const adoptLegacyConfig = (legacy) => {
    if (config.enabled) return { success: true, adopted: false, status: status() };
    const normalized = normalizeConfig(legacy);
    if (!normalized.enabled) return { success: true, adopted: false, status: status() };
    config = normalized;
    sessionUnlocked = false;
    persist();
    return { success: true, adopted: true, status: status() };
  };

  return {
    status,
    isLocked,
    assertUnlocked,
    unlockWithPin,
    unlockWithPlatform,
    lock,
    configure,
    adoptLegacyConfig,
  };
}

function registerHandlers(ipcMain, gate) {
  if (!ipcMain || !gate) return;
  ipcMain.handle("magiesTerminal:vault:unlockStatus", () => gate.status());
  ipcMain.handle("magiesTerminal:vault:unlockWithPin", (_event, pin) => gate.unlockWithPin(pin));
  ipcMain.handle("magiesTerminal:vault:unlockWithPlatform", (_event, payload) =>
    gate.unlockWithPlatform(payload?.reason));
  ipcMain.handle("magiesTerminal:vault:lock", () => gate.lock());
  ipcMain.handle("magiesTerminal:vault:configureUnlock", (_event, input) => gate.configure(input));
  ipcMain.handle("magiesTerminal:vault:adoptLegacyUnlockConfig", (_event, legacy) =>
    gate.adoptLegacyConfig(legacy));
}

module.exports = {
  createVaultUnlockGate,
  registerHandlers,
  normalizeConfig,
  validatePin,
  hashPin,
  verifyPin,
  DEFAULT_PIN_ITERATIONS,
};
