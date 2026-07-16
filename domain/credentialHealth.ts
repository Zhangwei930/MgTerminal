/**
 * Credential health — pure helpers for the System-page credential self-test.
 *
 * After a vault load, every secret field has been through decryptField, which
 * fails soft and keeps the stored ciphertext when the keychain / local vault
 * cannot decrypt it (see secureFieldAdapter). A field that still looks like an
 * enc:v1 / enc:v2 placeholder therefore marks a credential the user cannot
 * actually use — the exact 0.4.x failure mode behind AI 401s and silent
 * password-auth failures.
 */

import { isEncryptedCredentialPlaceholder } from "./credentials";
import type { GroupConfig, Host, Identity, ProxyProfile, SSHKey } from "./models";

export type SecuredItemType =
  | "host"
  | "key"
  | "identity"
  | "group"
  | "proxyProfile";

export interface SecuredFieldRef {
  itemType: SecuredItemType;
  itemId: string;
  label: string;
  field: string;
  value: string;
}

export interface CredentialFieldIssue {
  itemType: SecuredItemType;
  itemId: string;
  label: string;
  field: string;
}

interface VaultSnapshot {
  hosts?: Host[];
  keys?: SSHKey[];
  identities?: Identity[];
  groupConfigs?: GroupConfig[];
  proxyProfiles?: ProxyProfile[];
}

export function collectSecuredFields(vault: VaultSnapshot): SecuredFieldRef[] {
  const refs: SecuredFieldRef[] = [];
  const add = (
    itemType: SecuredItemType,
    itemId: string,
    label: string,
    field: string,
    value: string | undefined,
  ) => {
    if (value) refs.push({ itemType, itemId, label, field, value });
  };

  for (const h of vault.hosts ?? []) {
    add("host", h.id, h.label, "password", h.password);
    add("host", h.id, h.label, "telnetPassword", h.telnetPassword);
    add("host", h.id, h.label, "proxyConfig.password", h.proxyConfig?.password);
  }
  for (const k of vault.keys ?? []) {
    add("key", k.id, k.label, "passphrase", k.passphrase);
    add("key", k.id, k.label, "privateKey", k.privateKey);
  }
  for (const i of vault.identities ?? []) {
    add("identity", i.id, i.label, "password", i.password);
  }
  for (const g of vault.groupConfigs ?? []) {
    add("group", g.path, g.path, "password", g.password);
    add("group", g.path, g.path, "telnetPassword", g.telnetPassword);
    add("group", g.path, g.path, "proxyConfig.password", g.proxyConfig?.password);
  }
  for (const p of vault.proxyProfiles ?? []) {
    add("proxyProfile", p.id, p.label, "config.password", p.config?.password);
  }

  return refs;
}

export function findUndecryptableCredentialFields(
  refs: SecuredFieldRef[],
): CredentialFieldIssue[] {
  return refs
    .filter((ref) => isEncryptedCredentialPlaceholder(ref.value))
    .map(({ itemType, itemId, label, field }) => ({
      itemType,
      itemId,
      label,
      field,
    }));
}
