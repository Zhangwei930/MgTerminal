import {
  hashVaultPlatformUnlockPin,
  normalizeVaultPlatformUnlockConfig,
  type VaultPlatformUnlockConfig,
  validateVaultPlatformUnlockPin,
  verifyVaultPlatformUnlockPin,
} from "../../domain/vaultPlatformUnlock";
import { STORAGE_KEY_VAULT_PLATFORM_UNLOCK } from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

/**
 * In-memory session unlock — cleared on app restart. This mirror only drives
 * UX (overlay visibility / deferring decryption). The real security boundary
 * is the main process (see electron/bridges/vaultUnlockGate.cjs), which refuses
 * decryption until it is unlocked with a secret it verifies itself.
 */
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
  // Main process is the authority; configure it before persisting the mirror.
  await magiesTerminalBridge.get()?.vaultConfigureUnlock?.({ pin });
  writeVaultPlatformUnlockConfig(config);
  sessionUnlocked = true;
  return config;
}

export async function disableVaultPlatformUnlock(): Promise<VaultPlatformUnlockConfig> {
  const config: VaultPlatformUnlockConfig = { enabled: false };
  await magiesTerminalBridge.get()?.vaultConfigureUnlock?.({ disable: true });
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
  // The main-process gate is the source of truth. Fall back to renderer
  // verification only when the bridge is unavailable (web/test builds).
  const bridge = magiesTerminalBridge.get();
  if (bridge?.vaultUnlockWithPin) {
    const result = await bridge.vaultUnlockWithPin(pin);
    if (result?.success) sessionUnlocked = true;
    return Boolean(result?.success);
  }
  const ok = await verifyVaultPlatformUnlockPin(pin, config);
  if (ok) sessionUnlocked = true;
  return ok;
}

/**
 * Unlock via platform auth (Touch ID). The prompt runs in the main process so
 * the boundary cannot be bypassed by a renderer that merely claims success.
 * Returns true when the vault is unlocked.
 */
export async function unlockVaultWithPlatform(reason?: string): Promise<boolean> {
  const bridge = magiesTerminalBridge.get();
  if (bridge?.vaultUnlockWithPlatform) {
    const result = await bridge.vaultUnlockWithPlatform({ reason });
    if (result?.success) sessionUnlocked = true;
    return Boolean(result?.success);
  }
  // No bridge (web/test): treat as unlocked for UX parity.
  sessionUnlocked = true;
  return true;
}

export function markVaultUnlockedByPlatform(): void {
  sessionUnlocked = true;
}

/**
 * One-time startup migration: hand the renderer-persisted config to the main
 * process so upgrading users keep their PIN and the boundary starts enforcing.
 */
export async function syncVaultUnlockConfigToMain(): Promise<void> {
  const config = readVaultPlatformUnlockConfig();
  if (!config.enabled) return;
  await magiesTerminalBridge.get()?.vaultAdoptLegacyUnlockConfig?.(config);
}
