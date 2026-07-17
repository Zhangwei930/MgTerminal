/**
 * Opt-in device unlock before vault secrets are revealed in memory.
 * Platform authenticator (Touch ID / Hello when available) + optional local PIN.
 * Not a portable passkey identity — local device presence only.
 */

export type VaultPlatformUnlockConfig = {
  /** Default false — vault decrypts on load as today. */
  enabled: boolean;
  /** PBKDF2-SHA256 hex hash of PIN; optional if platform auth always available. */
  pinHash?: string;
  pinSalt?: string;
  /** iterations used for pinHash */
  pinIterations?: number;
};

export const VAULT_PLATFORM_UNLOCK_PIN_ITERATIONS = 120_000;
export const VAULT_PLATFORM_UNLOCK_PIN_MIN_LEN = 4;
export const VAULT_PLATFORM_UNLOCK_PIN_MAX_LEN = 12;

export function normalizeVaultPlatformUnlockConfig(value: unknown): VaultPlatformUnlockConfig {
  if (!value || typeof value !== "object") {
    return { enabled: false };
  }
  const record = value as Record<string, unknown>;
  const enabled = record.enabled === true;
  const pinHash = typeof record.pinHash === "string" && record.pinHash ? record.pinHash : undefined;
  const pinSalt = typeof record.pinSalt === "string" && record.pinSalt ? record.pinSalt : undefined;
  const pinIterations = Number.isFinite(Number(record.pinIterations))
    ? Math.max(10_000, Math.floor(Number(record.pinIterations)))
    : VAULT_PLATFORM_UNLOCK_PIN_ITERATIONS;
  return {
    enabled,
    pinHash,
    pinSalt,
    pinIterations: pinHash ? pinIterations : undefined,
  };
}

export function isVaultPlatformUnlockEnabled(config: VaultPlatformUnlockConfig | null | undefined): boolean {
  return Boolean(config?.enabled);
}

export function hasVaultPlatformUnlockPin(config: VaultPlatformUnlockConfig | null | undefined): boolean {
  return Boolean(config?.enabled && config.pinHash && config.pinSalt);
}

export function validateVaultPlatformUnlockPin(pin: string): { ok: true } | { ok: false; reason: string } {
  if (typeof pin !== "string") return { ok: false, reason: "empty" };
  const trimmed = pin.trim();
  if (trimmed.length < VAULT_PLATFORM_UNLOCK_PIN_MIN_LEN) return { ok: false, reason: "too_short" };
  if (trimmed.length > VAULT_PLATFORM_UNLOCK_PIN_MAX_LEN) return { ok: false, reason: "too_long" };
  if (!/^\d+$/.test(trimmed)) return { ok: false, reason: "digits_only" };
  return { ok: true };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function hashVaultPlatformUnlockPin(
  pin: string,
  saltHex?: string,
  iterations: number = VAULT_PLATFORM_UNLOCK_PIN_ITERATIONS,
): Promise<{ pinHash: string; pinSalt: string; pinIterations: number }> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("Web Crypto unavailable for PIN hashing.");
  }
  const salt = saltHex
    ? fromHex(saltHex)
    : cryptoApi.getRandomValues(new Uint8Array(16));
  const keyMaterial = await cryptoApi.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin.trim()),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await cryptoApi.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    keyMaterial,
    256,
  );
  return {
    pinHash: toHex(bits),
    pinSalt: toHex(salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength)),
    pinIterations: iterations,
  };
}

export async function verifyVaultPlatformUnlockPin(
  pin: string,
  config: VaultPlatformUnlockConfig,
): Promise<boolean> {
  if (!config.pinHash || !config.pinSalt) return false;
  const iterations = config.pinIterations || VAULT_PLATFORM_UNLOCK_PIN_ITERATIONS;
  const hashed = await hashVaultPlatformUnlockPin(pin, config.pinSalt, iterations);
  return hashed.pinHash === config.pinHash;
}

export type VaultPlatformUnlockMethod = "platform" | "pin" | "none";

export function resolveVaultPlatformUnlockMethods(input: {
  config: VaultPlatformUnlockConfig;
  platformAuthAvailable: boolean;
}): VaultPlatformUnlockMethod[] {
  if (!input.config.enabled) return ["none"];
  const methods: VaultPlatformUnlockMethod[] = [];
  if (input.platformAuthAvailable) methods.push("platform");
  if (hasVaultPlatformUnlockPin(input.config)) methods.push("pin");
  if (methods.length === 0) methods.push("pin"); // enable path must set PIN if no platform
  return methods;
}
