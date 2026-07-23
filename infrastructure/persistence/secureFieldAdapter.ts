/**
 * Secure Field Adapter — Renderer-side helpers for field-level encryption
 *
 * Encrypts / decrypts individual sensitive fields within domain models before
 * they are written to (or after they are read from) localStorage.
 *
 * The heavy lifting is done by Electron's safeStorage via the credential
 * bridge IPC. Credential writes fail closed when that bridge is unavailable,
 * preventing sensitive values from silently falling back to plaintext.
 */

import type { DbConnectionProfile, GroupConfig, Host, Identity, ManagedSource, ProxyProfile, SSHKey } from "../../domain/models";
import type { ProviderConnection, S3Config, WebDAVConfig } from "../../domain/sync";
import { magiesTerminalBridge } from "../services/magiesTerminalBridge";

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

const bridge = () => magiesTerminalBridge.get();

export class CredentialEncryptionUnavailableError extends Error {
  constructor() {
    super('Credential encryption bridge is unavailable');
    this.name = 'CredentialEncryptionUnavailableError';
  }
}

export async function encryptField(value: string | undefined): Promise<string | undefined> {
  if (!value) return value;
  const b = bridge();
  if (!b?.credentialsEncrypt) throw new CredentialEncryptionUnavailableError();
  return b.credentialsEncrypt(value);
}

/**
 * Decrypt a single stored field. Fails soft: if the bridge is missing or
 * decryption throws (broken keychain, corrupt/nested ciphertext), the original
 * stored value is returned rather than rejecting — so a single bad credential
 * never aborts a whole vault load, and the value stays recoverable after a
 * keychain repair. The result may therefore still be an encrypted placeholder;
 * callers must guard with `isEncryptedCredentialPlaceholder` /
 * `sanitizeCredentialValue` before displaying it or using it as a secret.
 */
export async function decryptField(value: string | undefined): Promise<string | undefined> {
  if (!value) return value;
  const b = bridge();
  if (!b?.credentialsDecrypt) return value;
  try {
    return await b.credentialsDecrypt(value);
  } catch (err) {
    console.warn('[secureFieldAdapter] decryptField failed; keeping stored value:', (err as Error)?.message ?? err);
    return value;
  }
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export async function encryptHostSecrets(host: Host): Promise<Host> {
  const out = { ...host };
  out.password = await encryptField(out.password);
  out.telnetPassword = await encryptField(out.telnetPassword);
  if (out.proxyConfig?.password) {
    out.proxyConfig = { ...out.proxyConfig, password: await encryptField(out.proxyConfig.password) };
  }
  return out;
}

export async function decryptHostSecrets(host: Host): Promise<Host> {
  const out = { ...host };
  out.password = await decryptField(out.password);
  out.telnetPassword = await decryptField(out.telnetPassword);
  if (out.proxyConfig?.password) {
    out.proxyConfig = { ...out.proxyConfig, password: await decryptField(out.proxyConfig.password) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// SSHKey
// ---------------------------------------------------------------------------

export async function encryptKeySecrets(key: SSHKey): Promise<SSHKey> {
  const out = { ...key };
  out.passphrase = await encryptField(out.passphrase);
  out.privateKey = (await encryptField(out.privateKey)) ?? "";
  return out;
}

export async function decryptKeySecrets(key: SSHKey): Promise<SSHKey> {
  const out = { ...key };
  out.passphrase = await decryptField(out.passphrase);
  out.privateKey = (await decryptField(out.privateKey)) ?? "";
  return out;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export async function encryptIdentitySecrets(identity: Identity): Promise<Identity> {
  const out = { ...identity };
  out.password = await encryptField(out.password);
  return out;
}

export async function decryptIdentitySecrets(identity: Identity): Promise<Identity> {
  const out = { ...identity };
  out.password = await decryptField(out.password);
  return out;
}

// ---------------------------------------------------------------------------
// DbConnectionProfile
// ---------------------------------------------------------------------------

export async function encryptDbConnectionSecrets(profile: DbConnectionProfile): Promise<DbConnectionProfile> {
  const out = { ...profile };
  out.dbPassword = await encryptField(out.dbPassword);
  return out;
}

export async function decryptDbConnectionSecrets(profile: DbConnectionProfile): Promise<DbConnectionProfile> {
  const out = { ...profile };
  out.dbPassword = await decryptField(out.dbPassword);
  return out;
}

// ---------------------------------------------------------------------------
// GroupConfig
// ---------------------------------------------------------------------------

export async function encryptGroupConfigSecrets(config: GroupConfig): Promise<GroupConfig> {
  const out = { ...config };
  out.password = await encryptField(out.password);
  out.telnetPassword = await encryptField(out.telnetPassword);
  if (out.proxyConfig?.password) {
    out.proxyConfig = { ...out.proxyConfig, password: await encryptField(out.proxyConfig.password) };
  }
  return out;
}

export async function decryptGroupConfigSecrets(config: GroupConfig): Promise<GroupConfig> {
  const out = { ...config };
  out.password = await decryptField(out.password);
  out.telnetPassword = await decryptField(out.telnetPassword);
  if (out.proxyConfig?.password) {
    out.proxyConfig = { ...out.proxyConfig, password: await decryptField(out.proxyConfig.password) };
  }
  return out;
}

export function encryptGroupConfigs(configs: GroupConfig[]): Promise<GroupConfig[]> {
  return Promise.all(configs.map(encryptGroupConfigSecrets));
}

export function decryptGroupConfigs(configs: GroupConfig[]): Promise<GroupConfig[]> {
  return Promise.all(configs.map(decryptGroupConfigSecrets));
}

// ---------------------------------------------------------------------------
// ManagedSource (external inventory data sources)
// ---------------------------------------------------------------------------

export async function encryptManagedSourceSecrets(source: ManagedSource): Promise<ManagedSource> {
  if (!source.httpAuthHeaderValue) return source;
  return { ...source, httpAuthHeaderValue: await encryptField(source.httpAuthHeaderValue) };
}

export async function decryptManagedSourceSecrets(source: ManagedSource): Promise<ManagedSource> {
  if (!source.httpAuthHeaderValue) return source;
  return { ...source, httpAuthHeaderValue: await decryptField(source.httpAuthHeaderValue) };
}

export function encryptManagedSources(sources: ManagedSource[]): Promise<ManagedSource[]> {
  return Promise.all(sources.map(encryptManagedSourceSecrets));
}

export function decryptManagedSources(sources: ManagedSource[]): Promise<ManagedSource[]> {
  return Promise.all(sources.map(decryptManagedSourceSecrets));
}

// ---------------------------------------------------------------------------
// ProxyProfile
// ---------------------------------------------------------------------------

export async function encryptProxyProfileSecrets(profile: ProxyProfile): Promise<ProxyProfile> {
  const out = { ...profile, config: { ...profile.config } };
  out.config.password = await encryptField(out.config.password);
  return out;
}

export async function decryptProxyProfileSecrets(profile: ProxyProfile): Promise<ProxyProfile> {
  const out = { ...profile, config: { ...profile.config } };
  out.config.password = await decryptField(out.config.password);
  return out;
}

export function encryptProxyProfiles(profiles: ProxyProfile[]): Promise<ProxyProfile[]> {
  return Promise.all(profiles.map(encryptProxyProfileSecrets));
}

export function decryptProxyProfiles(profiles: ProxyProfile[]): Promise<ProxyProfile[]> {
  return Promise.all(profiles.map(decryptProxyProfileSecrets));
}

// ---------------------------------------------------------------------------
// Provider Connection (Cloud Sync)
// ---------------------------------------------------------------------------

export async function encryptProviderSecrets(conn: ProviderConnection): Promise<ProviderConnection> {
  const out = { ...conn };

  if (out.tokens) {
    const t = { ...out.tokens };
    t.accessToken = (await encryptField(t.accessToken)) ?? "";
    t.refreshToken = await encryptField(t.refreshToken);
    out.tokens = t;
  }

  if (out.config) {
    // WebDAV — use authType (required field unique to WebDAVConfig) as discriminator
    // so that token-auth configs (which may lack a password key after JSON round-trip)
    // still get their token field encrypted.
    if ("authType" in out.config) {
      const c = { ...out.config } as WebDAVConfig;
      c.password = await encryptField(c.password);
      c.token = await encryptField(c.token);
      out.config = c;
    }
    // S3
    if ("secretAccessKey" in out.config) {
      const c = { ...out.config } as S3Config;
      c.secretAccessKey = (await encryptField(c.secretAccessKey)) ?? "";
      c.sessionToken = await encryptField(c.sessionToken);
      out.config = c;
    }
  }

  return out;
}

export async function decryptProviderSecrets(conn: ProviderConnection): Promise<ProviderConnection> {
  const out = { ...conn };

  if (out.tokens) {
    const t = { ...out.tokens };
    t.accessToken = (await decryptField(t.accessToken)) ?? "";
    t.refreshToken = await decryptField(t.refreshToken);
    out.tokens = t;
  }

  if (out.config) {
    if ("authType" in out.config) {
      const c = { ...out.config } as WebDAVConfig;
      c.password = await decryptField(c.password);
      c.token = await decryptField(c.token);
      out.config = c;
    }
    if ("secretAccessKey" in out.config) {
      const c = { ...out.config } as S3Config;
      c.secretAccessKey = (await decryptField(c.secretAccessKey)) ?? "";
      c.sessionToken = await decryptField(c.sessionToken);
      out.config = c;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Batch helpers
// ---------------------------------------------------------------------------

export function encryptHosts(hosts: Host[]): Promise<Host[]> {
  return Promise.all(hosts.map(encryptHostSecrets));
}

export function decryptHosts(hosts: Host[]): Promise<Host[]> {
  return Promise.all(hosts.map(decryptHostSecrets));
}

export function encryptKeys(keys: SSHKey[]): Promise<SSHKey[]> {
  return Promise.all(keys.map(encryptKeySecrets));
}

export function decryptKeys(keys: SSHKey[]): Promise<SSHKey[]> {
  return Promise.all(keys.map(decryptKeySecrets));
}

export function encryptIdentities(identities: Identity[]): Promise<Identity[]> {
  return Promise.all(identities.map(encryptIdentitySecrets));
}

export function decryptIdentities(identities: Identity[]): Promise<Identity[]> {
  return Promise.all(identities.map(decryptIdentitySecrets));
}

export function encryptDbConnections(profiles: DbConnectionProfile[]): Promise<DbConnectionProfile[]> {
  return Promise.all(profiles.map(encryptDbConnectionSecrets));
}

export function decryptDbConnections(profiles: DbConnectionProfile[]): Promise<DbConnectionProfile[]> {
  return Promise.all(profiles.map(decryptDbConnectionSecrets));
}
