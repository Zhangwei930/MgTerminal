import {
  hashVaultPlatformUnlockPin,
  normalizeVaultPlatformUnlockConfig,
  type VaultPlatformUnlockConfig,
  validateVaultPlatformUnlockPin,
  verifyVaultPlatformUnlockPin,
} from "../../domain/vaultPlatformUnlock";
import { STORAGE_KEY_VAULT_PLATFORM_UNLOCK } from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";

/** In-memory session unlock — cleared on app restart. */
let sessionUnlocked = false;

export function isVaultPlatformSessionUnlocked(): boolean {
  return sessionUnlocked;
}

export function setVaultPlatformSessionUnlocked(value: boolean): void {
  sessionUnlocked = value;
}

export function readVaultPlatformUnlockConfig(): VaultPlatformUnlockConfig {
  const raw = localStorageAdapter.read<unknown>(STORAGE_KEY_VAULT_PLATFORM_UNLOCK);
  return normalizeVaultPlatformUnlockConfig(raw);
}

export function writeVaultPlatformUnlockConfig(config: VaultPlatformUnlockConfig): void {
  const normalized = normalizeVaultPlatformUnlockConfig(config);
  localStorageAdapter.write(STORAGE_KEY_VAULT_PLATFORM_UNLOCK, normalized);
}

export function isVaultPlatformUnlockRequired(): boolean {
  const config = readVaultPlatformUnlockConfig();
  return config.enabled === true && !sessionUnlocked;
}

export async function enableVaultPlatformUnlockWithPin(pin: string): Promise<VaultPlatformUnlockConfig> {
  const valid = validateVaultPlatformUnlockPin(pin);
  if (!valid.ok) {
    throw new Error(valid.reason);
  }
  const hashed = await hashVaultPlatformUnlockPin(pin);
  const config: VaultPlatformUnlockConfig = {
    enabled: true,
    pinHash: hashed.pinHash,
    pinSalt: hashed.pinSalt,
    pinIterations: hashed.pinIterations,
  };
  writeVaultPlatformUnlockConfig(config);
  sessionUnlocked = true;
  return config;
}

export function disableVaultPlatformUnlock(): VaultPlatformUnlockConfig {
  const config: VaultPlatformUnlockConfig = { enabled: false };
  writeVaultPlatformUnlockConfig(config);
  sessionUnlocked = true;
  return config;
}

export async function tryUnlockVaultWithPin(pin: string): Promise<boolean> {
  const config = readVaultPlatformUnlockConfig();
  if (!config.enabled) {
    sessionUnlocked = true;
    return true;
  }
  const ok = await verifyVaultPlatformUnlockPin(pin, config);
  if (ok) sessionUnlocked = true;
  return ok;
}

export function markVaultUnlockedByPlatform(): void {
  sessionUnlocked = true;
}
