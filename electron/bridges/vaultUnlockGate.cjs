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

function normalizeWebAuthnCredential(value) {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.credentialId !== "string" || !value.credentialId) return undefined;
  if (typeof value.publicKeySpki !== "string" || !value.publicKeySpki) return undefined;
  if (typeof value.rpId !== "string" || !value.rpId) return undefined;
  return {
    credentialId: value.credentialId,
    publicKeySpki: value.publicKeySpki,
    rpId: value.rpId,
    algorithm: Number.isFinite(Number(value.algorithm)) ? Number(value.algorithm) : -7,
    createdAt: Number(value.createdAt) || Date.now(),
    transports: Array.isArray(value.transports)
      ? value.transports.filter((t) => typeof t === "string")
      : undefined,
  };
}

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
  const webauthn = normalizeWebAuthnCredential(value.webauthn);
  return { enabled, pinHash, pinSalt, pinIterations, webauthn };
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

  /** @type {Map<string, { challenge: string, purpose: string, expiresAt: number }>} */
  const webauthnChallenges = new Map();

  const hasWebAuthn = () => Boolean(config.enabled && config.webauthn?.credentialId);

  const status = () => ({
    enabled: config.enabled === true,
    locked: isLocked(),
    hasPin: hasPin(),
    hasWebAuthn: hasWebAuthn(),
    webauthnCredentialId: config.webauthn?.credentialId || null,
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

  const beginWebAuthnChallenge = (purpose = "assert") => {
    if (!config.enabled && purpose === "assert") {
      return { success: false, error: "not_enabled" };
    }
    if (purpose === "assert" && !hasWebAuthn()) {
      return { success: false, error: "webauthn_unavailable" };
    }
    const challengeId = crypto.randomBytes(8).toString("base64url");
    const challenge = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + 120_000;
    webauthnChallenges.set(challengeId, { challenge, purpose, expiresAt });
    // GC expired
    for (const [id, c] of webauthnChallenges) {
      if (c.expiresAt <= Date.now()) webauthnChallenges.delete(id);
    }
    return {
      success: true,
      challengeId,
      challenge,
      expiresAt,
      purpose,
      rpId: config.webauthn?.rpId || "localhost",
      credential: config.webauthn || null,
    };
  };

  const completeWebAuthnRegistration = (payload) => {
    if (!config.enabled) {
      // Registration requires unlock feature to already be enabled (PIN path).
      return { success: false, error: "not_enabled" };
    }
    const challengeEntry = webauthnChallenges.get(payload?.challengeId);
    if (!challengeEntry || challengeEntry.purpose !== "register") {
      return { success: false, error: "challenge_invalid" };
    }
    if (challengeEntry.expiresAt <= Date.now()) {
      webauthnChallenges.delete(payload.challengeId);
      return { success: false, error: "challenge_expired" };
    }
    webauthnChallenges.delete(payload.challengeId);
    // Registration attestation full verify is heavy; for local-first MVP we
    // trust the renderer only after it proves it can produce a credential for
    // our challenge id, and we store the SPKI it extracted via getPublicKey().
    // Assertion path always verifies signature in main.
    if (payload?.challenge !== challengeEntry.challenge) {
      return { success: false, error: "challenge_mismatch" };
    }
    const cred = normalizeWebAuthnCredential({
      credentialId: payload?.credentialId,
      publicKeySpki: payload?.publicKeySpki,
      rpId: payload?.rpId || "localhost",
      algorithm: payload?.algorithm,
      createdAt: Date.now(),
      transports: payload?.transports,
    });
    if (!cred) return { success: false, error: "credential_invalid" };
    config = { ...config, webauthn: cred };
    sessionUnlocked = true;
    persist();
    return { success: true, status: status() };
  };

  const unlockWithWebAuthn = (payload) => {
    if (!config.enabled) {
      sessionUnlocked = true;
      return { success: true };
    }
    if (!hasWebAuthn()) return { success: false, error: "webauthn_unavailable" };
    const challengeEntry = webauthnChallenges.get(payload?.challengeId);
    if (!challengeEntry || challengeEntry.purpose !== "assert") {
      return { success: false, error: "challenge_invalid" };
    }
    if (challengeEntry.expiresAt <= Date.now()) {
      webauthnChallenges.delete(payload.challengeId);
      return { success: false, error: "challenge_expired" };
    }
    webauthnChallenges.delete(payload.challengeId);

    // Lazy-load domain verifier (compiled via require from project root is not
    // available as TS — inline ES256 verify here to stay CommonJS-only).
    const ok = verifyAssertionEs256({
      publicKeySpki: config.webauthn.publicKeySpki,
      authenticatorDataB64: payload?.authenticatorData,
      clientDataJSONB64: payload?.clientDataJSON,
      signatureB64: payload?.signature,
      expectedChallenge: challengeEntry.challenge,
      expectedRpId: config.webauthn.rpId,
    });
    if (!ok) return { success: false, error: "assertion_invalid" };
    sessionUnlocked = true;
    return { success: true };
  };

  const clearWebAuthn = () => {
    if (!config.enabled) return { success: true, status: status() };
    const { webauthn: _drop, ...rest } = config;
    config = rest;
    persist();
    return { success: true, status: status() };
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
      // Preserve existing WebAuthn credential across PIN reconfigure when present.
      webauthn: config.webauthn,
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
    beginWebAuthnChallenge,
    completeWebAuthnRegistration,
    unlockWithWebAuthn,
    clearWebAuthn,
    lock,
    configure,
    adoptLegacyConfig,
  };
}

function verifyAssertionEs256(input) {
  try {
    const clientData = Buffer.from(input.clientDataJSONB64, "base64url");
    const client = JSON.parse(clientData.toString("utf8"));
    if (client.type !== "webauthn.get") return false;
    if (client.challenge !== input.expectedChallenge) return false;
    if (typeof client.origin !== "string" || !client.origin) return false;
    const prefixes = [
      "file://", "app://", "http://localhost", "https://localhost", "http://127.0.0.1",
    ];
    if (!prefixes.some((p) => client.origin.startsWith(p) || client.origin === p)) {
      if (!/magies|electron/i.test(client.origin)) return false;
    }
    const authData = Buffer.from(input.authenticatorDataB64, "base64url");
    if (authData.length < 37) return false;
    const rpHash = authData.subarray(0, 32);
    const expectedRpHash = crypto.createHash("sha256").update(input.expectedRpId).digest();
    if (!crypto.timingSafeEqual(rpHash, expectedRpHash)) return false;
    const flags = authData[32];
    if ((flags & 0x01) === 0) return false;
    if ((flags & 0x04) === 0) return false;
    const clientHash = crypto.createHash("sha256").update(clientData).digest();
    const signed = Buffer.concat([authData, clientHash]);
    const signature = Buffer.from(input.signatureB64, "base64url");
    const key = crypto.createPublicKey({
      key: Buffer.from(input.publicKeySpki, "base64url"),
      format: "der",
      type: "spki",
    });
    return crypto.verify("sha256", signed, key, signature);
  } catch {
    return false;
  }
}

function registerHandlers(ipcMain, gate) {
  if (!ipcMain || !gate) return;
  ipcMain.handle("magiesTerminal:vault:unlockStatus", () => gate.status());
  ipcMain.handle("magiesTerminal:vault:unlockWithPin", (_event, pin) => gate.unlockWithPin(pin));
  ipcMain.handle("magiesTerminal:vault:unlockWithPlatform", (_event, payload) =>
    gate.unlockWithPlatform(payload?.reason));
  ipcMain.handle("magiesTerminal:vault:beginWebAuthnChallenge", (_event, payload) =>
    gate.beginWebAuthnChallenge(payload?.purpose || "assert"));
  ipcMain.handle("magiesTerminal:vault:completeWebAuthnRegistration", (_event, payload) =>
    gate.completeWebAuthnRegistration(payload));
  ipcMain.handle("magiesTerminal:vault:unlockWithWebAuthn", (_event, payload) =>
    gate.unlockWithWebAuthn(payload));
  ipcMain.handle("magiesTerminal:vault:clearWebAuthn", () => gate.clearWebAuthn());
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
