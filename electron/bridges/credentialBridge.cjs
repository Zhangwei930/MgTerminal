/**
 * Credential Bridge - Field-level encryption for sensitive data at rest
 *
 * Backends (prefer order on encrypt):
 *   1) enc:v1: — Electron safeStorage (OS Keychain / DPAPI / libsecret)
 *   2) enc:v2: — App-local AES-256-GCM key file under userData
 *
 * Why v2 exists:
 *   macOS ad-hoc / frequently re-signed builds break Keychain ACLs for the
 *   Chromium "… Safe Storage" item. Users then cannot save API keys at all.
 *   v2 does not depend on Keychain ACL, so encryption keeps working across
 *   updates. Security model: protects localStorage from casual inspection;
 *   same-user malware can still read the key file (mode 0o600).
 *
 * Decrypt routes by prefix. Plaintext (no prefix) still migrates read-only.
 */

const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ENC_PREFIX_V1 = "enc:v1:";
const ENC_PREFIX_V2 = "enc:v2:";
/** @deprecated use ENC_PREFIX_V1 — kept for older requires */
const ENC_PREFIX = ENC_PREFIX_V1;

const LOCAL_VAULT_KEY_FILE = "credential-vault-v1.key";
const LOCAL_VAULT_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

/** Known Electron safeStorage Keychain service names for this product line. */
const MAC_SAFE_STORAGE_SERVICE_CANDIDATES = [
  "Magies Terminal Safe Storage",
  "MagiesTerminal Safe Storage",
  "magies-terminal Safe Storage",
  "Electron Safe Storage",
];

// Structural ciphertext check (mirrors domain/credentials.ts): used when a
// blob cannot be verified by decrypting, so it is never re-encrypted into
// nested ciphertext. safeStorage payloads start with "v10"/"v11" (base64
// "djEw"/"djEx") or a DPAPI header; local-vault payloads are
// iv(12)+tag(16)+ciphertext(≥1) → base64 length ≥ 40.
const BLOB_BASE64_RE = /^[A-Za-z0-9+/]+=*$/;
// "djEw"/"djEx" = base64("v10"/"v11") for mac/linux safeStorage; "AQAAAN" is
// the base64 head of a Windows DPAPI blob (bytes 01 00 00 00 D0 8C… → "AQAAAN…").
// NB: the DWORD+GUID never encode to "AQAAAA", so that literal never matches.
const SAFE_STORAGE_BASE64_HEADER_PREFIXES = ["djEw", "djEx", "AQAAAN"];
const LOCAL_VAULT_MIN_BASE64_LEN = 40;

function looksLikeEncryptedBlob(value) {
  if (typeof value !== "string") return false;
  if (value.startsWith(ENC_PREFIX_V1)) {
    const payload = value.slice(ENC_PREFIX_V1.length);
    if (!payload || !BLOB_BASE64_RE.test(payload)) return false;
    return SAFE_STORAGE_BASE64_HEADER_PREFIXES.some((prefix) => payload.startsWith(prefix));
  }
  if (value.startsWith(ENC_PREFIX_V2)) {
    const payload = value.slice(ENC_PREFIX_V2.length);
    if (!payload || payload.length < LOCAL_VAULT_MIN_BASE64_LEN) return false;
    return BLOB_BASE64_RE.test(payload);
  }
  return false;
}

// A save-while-keychain-broken cycle can nest ciphertexts (enc:v2 wrapping an
// enc:v1 blob). Unwrap a bounded number of layers; anything deeper is treated
// as corrupt.
const MAX_NESTED_DECRYPTS = 4;

/**
 * Peel up to MAX_NESTED_DECRYPTS layers of enc:v1/enc:v2 ciphertext.
 * `decryptOnce(value)` decrypts exactly one layer (may throw or return "" on
 * failure). Iteration stops as soon as the value is no longer prefixed — so a
 * value that fully decrypts on the last allowed layer is still returned rather
 * than discarded.
 *
 * @returns {{ value: unknown, exhausted: boolean }} `exhausted` is true iff the
 *   budget ran out with a still-encrypted value.
 */
function unwrapNestedCiphertext(value, decryptOnce) {
  const isPrefixed = (v) =>
    typeof v === "string" &&
    (v.startsWith(ENC_PREFIX_V1) || v.startsWith(ENC_PREFIX_V2));
  let current = value;
  for (let i = 0; i < MAX_NESTED_DECRYPTS; i++) {
    if (!isPrefixed(current)) return { value: current, exhausted: false };
    current = decryptOnce(current);
  }
  return { value: current, exhausted: isPrefixed(current) };
}

function credentialError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function defaultResetMacSafeStorageKeychain({ execFile = execFileSync, appName } = {}) {
  const services = new Set(MAC_SAFE_STORAGE_SERVICE_CANDIDATES);
  if (appName && typeof appName === "string" && appName.trim()) {
    services.add(`${appName.trim()} Safe Storage`);
  }

  const deleted = [];
  for (const service of services) {
    try {
      execFile("security", ["delete-generic-password", "-s", service], {
        stdio: "ignore",
        timeout: 5000,
      });
      deleted.push(service);
    } catch {
      // Missing item or access denied — keep trying the rest.
    }
  }
  return { attempted: true, deleted };
}

/**
 * @param {{
 *   userDataPath?: string,
 *   fs?: typeof fs,
 *   crypto?: typeof crypto,
 * }} deps
 */
function createLocalVault(deps = {}) {
  const fsys = deps.fs ?? fs;
  const crypt = deps.crypto ?? crypto;
  const userDataPath = deps.userDataPath;

  const keyPath = () => {
    if (!userDataPath) return null;
    return path.join(userDataPath, LOCAL_VAULT_KEY_FILE);
  };

  const loadOrCreateKey = () => {
    const file = keyPath();
    if (!file) {
      throw credentialError(
        "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
        "Local credential vault is unavailable (no userData path)",
      );
    }
    try {
      if (fsys.existsSync(file)) {
        const buf = fsys.readFileSync(file);
        if (buf.length === LOCAL_VAULT_KEY_BYTES) return buf;
      }
    } catch {
      // recreate below
    }
    const key = crypt.randomBytes(LOCAL_VAULT_KEY_BYTES);
    fsys.mkdirSync(path.dirname(file), { recursive: true });
    fsys.writeFileSync(file, key, { mode: 0o600 });
    try {
      fsys.chmodSync(file, 0o600);
    } catch {
      // Windows may ignore mode; best-effort.
    }
    return key;
  };

  return {
    isAvailable() {
      return Boolean(userDataPath);
    },
    encrypt(plaintext) {
      const key = loadOrCreateKey();
      const iv = crypt.randomBytes(GCM_IV_BYTES);
      const cipher = crypt.createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(plaintext, "utf8")),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      const packed = Buffer.concat([iv, tag, ciphertext]);
      return ENC_PREFIX_V2 + packed.toString("base64");
    },
    decrypt(encoded) {
      const key = loadOrCreateKey();
      const raw = Buffer.from(encoded.slice(ENC_PREFIX_V2.length), "base64");
      if (raw.length < GCM_IV_BYTES + GCM_TAG_BYTES + 1) {
        throw credentialError(
          "ERR_CREDENTIAL_DECRYPTION_FAILED",
          "Local vault ciphertext is truncated",
        );
      }
      const iv = raw.subarray(0, GCM_IV_BYTES);
      const tag = raw.subarray(GCM_IV_BYTES, GCM_IV_BYTES + GCM_TAG_BYTES);
      const data = raw.subarray(GCM_IV_BYTES + GCM_TAG_BYTES);
      const decipher = crypt.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      try {
        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
      } catch (err) {
        throw credentialError(
          "ERR_CREDENTIAL_DECRYPTION_FAILED",
          "Local vault decryption failed",
          err,
        );
      }
    },
  };
}

/**
 * Register IPC handlers for credential encryption/decryption
 * @param {Electron.IpcMain} ipcMain
 * @param {typeof Electron} electronModule
 * @param {{
 *   platform?: NodeJS.Platform,
 *   resetMacSafeStorageKeychain?: (args: { appName?: string }) => { attempted: boolean, deleted: string[] },
 *   userDataPath?: string,
 *   fs?: typeof fs,
 *   crypto?: typeof crypto,
 *   preferLocalVault?: boolean,
 *   vaultUnlockGate?: { assertUnlocked: () => void },
 * }} [options]
 */
function registerHandlers(ipcMain, electronModule, options = {}) {
  const safeStorage = electronModule?.safeStorage ?? null;
  const platform = options.platform ?? process.platform;
  const resetMacSafeStorageKeychain =
    options.resetMacSafeStorageKeychain ?? defaultResetMacSafeStorageKeychain;
  const preferLocalVault = Boolean(options.preferLocalVault);
  const vaultUnlockGate = options.vaultUnlockGate || null;

  const resolveUserDataPath = () => {
    if (options.userDataPath) return options.userDataPath;
    try {
      return electronModule?.app?.getPath?.("userData") || undefined;
    } catch {
      return undefined;
    }
  };

  const localVault = createLocalVault({
    userDataPath: resolveUserDataPath(),
    fs: options.fs,
    crypto: options.crypto,
  });

  const resolveAppName = () => {
    try {
      return electronModule?.app?.getName?.() || electronModule?.app?.name || undefined;
    } catch {
      return undefined;
    }
  };

  const isSafeStorageAvailable = () => Boolean(safeStorage?.isEncryptionAvailable?.());
  const isLocalVaultAvailable = () => localVault.isAvailable();
  /** Encryption can succeed if either backend works. */
  const isAvailable = () => isSafeStorageAvailable() || isLocalVaultAvailable();

  const repairMacKeychain = () => {
    if (platform !== "darwin") {
      return { attempted: false, deleted: [], available: isAvailable(), safeStorage: isSafeStorageAvailable() };
    }
    const result = resetMacSafeStorageKeychain({ appName: resolveAppName() });
    return {
      attempted: Boolean(result?.attempted),
      deleted: Array.isArray(result?.deleted) ? result.deleted : [],
      available: isAvailable(),
      safeStorage: isSafeStorageAvailable(),
    };
  };

  const encryptWithSafeStorage = (plaintext) => {
    if (!safeStorage?.encryptString) {
      throw credentialError(
        "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
        "Credential encryption is unavailable",
      );
    }
    if (!isSafeStorageAvailable() && platform !== "darwin") {
      throw credentialError(
        "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
        "Credential encryption is unavailable",
      );
    }
    try {
      const encrypted = safeStorage.encryptString(plaintext);
      return ENC_PREFIX_V1 + encrypted.toString("base64");
    } catch (err) {
      throw credentialError(
        isSafeStorageAvailable()
          ? "ERR_CREDENTIAL_ENCRYPTION_FAILED"
          : "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
        isSafeStorageAvailable()
          ? "Credential encryption failed"
          : "Credential encryption is unavailable",
        err,
      );
    }
  };

  const encryptWithSafeStorageAndRepair = (plaintext) => {
    try {
      return encryptWithSafeStorage(plaintext);
    } catch (firstError) {
      if (platform !== "darwin") throw firstError;
      repairMacKeychain();
      return encryptWithSafeStorage(plaintext);
    }
  };

  const encryptValue = (plaintext) => {
    // Prefer OS backend when healthy (unless tests force local vault).
    if (!preferLocalVault && (isSafeStorageAvailable() || platform === "darwin")) {
      try {
        return encryptWithSafeStorageAndRepair(plaintext);
      } catch {
        // fall through to local vault
      }
    }
    if (isLocalVaultAvailable()) {
      return localVault.encrypt(plaintext);
    }
    throw credentialError(
      "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
      "Credential encryption is unavailable",
    );
  };

  const decryptV1 = (value) => {
    if (!safeStorage?.decryptString) {
      throw credentialError(
        "ERR_CREDENTIAL_DECRYPTION_UNAVAILABLE",
        "Credential decryption is unavailable",
      );
    }
    if (!isSafeStorageAvailable() && platform === "darwin") {
      repairMacKeychain();
    }
    if (!isSafeStorageAvailable()) {
      throw credentialError(
        "ERR_CREDENTIAL_DECRYPTION_UNAVAILABLE",
        "Credential decryption is unavailable",
      );
    }
    try {
      const base64 = value.slice(ENC_PREFIX_V1.length);
      const buf = Buffer.from(base64, "base64");
      return safeStorage.decryptString(buf);
    } catch (err) {
      throw credentialError(
        "ERR_CREDENTIAL_DECRYPTION_FAILED",
        "Credential decryption failed",
        err,
      );
    }
  };

  const isAlreadyEncrypted = (plaintext) => {
    if (plaintext.startsWith(ENC_PREFIX_V2)) {
      try {
        localVault.decrypt(plaintext);
        return true;
      } catch {
        return looksLikeEncryptedBlob(plaintext);
      }
    }
    if (plaintext.startsWith(ENC_PREFIX_V1)) {
      if (safeStorage?.decryptString && isSafeStorageAvailable()) {
        try {
          const base64 = plaintext.slice(ENC_PREFIX_V1.length);
          const buf = Buffer.from(base64, "base64");
          safeStorage.decryptString(buf);
          return true;
        } catch {
          return looksLikeEncryptedBlob(plaintext);
        }
      }
      // Broken/unavailable keychain: the blob cannot be verified by
      // decrypting, but re-encrypting it would nest ciphertexts
      // (enc:v2(enc:v1)) that later get sent to providers as the API key.
      return looksLikeEncryptedBlob(plaintext);
    }
    return false;
  };

  ipcMain.handle("magiesTerminal:credentials:available", () => isAvailable());

  ipcMain.handle("magiesTerminal:credentials:status", () => ({
    available: isAvailable(),
    safeStorage: isSafeStorageAvailable(),
    localVault: isLocalVaultAvailable(),
  }));

  ipcMain.handle("magiesTerminal:credentials:repair", () => {
    const result = repairMacKeychain();
    if (platform === "darwin" && safeStorage?.encryptString) {
      try {
        safeStorage.encryptString("magies-terminal-safe-storage-probe");
      } catch {
        // Probe may still fail; local vault remains available.
      }
    }
    return {
      ...result,
      available: isAvailable(),
      safeStorage: isSafeStorageAvailable(),
      localVault: isLocalVaultAvailable(),
    };
  });

  ipcMain.handle("magiesTerminal:credentials:encrypt", (_event, plaintext) => {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      return plaintext ?? "";
    }
    if (isAlreadyEncrypted(plaintext)) {
      return plaintext;
    }
    return encryptValue(plaintext);
  });

  ipcMain.handle("magiesTerminal:credentials:decrypt", (_event, value) => {
    // Device-unlock boundary: while the vault is locked, no renderer (or
    // DevTools/peer window) may decrypt secrets, regardless of any renderer-side
    // unlock flag. assertUnlocked throws ERR_VAULT_LOCKED when locked.
    vaultUnlockGate?.assertUnlocked?.();
    if (typeof value !== "string" || value.length === 0) {
      return value ?? "";
    }
    // Unwrap nested ciphertext (enc:v2 wrapping enc:v1) produced by older builds
    // that re-encrypted an unverifiable blob during save.
    const { value: result, exhausted } = unwrapNestedCiphertext(value, (v) =>
      v.startsWith(ENC_PREFIX_V2) ? localVault.decrypt(v) : decryptV1(v),
    );
    if (exhausted) {
      throw credentialError(
        "ERR_CREDENTIAL_DECRYPTION_FAILED",
        "Credential decryption failed",
      );
    }
    return result;
  });
}

module.exports = {
  registerHandlers,
  defaultResetMacSafeStorageKeychain,
  createLocalVault,
  looksLikeEncryptedBlob,
  unwrapNestedCiphertext,
  MAX_NESTED_DECRYPTS,
  MAC_SAFE_STORAGE_SERVICE_CANDIDATES,
  ENC_PREFIX,
  ENC_PREFIX_V1,
  ENC_PREFIX_V2,
  LOCAL_VAULT_KEY_FILE,
};
