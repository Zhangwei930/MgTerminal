/**
 * Pluggable host inventory (Termius API Bridge–style).
 * Pull-only sources: local file or HTTP(S) URL.
 * Formats: MagiesTerminal JSON inventory, classic Ansible INI / YAML.
 * Credentials never imported — only host metadata + optional identity hints.
 */

import type { Host, ManagedSource } from "./models";
import { sanitizeHost } from "./host";
import { getNextVaultOrder } from "./vaultOrder";
import {
  inventoryItemsToAnsibleIni,
  looksLikeAnsibleInventoryIni,
  parseAnsibleInventoryIni,
} from "./ansibleInventory";
import {
  looksLikeAnsibleInventoryYaml,
  parseAnsibleInventoryYaml,
} from "./ansibleInventoryYaml";

export type HostInventoryProtocol = "ssh" | "telnet";

export type HostInventoryItem = {
  /** Stable external id (required for merge). */
  id: string;
  label: string;
  hostname: string;
  port?: number;
  username?: string;
  group?: string;
  tags?: string[];
  protocol?: HostInventoryProtocol;
  os?: "linux" | "windows" | "macos";
  deviceType?: "general" | "network";
  /** Display-only auth preference; never carries secrets. */
  authMethod?: "password" | "key" | "certificate" | "agent";
  /** Free-text identity/key path hint (not auto-linked to Keychain). */
  identityHint?: string;
};

export type HostInventoryDocument = {
  version: number;
  hosts: HostInventoryItem[];
};

/** Team-share package: same inventory schema + optional provenance metadata. */
export type HostInventoryShareDocument = HostInventoryDocument & {
  exportedAt?: number;
  /** Producer id for humans (not a trust boundary). */
  source?: string;
};

export type HostInventoryExportResult = {
  document: HostInventoryShareDocument;
  json: string;
  exportedCount: number;
  skippedCount: number;
};

export type HostDataSourceSyncMode = "merge" | "replace_group";

export type HostDataSourceSyncStats = {
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  totalInventory: number;
};

export type HostDataSourceSyncResult = {
  hosts: Host[];
  customGroups: string[];
  stats: HostDataSourceSyncStats;
  contentHash: string;
};

const FORBIDDEN_SECRET_KEYS = new Set([
  "password",
  "passphrase",
  "privatekey",
  "private_key",
  "secret",
  "token",
  "apikey",
  "api_key",
]);

export function isJsonManagedSourceType(
  type: ManagedSource["type"] | string | undefined,
): type is "json_file" | "json_http" {
  return type === "json_file" || type === "json_http";
}

export function normalizeManagedSource(value: unknown): ManagedSource | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.filePath !== "string" || !record.filePath.trim()) return null;
  if (typeof record.groupName !== "string" || !record.groupName.trim()) return null;
  const type = record.type === "json_file" || record.type === "json_http" || record.type === "ssh_config"
    ? record.type
    : null;
  if (!type) return null;
  return {
    id: record.id,
    type,
    filePath: record.filePath.trim(),
    groupName: record.groupName.trim().replace(/\\/g, "/"),
    lastSyncedAt: Number.isFinite(Number(record.lastSyncedAt)) ? Number(record.lastSyncedAt) : 0,
    lastFileHash: typeof record.lastFileHash === "string" ? record.lastFileHash : undefined,
    label: typeof record.label === "string" && record.label.trim()
      ? record.label.trim().slice(0, 120)
      : undefined,
    syncMode: record.syncMode === "replace_group" ? "replace_group" : "merge",
    enabled: record.enabled === false ? false : true,
    autoSyncIntervalMs: normalizeAutoSyncIntervalMs(record.autoSyncIntervalMs),
    lastSyncStatus: normalizeLastSyncStatus(record.lastSyncStatus),
    lastSyncError: normalizeLastSyncError(record.lastSyncError),
    httpAuthHeaderName: normalizeHttpAuthHeaderName(record.httpAuthHeaderName),
    httpAuthHeaderValue: normalizeHttpAuthHeaderValue(record.httpAuthHeaderValue),
  };
}

/** Allowed custom header names for HTTP inventory pulls (case-insensitive). */
const ALLOWED_HTTP_AUTH_HEADER_NAMES = new Set([
  "authorization",
  "x-api-key",
  "x-auth-token",
  "x-access-token",
]);

export function normalizeHttpAuthHeaderName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (!name) return undefined;
  if (!/^[A-Za-z0-9-]+$/.test(name)) return undefined;
  if (!ALLOWED_HTTP_AUTH_HEADER_NAMES.has(name.toLowerCase())) return undefined;
  // Preserve common casing for Authorization
  if (name.toLowerCase() === "authorization") return "Authorization";
  return name;
}

export function normalizeHttpAuthHeaderValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Cap length; never allow newlines (header injection).
  if (/[\r\n]/.test(trimmed)) return undefined;
  return trimmed.slice(0, 2000);
}

export function buildHttpInventoryHeaders(
  source: Pick<ManagedSource, "httpAuthHeaderName" | "httpAuthHeaderValue">,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, text/*, application/yaml, */*",
  };
  const name = normalizeHttpAuthHeaderName(source.httpAuthHeaderName);
  const value = normalizeHttpAuthHeaderValue(source.httpAuthHeaderValue);
  if (name && value) {
    headers[name] = value;
  }
  return headers;
}

export function normalizeLastSyncStatus(
  value: unknown,
): ManagedSource["lastSyncStatus"] | undefined {
  if (value === "ok" || value === "unchanged" || value === "error") return value;
  return undefined;
}

export function normalizeLastSyncError(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 400);
}

/** Apply last-sync outcome onto a managed source record (immutable). */
export function withHostDataSourceSyncOutcome(
  source: ManagedSource,
  outcome: {
    success: boolean;
    unchanged?: boolean;
    error?: string;
    now?: number;
    contentHash?: string;
  },
): ManagedSource {
  const now = outcome.now ?? Date.now();
  if (!outcome.success) {
    return {
      ...source,
      lastSyncedAt: now,
      lastSyncStatus: "error",
      lastSyncError: normalizeLastSyncError(outcome.error) || "Sync failed.",
    };
  }
  if (outcome.unchanged) {
    return {
      ...source,
      lastSyncedAt: now,
      lastSyncStatus: "unchanged",
      lastSyncError: undefined,
    };
  }
  return {
    ...source,
    lastSyncedAt: now,
    lastFileHash: outcome.contentHash ?? source.lastFileHash,
    lastSyncStatus: "ok",
    lastSyncError: undefined,
  };
}

/** Preset intervals offered in the data-sources UI (0 = off). */
export const HOST_DATA_SOURCE_AUTO_SYNC_PRESETS_MS = [
  0,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
] as const;

const MIN_AUTO_SYNC_INTERVAL_MS = 60_000;
const MAX_AUTO_SYNC_INTERVAL_MS = 24 * 60 * 60_000;

/**
 * Normalize auto-sync interval. 0 / invalid → undefined (manual only).
 * Non-zero values clamped to [1m, 24h].
 */
export function normalizeAutoSyncIntervalMs(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "" || value === false) {
    return undefined;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const ms = Math.trunc(n);
  if (ms < MIN_AUTO_SYNC_INTERVAL_MS) return MIN_AUTO_SYNC_INTERVAL_MS;
  if (ms > MAX_AUTO_SYNC_INTERVAL_MS) return MAX_AUTO_SYNC_INTERVAL_MS;
  return ms;
}

export function isHostDataSourceDueForAutoSync(
  source: Pick<ManagedSource, "type" | "enabled" | "lastSyncedAt" | "autoSyncIntervalMs">,
  now = Date.now(),
): boolean {
  if (!isJsonManagedSourceType(source.type)) return false;
  if (source.enabled === false) return false;
  const interval = normalizeAutoSyncIntervalMs(source.autoSyncIntervalMs);
  if (!interval) return false;
  const last = Number.isFinite(source.lastSyncedAt) ? source.lastSyncedAt : 0;
  return now - last >= interval;
}

export function listDueHostDataSources(
  sources: ManagedSource[],
  now = Date.now(),
): ManagedSource[] {
  return sources.filter((source) => isHostDataSourceDueForAutoSync(source, now));
}

/**
 * Auto-detect inventory format: MagiesTerminal JSON, Ansible INI, or Ansible YAML.
 * Rejects payloads that embed secrets.
 */
export function parseInventoryDocument(raw: string): HostInventoryDocument {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new Error("Inventory is empty.");
  }
  if (text.startsWith("{")) {
    return parseHostInventoryDocument(text);
  }
  if (looksLikeAnsibleInventoryIni(text)) {
    const parsed = parseAnsibleInventoryIni(text);
    return { version: parsed.version, hosts: parsed.hosts };
  }
  if (looksLikeAnsibleInventoryYaml(text)) {
    const parsed = parseAnsibleInventoryYaml(text);
    return { version: parsed.version, hosts: parsed.hosts };
  }
  // Fallbacks: try JSON, then INI, then YAML with combined error.
  const errors: string[] = [];
  try {
    return parseHostInventoryDocument(text);
  } catch (err) {
    errors.push(`JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const parsed = parseAnsibleInventoryIni(text);
    return { version: parsed.version, hosts: parsed.hosts };
  } catch (err) {
    errors.push(`Ansible INI: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    const parsed = parseAnsibleInventoryYaml(text);
    return { version: parsed.version, hosts: parsed.hosts };
  } catch (err) {
    errors.push(`Ansible YAML: ${err instanceof Error ? err.message : String(err)}`);
  }
  throw new Error(`Unrecognized inventory format. ${errors.join("; ")}`);
}

/**
 * Parse inventory JSON. Rejects payloads that embed secrets.
 */
export function parseHostInventoryDocument(raw: string): HostInventoryDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON inventory.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Inventory root must be an object.");
  }
  const root = parsed as Record<string, unknown>;
  assertNoSecrets(root, "root");

  const version = Number(root.version);
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("Inventory version must be a positive number.");
  }

  const hostsRaw = root.hosts;
  if (!Array.isArray(hostsRaw)) {
    throw new Error("Inventory must include a hosts array.");
  }

  const hosts: HostInventoryItem[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < hostsRaw.length; index += 1) {
    const item = hostsRaw[index];
    assertNoSecrets(item, `hosts[${index}]`);
    const normalized = normalizeInventoryItem(item, index);
    if (seen.has(normalized.id)) {
      throw new Error(`Duplicate inventory host id: ${normalized.id}`);
    }
    seen.add(normalized.id);
    hosts.push(normalized);
  }

  return { version, hosts };
}

function assertNoSecrets(value: unknown, path: string): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecrets(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_SECRET_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `Inventory must not include secrets (${path}.${key}). Use Keychain identities in MagiesTerminal.`,
      );
    }
    if (child && typeof child === "object") {
      assertNoSecrets(child, `${path}.${key}`);
    }
  }
}

function normalizeInventoryItem(value: unknown, index: number): HostInventoryItem {
  if (!value || typeof value !== "object") {
    throw new Error(`hosts[${index}] must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : (typeof record.externalId === "string" && record.externalId.trim()
      ? record.externalId.trim()
      : "");
  if (!id) {
    throw new Error(`hosts[${index}].id is required (stable external id).`);
  }
  const hostname = typeof record.hostname === "string" ? record.hostname.trim() : "";
  if (!hostname) {
    throw new Error(`hosts[${index}].hostname is required.`);
  }
  const label = typeof record.label === "string" && record.label.trim()
    ? record.label.trim()
    : hostname;
  const portRaw = record.port;
  let port: number | undefined;
  if (typeof portRaw === "number" && Number.isFinite(portRaw)) {
    port = Math.trunc(portRaw);
  } else if (typeof portRaw === "string" && portRaw.trim()) {
    port = parseInt(portRaw.trim(), 10);
  }
  if (port !== undefined && (port < 1 || port > 65535 || !Number.isFinite(port))) {
    throw new Error(`hosts[${index}].port is invalid.`);
  }

  const protocolRaw = typeof record.protocol === "string" ? record.protocol.trim().toLowerCase() : "ssh";
  const protocol: HostInventoryProtocol =
    protocolRaw === "telnet" ? "telnet" : "ssh";

  const osRaw = typeof record.os === "string" ? record.os.trim().toLowerCase() : "linux";
  const os: Host["os"] =
    osRaw === "windows" || osRaw === "macos" ? osRaw : "linux";

  const deviceType = record.deviceType === "network" ? "network" : "general";
  const authMethod = record.authMethod === "password"
    || record.authMethod === "key"
    || record.authMethod === "certificate"
    || record.authMethod === "agent"
    ? record.authMethod
    : undefined;

  const tags = Array.isArray(record.tags)
    ? Array.from(new Set(record.tags.map((tag) => String(tag).trim()).filter(Boolean)))
    : [];

  const group = typeof record.group === "string"
    ? record.group.trim().replace(/\\/g, "/")
    : undefined;

  return {
    id,
    label: label.slice(0, 120),
    hostname,
    port,
    username: typeof record.username === "string" ? record.username.trim() : undefined,
    group: group || undefined,
    tags,
    protocol,
    os,
    deviceType,
    authMethod,
    identityHint: typeof record.identityHint === "string" && record.identityHint.trim()
      ? record.identityHint.trim().slice(0, 200)
      : undefined,
  };
}

export function hashInventoryContent(content: string): string {
  // FNV-1a 32-bit — good enough for change detection, not crypto.
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Apply inventory to vault hosts for one managed JSON source.
 */
export function syncHostsFromInventory(input: {
  existingHosts: Host[];
  customGroups: string[];
  inventory: HostInventoryDocument;
  source: Pick<ManagedSource, "id" | "groupName" | "syncMode">;
  now?: number;
}): HostDataSourceSyncResult {
  const now = input.now ?? Date.now();
  const sourceId = input.source.id;
  const baseGroup = input.source.groupName.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const mode: HostDataSourceSyncMode = input.source.syncMode === "replace_group"
    ? "replace_group"
    : "merge";

  const managedExisting = input.existingHosts.filter((host) => host.managedSourceId === sourceId);
  const unmanaged = input.existingHosts.filter((host) => host.managedSourceId !== sourceId);
  const byExternalId = new Map(
    managedExisting
      .filter((host) => host.managedExternalId)
      .map((host) => [host.managedExternalId as string, host]),
  );

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const nextManaged: Host[] = [];
  const seenExternal = new Set<string>();
  let orderSeed = getNextVaultOrder(input.existingHosts);

  for (const item of input.inventory.hosts) {
    seenExternal.add(item.id);
    const groupPath = joinGroupPath(baseGroup, item.group);
    const existing = byExternalId.get(item.id);
    if (existing) {
      const patched = sanitizeHost({
        ...existing,
        label: item.label,
        hostname: item.hostname,
        port: item.port ?? existing.port ?? 22,
        username: item.username ?? existing.username ?? "",
        group: groupPath,
        tags: item.tags?.length ? item.tags : (existing.tags || []),
        protocol: item.protocol || existing.protocol || "ssh",
        os: item.os || existing.os || "linux",
        deviceType: item.deviceType || existing.deviceType || "general",
        authMethod: item.authMethod || existing.authMethod,
        managedSourceId: sourceId,
        managedExternalId: item.id,
        // Never pull secrets from inventory.
        password: existing.password,
        savePassword: existing.savePassword,
      });
      nextManaged.push(patched);
      updated += 1;
      continue;
    }

    // Skip inventing a host that collides with an unmanaged vault host of same endpoint.
    const collision = unmanaged.some((host) =>
      host.hostname === item.hostname
      && (host.username || "") === (item.username || "")
      && (host.port || 22) === (item.port || 22)
      && (host.protocol || "ssh") === (item.protocol || "ssh"),
    );
    if (collision) {
      skipped += 1;
      continue;
    }

    const created = sanitizeHost({
      id: `host-ds-${sourceId.slice(0, 8)}-${item.id}`.replace(/[^a-zA-Z0-9._:-]/g, "-"),
      label: item.label,
      hostname: item.hostname,
      port: item.port || 22,
      username: item.username || "",
      group: groupPath,
      tags: item.tags || [],
      protocol: item.protocol || "ssh",
      os: item.os || "linux",
      deviceType: item.deviceType || "general",
      authMethod: item.authMethod,
      managedSourceId: sourceId,
      managedExternalId: item.id,
      createdAt: now,
      order: orderSeed,
    });
    orderSeed += 1;
    nextManaged.push(created);
    added += 1;
  }

  let removed = 0;
  if (mode === "merge" || mode === "replace_group") {
    // Both modes drop managed hosts missing from inventory (replace_group is explicit;
    // merge also removes orphans so CMDB deletions propagate).
    removed = managedExisting.filter((host) => {
      if (!host.managedExternalId) return true;
      return !seenExternal.has(host.managedExternalId);
    }).length;
  }

  const hosts = sanitizeHostList([...unmanaged, ...nextManaged]);
  const customGroups = Array.from(new Set([
    ...input.customGroups,
    baseGroup,
    ...nextManaged.map((host) => host.group).filter((group): group is string => Boolean(group)),
  ]));

  return {
    hosts,
    customGroups,
    stats: {
      added,
      updated,
      removed,
      skipped,
      totalInventory: input.inventory.hosts.length,
    },
    contentHash: "",
  };
}

function joinGroupPath(base: string, nested?: string): string {
  const nestedParts = (nested || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!base) return nestedParts.join("/");
  if (nestedParts.length === 0) return base;
  // If inventory already prefixes with base, don't double it.
  const nestedPath = nestedParts.join("/");
  if (nestedPath === base || nestedPath.startsWith(`${base}/`)) return nestedPath;
  return `${base}/${nestedPath}`;
}

function sanitizeHostList(hosts: Host[]): Host[] {
  return hosts.map((host) => sanitizeHost(host));
}

export function createJsonManagedSource(input: {
  type: "json_file" | "json_http";
  filePath: string;
  groupName: string;
  label?: string;
  syncMode?: HostDataSourceSyncMode;
  autoSyncIntervalMs?: number;
  httpAuthHeaderName?: string;
  httpAuthHeaderValue?: string;
  id?: string;
  now?: number;
}): ManagedSource {
  const now = input.now ?? Date.now();
  return {
    id: input.id || `mds-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    filePath: input.filePath.trim(),
    groupName: input.groupName.trim().replace(/\\/g, "/"),
    lastSyncedAt: 0,
    label: input.label?.trim() || undefined,
    syncMode: input.syncMode === "replace_group" ? "replace_group" : "merge",
    enabled: true,
    autoSyncIntervalMs: normalizeAutoSyncIntervalMs(input.autoSyncIntervalMs),
    httpAuthHeaderName: input.type === "json_http"
      ? normalizeHttpAuthHeaderName(input.httpAuthHeaderName)
      : undefined,
    httpAuthHeaderValue: input.type === "json_http"
      ? normalizeHttpAuthHeaderValue(input.httpAuthHeaderValue)
      : undefined,
  };
}

export function isHttpInventoryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Map a vault host to a shareable inventory item.
 * Never includes passwords, private keys, identityIds, or other secrets.
 * Returns null for hosts that cannot be represented (e.g. serial).
 */
export function hostToInventoryItem(host: Host): HostInventoryItem | null {
  const protocol = host.protocol === "telnet"
    ? "telnet"
    : (!host.protocol || host.protocol === "ssh" || host.protocol === "mosh" || host.protocol === "et")
      ? "ssh"
      : null;
  if (!protocol) return null;

  const hostname = (host.hostname || "").trim();
  if (!hostname) return null;

  const isTelnet = protocol === "telnet";
  const port = isTelnet
    ? (host.telnetPort ?? host.port ?? 23)
    : (host.port ?? 22);
  const username = isTelnet
    ? (host.telnetUsername ?? host.username ?? "")
    : (host.username ?? "");

  const id = (host.managedExternalId || host.id || "").trim();
  if (!id) return null;

  const label = (host.label || hostname).trim().slice(0, 120) || hostname;
  const tags = Array.isArray(host.tags)
    ? Array.from(new Set(host.tags.map((tag) => String(tag).trim()).filter(Boolean)))
    : [];
  const group = typeof host.group === "string" && host.group.trim()
    ? host.group.trim().replace(/\\/g, "/")
    : undefined;

  const authMethod = host.authMethod === "password"
    || host.authMethod === "key"
    || host.authMethod === "certificate"
    || host.authMethod === "agent"
    ? host.authMethod
    : undefined;

  const os = host.os === "windows" || host.os === "macos" || host.os === "linux"
    ? host.os
    : undefined;
  const deviceType = host.deviceType === "network" ? "network" : "general";

  return {
    id,
    label,
    hostname,
    port: port >= 1 && port <= 65535 ? port : undefined,
    username: username || undefined,
    group,
    tags: tags.length ? tags : undefined,
    protocol,
    os,
    deviceType,
    authMethod,
    // notes / identityId / password / keys intentionally omitted — local only
  };
}

/**
 * Build a team-safe inventory JSON package from vault hosts.
 * Opt-in share path: metadata only, credentials stay local.
 */
export function exportHostsToInventoryDocument(
  hosts: Host[],
  options?: {
    hostIds?: Iterable<string>;
    now?: number;
    pretty?: boolean;
    source?: string;
  },
): HostInventoryExportResult {
  const idFilter = options?.hostIds
    ? new Set(Array.from(options.hostIds))
    : null;
  const selected = idFilter
    ? hosts.filter((host) => idFilter.has(host.id))
    : hosts;

  const items: HostInventoryItem[] = [];
  let skippedCount = 0;
  const seen = new Set<string>();

  for (const host of selected) {
    const item = hostToInventoryItem(host);
    if (!item) {
      skippedCount += 1;
      continue;
    }
    // Dedupe by external id so share packages stay valid for re-import.
    if (seen.has(item.id)) {
      skippedCount += 1;
      continue;
    }
    seen.add(item.id);
    items.push(item);
  }

  const document: HostInventoryShareDocument = {
    version: 1,
    exportedAt: options?.now ?? Date.now(),
    source: options?.source || "magies-terminal",
    hosts: items,
  };

  // Defense in depth: re-parse to guarantee no secrets slipped in.
  const pretty = options?.pretty !== false;
  const json = pretty
    ? `${JSON.stringify(document, null, 2)}\n`
    : JSON.stringify(document);
  parseHostInventoryDocument(json);

  return {
    document,
    json,
    exportedCount: items.length,
    skippedCount,
  };
}

export type HostAnsibleInventoryExportResult = {
  ini: string;
  exportedCount: number;
  skippedCount: number;
};

/**
 * Team-safe Ansible INI share package (same host selection as JSON inventory).
 * Metadata only — credentials stay local.
 */
export function exportHostsToAnsibleInventoryIni(
  hosts: Host[],
  options?: {
    hostIds?: Iterable<string>;
    headerComment?: string;
  },
): HostAnsibleInventoryExportResult {
  const base = exportHostsToInventoryDocument(hosts, {
    hostIds: options?.hostIds,
    pretty: false,
  });
  // Drop telnet from Ansible INI export (SSH-oriented inventory).
  const sshItems = base.document.hosts.filter((item) => item.protocol !== "telnet");
  const skippedTelnet = base.document.hosts.length - sshItems.length;
  const ini = inventoryItemsToAnsibleIni(sshItems, {
    headerComment: options?.headerComment,
  });
  // Round-trip guard: exported INI must parse without secrets.
  parseAnsibleInventoryIni(ini);
  return {
    ini,
    exportedCount: sshItems.length,
    skippedCount: base.skippedCount + skippedTelnet,
  };
}

/** True if a plain object tree contains any forbidden secret keys. */
export function inventoryContainsSecrets(value: unknown): boolean {
  try {
    assertNoSecrets(value, "root");
    return false;
  } catch {
    return true;
  }
}
