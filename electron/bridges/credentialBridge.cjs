/**
 * Credential Bridge - Field-level encryption for sensitive data at rest
 *
 * Uses Electron's safeStorage API to encrypt individual sensitive fields
 * (passwords, tokens, private keys) before they are persisted to localStorage.
 *
 * Sentinel prefix "enc:v1:" on encrypted values enables:
 * - Detection of already-encrypted vs plaintext (migration)
 * - No double-encryption
 * - Future re-keying with enc:v2: etc.
 *
 * Encryption and encrypted-value decryption fail closed when safeStorage is
 * unavailable. Plaintext reads remain supported for one-time migration.
 *
 * macOS note: ad-hoc / frequently re-signed builds often leave a Keychain
 * "… Safe Storage" item whose ACL no longer matches the current binary.
 * `isEncryptionAvailable()` then returns false until that item is removed.
 * Encrypt auto-repairs once; UI can also call credentials:repair.
 */

const { execFileSync } = require("node:child_process");

const ENC_PREFIX = "enc:v1:";

/** Known Electron safeStorage Keychain service names for this product line. */
const MAC_SAFE_STORAGE_SERVICE_CANDIDATES = [
  "Magies Terminal Safe Storage",
  "MagiesTerminal Safe Storage",
  "magies-terminal Safe Storage",
  "Electron Safe Storage",
];

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
 * Register IPC handlers for credential encryption/decryption
 * @param {Electron.IpcMain} ipcMain
 * @param {typeof Electron} electronModule
 * @param {{
 *   platform?: NodeJS.Platform,
 *   resetMacSafeStorageKeychain?: (args: { appName?: string }) => { attempted: boolean, deleted: string[] },
 * }} [options]
 */
function registerHandlers(ipcMain, electronModule, options = {}) {
  const safeStorage = electronModule?.safeStorage ?? null;
  const platform = options.platform ?? process.platform;
  const resetMacSafeStorageKeychain =
    options.resetMacSafeStorageKeychain ?? defaultResetMacSafeStorageKeychain;

  const resolveAppName = () => {
    try {
      return electronModule?.app?.getName?.() || electronModule?.app?.name || undefined;
    } catch {
      return undefined;
    }
  };

  const isAvailable = () => Boolean(safeStorage?.isEncryptionAvailable?.());

  const repairMacKeychain = () => {
    if (platform !== "darwin") {
      return { attempted: false, deleted: [], available: isAvailable() };
    }
    const result = resetMacSafeStorageKeychain({ appName: resolveAppName() });
    return {
      attempted: Boolean(result?.attempted),
      deleted: Array.isArray(result?.deleted) ? result.deleted : [],
      available: isAvailable(),
    };
  };

  /**
   * Encrypt with one automatic macOS keychain repair attempt.
   * Returns ciphertext string or throws credentialError.
   */
  const encryptStringWithRepair = (plaintext) => {
    const attempt = () => {
      if (!safeStorage?.encryptString) {
        throw credentialError(
          "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
          "Credential encryption is unavailable",
        );
      }
      // Prefer the availability probe, but still try encrypt when false on macOS —
      // the first encrypt often creates the Safe Storage item / re-prompts ACL.
      if (!isAvailable() && platform !== "darwin") {
        throw credentialError(
          "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
          "Credential encryption is unavailable",
        );
      }
      try {
        const encrypted = safeStorage.encryptString(plaintext);
        return ENC_PREFIX + encrypted.toString("base64");
      } catch (err) {
        throw credentialError(
          isAvailable() ? "ERR_CREDENTIAL_ENCRYPTION_FAILED" : "ERR_CREDENTIAL_ENCRYPTION_UNAVAILABLE",
          isAvailable() ? "Credential encryption failed" : "Credential encryption is unavailable",
          err,
        );
      }
    };

    try {
      return attempt();
    } catch (firstError) {
      if (platform !== "darwin") throw firstError;
      repairMacKeychain();
      return attempt();
    }
  };

  ipcMain.handle("magiesTerminal:credentials:available", () => isAvailable());

  ipcMain.handle("magiesTerminal:credentials:repair", () => {
    const result = repairMacKeychain();
    // After deleting a stale item, force a create probe so Keychain ACL can re-prompt.
    if (platform === "darwin" && safeStorage?.encryptString) {
      try {
        safeStorage.encryptString("magies-terminal-safe-storage-probe");
      } catch {
        // Probe may still fail until the user allows Keychain access.
      }
    }
    return {
      ...result,
      available: isAvailable(),
    };
  });

  ipcMain.handle("magiesTerminal:credentials:encrypt", (_event, plaintext) => {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      return plaintext ?? "";
    }
    // If value looks like it might already be encrypted, verify by attempting
    // to decode and decrypt.  If it succeeds the value is genuinely encrypted
    // and we return it as-is; if it fails, the prefix was a coincidence and
    // we proceed to encrypt the raw plaintext.
    if (plaintext.startsWith(ENC_PREFIX) && safeStorage?.decryptString && isAvailable()) {
      try {
        const base64 = plaintext.slice(ENC_PREFIX.length);
        const buf = Buffer.from(base64, "base64");
        safeStorage.decryptString(buf); // throws on invalid ciphertext
        return plaintext; // verified — already encrypted
      } catch {
        // Not valid ciphertext — fall through to encrypt
      }
    }
    return encryptStringWithRepair(plaintext);
  });

  ipcMain.handle("magiesTerminal:credentials:decrypt", (_event, value) => {
    if (typeof value !== "string" || value.length === 0) {
      return value ?? "";
    }
    // Not encrypted — pass through (supports migration from plaintext)
    if (!value.startsWith(ENC_PREFIX)) {
      return value;
    }
    if (!safeStorage?.decryptString) {
      throw credentialError(
        "ERR_CREDENTIAL_DECRYPTION_UNAVAILABLE",
        "Credential decryption is unavailable",
      );
    }
    if (!isAvailable() && platform === "darwin") {
      // One repair attempt: stale ACL after app upgrade.
      repairMacKeychain();
    }
    if (!isAvailable()) {
      throw credentialError(
        "ERR_CREDENTIAL_DECRYPTION_UNAVAILABLE",
        "Credential decryption is unavailable",
      );
    }
    try {
      const base64 = value.slice(ENC_PREFIX.length);
      const buf = Buffer.from(base64, "base64");
      return safeStorage.decryptString(buf);
    } catch (err) {
      throw credentialError(
        "ERR_CREDENTIAL_DECRYPTION_FAILED",
        "Credential decryption failed",
        err,
      );
    }
  });
}

module.exports = {
  registerHandlers,
  defaultResetMacSafeStorageKeychain,
  MAC_SAFE_STORAGE_SERVICE_CANDIDATES,
  ENC_PREFIX,
};
