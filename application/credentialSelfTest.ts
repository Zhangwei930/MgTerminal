/**
 * Credential self-test — System-page diagnostic for the 0.4.x credential
 * failure surface (broken keychain, nested/undecryptable ciphertext).
 *
 * Runs two checks:
 * 1. Round-trip probe: encrypt a marker string and decrypt it back.
 * 2. Vault scan: read the persisted (encrypted) vault items, attempt to
 *    decrypt every secret field, and report fields that stay ciphertext.
 */

import {
  collectSecuredFields,
  findUndecryptableCredentialFields,
  type CredentialFieldIssue,
} from "../domain/credentialHealth";
import type { GroupConfig, Host, Identity, ProxyProfile, SSHKey } from "../domain/models";
import {
  STORAGE_KEY_GROUP_CONFIGS,
  STORAGE_KEY_HOSTS,
  STORAGE_KEY_IDENTITIES,
  STORAGE_KEY_KEYS,
  STORAGE_KEY_PROXY_PROFILES,
} from "../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../infrastructure/persistence/localStorageAdapter";
import { magiesTerminalBridge } from "../infrastructure/services/magiesTerminalBridge";

export type CredentialProbeStatus = "ok" | "unavailable" | "failed" | "mismatch";

export interface CredentialSelfTestResult {
  probe: CredentialProbeStatus;
  checkedFields: number;
  issues: CredentialFieldIssue[];
}

interface CredentialSelfTestDeps {
  encrypt: ((value: string) => Promise<string | undefined>) | undefined;
  decrypt: ((value: string) => Promise<string | undefined>) | undefined;
  readVault: () => {
    hosts?: Host[];
    keys?: SSHKey[];
    identities?: Identity[];
    groupConfigs?: GroupConfig[];
    proxyProfiles?: ProxyProfile[];
  };
}

const PROBE_PLAINTEXT = "magies-terminal-credential-selftest-probe";

export async function runCredentialSelfTest(
  deps: CredentialSelfTestDeps,
): Promise<CredentialSelfTestResult> {
  const { encrypt, decrypt, readVault } = deps;

  if (!encrypt || !decrypt) {
    return { probe: "unavailable", checkedFields: 0, issues: [] };
  }

  let probe: CredentialProbeStatus;
  try {
    const ciphertext = await encrypt(PROBE_PLAINTEXT);
    if (!ciphertext || ciphertext === PROBE_PLAINTEXT) {
      // encrypt returned plaintext / nothing: no protection is applied
      probe = "failed";
    } else {
      const roundTrip = await decrypt(ciphertext);
      probe = roundTrip === PROBE_PLAINTEXT ? "ok" : "mismatch";
    }
  } catch {
    probe = "failed";
  }

  const refs = collectSecuredFields(readVault());
  const decrypted = await Promise.all(
    refs.map(async (ref) => {
      try {
        return { ...ref, value: (await decrypt(ref.value)) ?? ref.value };
      } catch {
        // Same fail-soft as decryptField: keep ciphertext so the scan flags it.
        return ref;
      }
    }),
  );

  return {
    probe,
    checkedFields: refs.length,
    issues: findUndecryptableCredentialFields(decrypted),
  };
}

export function runStoredVaultCredentialSelfTest(): Promise<CredentialSelfTestResult> {
  const bridge = magiesTerminalBridge.get();
  return runCredentialSelfTest({
    encrypt: bridge?.credentialsEncrypt?.bind(bridge),
    decrypt: bridge?.credentialsDecrypt?.bind(bridge),
    readVault: () => ({
      hosts: localStorageAdapter.read<Host[]>(STORAGE_KEY_HOSTS) ?? undefined,
      keys: localStorageAdapter.read<SSHKey[]>(STORAGE_KEY_KEYS) ?? undefined,
      identities:
        localStorageAdapter.read<Identity[]>(STORAGE_KEY_IDENTITIES) ?? undefined,
      groupConfigs:
        localStorageAdapter.read<GroupConfig[]>(STORAGE_KEY_GROUP_CONFIGS) ?? undefined,
      proxyProfiles:
        localStorageAdapter.read<ProxyProfile[]>(STORAGE_KEY_PROXY_PROFILES) ?? undefined,
    }),
  });
}
