/**
 * Parse Ansible-style YAML inventory into MagiesTerminal host inventory items.
 * Uses the `yaml` package for document parsing; host/group extraction is domain logic.
 * Secrets (ansible_password, etc.) are rejected — same policy as INI inventory.
 */

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import type { HostInventoryDocument, HostInventoryItem } from "./hostDataSource";

const SECRET_VAR_KEYS = new Set([
  "ansible_password",
  "ansible_ssh_pass",
  "ansible_ssh_password",
  "ansible_become_pass",
  "ansible_become_password",
  "ansible_sudo_pass",
  "ansible_su_pass",
  "vault_password",
  "password",
  "passphrase",
  "private_key",
  "privatekey",
  "secret",
  "token",
  "api_key",
  "apikey",
]);

/**
 * Heuristic: looks like YAML inventory (not JSON, not INI section headers only).
 */
export function looksLikeAnsibleInventoryYaml(raw: string): boolean {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text || text.startsWith("{") || text.startsWith("[")) return false;
  // Typical YAML inventory markers
  if (/^---\s*$/m.test(text)) return true;
  if (/^\s*all\s*:\s*$/m.test(text) && /^\s*hosts\s*:\s*$/m.test(text)) return true;
  if (/^\s*hosts\s*:\s*$/m.test(text) && /ansible_(?:host|user|port)\s*:/.test(text)) return true;
  if (/^\s*\w[\w.-]*\s*:\s*$/m.test(text) && /ansible_host\s*:/.test(text)) return true;
  return false;
}

export type AnsibleYamlParseResult = HostInventoryDocument & {
  skippedLocal: number;
};

/**
 * Parse Ansible inventory YAML into HostInventoryDocument.
 */
export function parseAnsibleInventoryYaml(raw: string): AnsibleYamlParseResult {
  let doc: unknown;
  try {
    doc = parseYaml(raw, { uniqueKeys: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid Ansible inventory YAML: ${message}`);
  }

  if (doc === null || doc === undefined) {
    throw new Error("Ansible inventory YAML is empty.");
  }
  if (typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("Ansible inventory YAML root must be a mapping.");
  }

  assertNoSecretsDeep(doc, "root");

  const hostVars = new Map<string, Record<string, unknown>>();
  const hostGroups = new Map<string, Set<string>>();

  const root = doc as Record<string, unknown>;

  // Style A: top-level group map (all / web / …)
  for (const [groupName, groupBody] of Object.entries(root)) {
    if (groupName === "plugin" || groupName === "compose") continue;
    collectGroup(groupName, groupBody, hostVars, hostGroups, []);
  }

  // If nothing collected, try treating root as a single hosts map
  if (hostVars.size === 0 && isPlainObject(root.hosts)) {
    collectHostsMap(root.hosts as Record<string, unknown>, hostVars, hostGroups, ["ungrouped"]);
  }

  if (hostVars.size === 0) {
    throw new Error("Ansible inventory YAML did not contain any hosts.");
  }

  const hosts: HostInventoryItem[] = [];
  let skippedLocal = 0;
  for (const [alias, vars] of hostVars) {
    const item = hostVarsToItem(alias, vars, hostGroups.get(alias));
    if (!item) {
      skippedLocal += 1;
      continue;
    }
    hosts.push(item);
  }

  if (hosts.length === 0) {
    throw new Error("Ansible inventory YAML hosts were all skipped (local/unsupported).");
  }

  return { version: 1, hosts, skippedLocal };
}

function collectGroup(
  groupName: string,
  groupBody: unknown,
  hostVars: Map<string, Record<string, unknown>>,
  hostGroups: Map<string, Set<string>>,
  parentPath: string[],
): void {
  if (!isPlainObject(groupBody)) return;
  const body = groupBody as Record<string, unknown>;
  const path = groupName === "all" ? parentPath : [...parentPath, groupName];

  if (isPlainObject(body.hosts)) {
    collectHostsMap(body.hosts as Record<string, unknown>, hostVars, hostGroups, path);
  }

  // Inline host list under group (rare): group: [host1, host2]
  if (Array.isArray(body.hosts)) {
    for (const entry of body.hosts) {
      if (typeof entry === "string" && entry.trim()) {
        mergeHost(entry.trim(), {}, hostVars, hostGroups, path);
      }
    }
  }

  if (isPlainObject(body.children)) {
    for (const [childName, childBody] of Object.entries(body.children as Record<string, unknown>)) {
      collectGroup(childName, childBody, hostVars, hostGroups, path);
    }
  }

  // vars at group level apply as defaults to hosts already listed? Apply when merging hosts only.
  // Store group vars for later merge when we only have alias under children with empty body.
  if (isPlainObject(body.vars)) {
    assertNoSecretsDeep(body.vars, `group ${groupName}.vars`);
    // Apply as soft defaults to hosts already in this group path
    for (const [alias, groups] of hostGroups) {
      if ([...groups].some((g) => g === groupName || path.includes(g))) {
        const existing = hostVars.get(alias) || {};
        hostVars.set(alias, { ...(body.vars as object), ...existing });
      }
    }
  }
}

function collectHostsMap(
  hostsMap: Record<string, unknown>,
  hostVars: Map<string, Record<string, unknown>>,
  hostGroups: Map<string, Set<string>>,
  groupPath: string[],
): void {
  for (const [aliasRaw, value] of Object.entries(hostsMap)) {
    const alias = aliasRaw.trim();
    if (!alias) continue;
    let vars: Record<string, unknown> = {};
    if (value === null || value === undefined) {
      vars = {};
    } else if (isPlainObject(value)) {
      vars = value as Record<string, unknown>;
      assertNoSecretsDeep(vars, `host ${alias}`);
    } else if (typeof value === "string" || typeof value === "number") {
      // host: 10.0.0.1 shorthand → ansible_host
      vars = { ansible_host: String(value) };
    } else {
      continue;
    }
    mergeHost(alias, vars, hostVars, hostGroups, groupPath);
  }
}

function mergeHost(
  alias: string,
  vars: Record<string, unknown>,
  hostVars: Map<string, Record<string, unknown>>,
  hostGroups: Map<string, Set<string>>,
  groupPath: string[],
): void {
  const existing = hostVars.get(alias) || {};
  hostVars.set(alias, { ...existing, ...vars });
  const groups = hostGroups.get(alias) || new Set<string>();
  for (const g of groupPath) {
    if (g && g !== "all") groups.add(g);
  }
  if (groups.size === 0) groups.add("ungrouped");
  hostGroups.set(alias, groups);
}

function hostVarsToItem(
  alias: string,
  vars: Record<string, unknown>,
  groups?: Set<string>,
): HostInventoryItem | null {
  const connection = String(vars.ansible_connection ?? "").toLowerCase();
  if (connection === "local" || connection === "docker") return null;

  const hostname = String(
    vars.ansible_host ?? vars.ansible_ssh_host ?? alias,
  ).trim();
  if (!hostname) return null;
  if (
    (hostname === "localhost" || hostname === "127.0.0.1")
    && connection === "local"
  ) {
    return null;
  }

  let port: number | undefined;
  const portRaw = vars.ansible_port ?? vars.ansible_ssh_port;
  if (portRaw !== undefined && portRaw !== null && String(portRaw).trim() !== "") {
    port = parseInt(String(portRaw), 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid ansible_port for host ${alias}: ${portRaw}`);
    }
  }

  const username = String(vars.ansible_user ?? vars.ansible_ssh_user ?? "").trim() || undefined;
  const identityHint = String(
    vars.ansible_ssh_private_key_file ?? vars.ansible_private_key_file ?? "",
  ).trim() || undefined;

  const groupList = [...(groups || [])].filter((g) => g !== "all" && g !== "ungrouped").sort();
  const group = groupList.length > 0 ? groupList[groupList.length - 1] : undefined;
  const tags = groupList.filter((g) => g !== group);

  const id = alias.replace(/[^a-zA-Z0-9._@:+-]/g, "-").slice(0, 180) || "host";

  return {
    id,
    label: alias,
    hostname,
    port,
    username,
    group,
    tags: tags.length ? tags : undefined,
    protocol: "ssh",
    authMethod: identityHint ? "key" : undefined,
    identityHint,
  };
}

function assertNoSecretsDeep(value: unknown, path: string): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, i) => assertNoSecretsDeep(entry, `${path}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_VAR_KEYS.has(key.toLowerCase())) {
      throw new Error(
        `Inventory must not include secrets (${path}.${key}). Use Keychain identities in MagiesTerminal.`,
      );
    }
    if (child && typeof child === "object") {
      assertNoSecretsDeep(child, `${path}.${key}`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Serialize inventory items to Ansible-style YAML (metadata only).
 */
export function inventoryItemsToAnsibleYaml(
  items: HostInventoryItem[],
  options?: { headerComment?: string },
): string {
  const byGroup = new Map<string, HostInventoryItem[]>();
  for (const item of items) {
    if (item.protocol === "telnet") continue;
    const group = (item.group || "ungrouped")
      .replace(/\\/g, "/")
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .join("_")
      .replace(/[^a-zA-Z0-9._:-]/g, "_") || "ungrouped";
    const list = byGroup.get(group) || [];
    list.push(item);
    byGroup.set(group, list);
  }

  const children: Record<string, { hosts: Record<string, Record<string, string | number>> }> = {};
  for (const [group, hosts] of byGroup) {
    const hostsMap: Record<string, Record<string, string | number>> = {};
    for (const item of hosts) {
      const alias = (item.label && !/\s/.test(item.label) ? item.label : item.id)
        .replace(/[^a-zA-Z0-9._@:+-]/g, "-")
        .slice(0, 180) || "host";
      const vars: Record<string, string | number> = {};
      if (item.hostname && item.hostname !== alias) vars.ansible_host = item.hostname;
      if (item.username) vars.ansible_user = item.username;
      if (item.port && item.port !== 22) vars.ansible_port = item.port;
      if (item.identityHint) vars.ansible_ssh_private_key_file = item.identityHint;
      hostsMap[alias] = vars;
    }
    children[group] = { hosts: hostsMap };
  }

  const doc = {
    all: {
      children,
    },
  };

  const header = (options?.headerComment
    || "Exported by MagiesTerminal (metadata only; no secrets)\nRe-import via Vault → Data Sources.")
    .split(/\r?\n/)
    .map((line) => (line.startsWith("#") ? line : `# ${line}`))
    .join("\n");

  const body = stringifyYaml(doc, {
    indent: 2,
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
  });
  return `${header}\n${body}`;
}
