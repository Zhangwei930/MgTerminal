/**
 * Parse classic Ansible inventory INI into MagiesTerminal host inventory items.
 * Metadata only — secrets (passwords, private key material) are rejected.
 * Host ranges like host[01:10] are skipped (not expanded).
 */

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

const META_SUFFIX = /:(children|vars)$/i;

export type AnsibleInventoryParseResult = HostInventoryDocument & {
  skippedHostRanges: number;
  skippedLocal: number;
};

type HostEntry = {
  alias: string;
  vars: Record<string, string>;
  /** Groups this host was listed under (direct). */
  listedGroups: string[];
};

/**
 * True when text looks like Ansible INI inventory rather than JSON.
 */
export function looksLikeAnsibleInventoryIni(raw: string): boolean {
  const text = raw.trim();
  if (!text || text.startsWith("{") || text.startsWith("[")) {
    // Leading "[" is common for both; look for group headers + host lines.
  }
  if (text.startsWith("{") || text.startsWith("[")) {
    // JSON arrays/objects start with { or [; ansible always has [group] headers eventually.
    // Prefer JSON when first non-ws is { .
    if (text.startsWith("{")) return false;
  }
  // At least one [section] and no top-level JSON "version"/"hosts" keys as object start.
  if (text.startsWith("{")) return false;
  return /(?:^|\n)\s*\[[^\]]+\]\s*(?:#.*)?$/m.test(text)
    || /(?:^|\n)\s*\S+\s+ansible_(?:host|port|user|connection)\s*=/m.test(text);
}

/**
 * Parse Ansible inventory INI text into a HostInventoryDocument (version 1).
 */
export function parseAnsibleInventoryIni(raw: string): AnsibleInventoryParseResult {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const hostGroups = new Map<string, HostEntry[]>();
  const childrenOf = new Map<string, string[]>();
  const groupVars = new Map<string, Record<string, string>>();
  let currentSection: { kind: "hosts" | "children" | "vars"; name: string } | null = null;
  let skippedHostRanges = 0;
  let skippedLocal = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const rawLine = lines[lineIndex] ?? "";
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    const header = line.match(/^\[([^\]]+)\]$/);
    if (header) {
      const sectionName = header[1].trim();
      if (!sectionName) {
        throw new Error(`Invalid empty inventory section at line ${lineIndex + 1}.`);
      }
      const meta = sectionName.match(META_SUFFIX);
      if (meta) {
        const base = sectionName.slice(0, -meta[0].length).trim();
        if (!base) {
          throw new Error(`Invalid inventory section "[${sectionName}]" at line ${lineIndex + 1}.`);
        }
        const kind = meta[1].toLowerCase() === "children" ? "children" : "vars";
        currentSection = { kind, name: base };
        if (kind === "children" && !childrenOf.has(base)) childrenOf.set(base, []);
        if (kind === "vars" && !groupVars.has(base)) groupVars.set(base, {});
      } else {
        currentSection = { kind: "hosts", name: sectionName };
        if (!hostGroups.has(sectionName)) hostGroups.set(sectionName, []);
      }
      continue;
    }

    if (!currentSection) {
      // Ungrouped hosts go under "ungrouped" (Ansible convention).
      currentSection = { kind: "hosts", name: "ungrouped" };
      if (!hostGroups.has("ungrouped")) hostGroups.set("ungrouped", []);
    }

    if (currentSection.kind === "children") {
      const child = line.split(/\s+/)[0];
      if (!child) continue;
      const list = childrenOf.get(currentSection.name) || [];
      if (!list.includes(child)) list.push(child);
      childrenOf.set(currentSection.name, list);
      continue;
    }

    if (currentSection.kind === "vars") {
      const pair = parseVarAssignment(line);
      if (!pair) {
        throw new Error(`Invalid group var at line ${lineIndex + 1}: ${line}`);
      }
      assertSafeVarKey(pair.key, `group ${currentSection.name}`);
      const vars = groupVars.get(currentSection.name) || {};
      vars[pair.key] = pair.value;
      groupVars.set(currentSection.name, vars);
      continue;
    }

    // Host line
    if (looksLikeHostRange(line)) {
      skippedHostRanges += 1;
      continue;
    }

    const parsed = parseHostLine(line, lineIndex + 1);
    for (const [key] of Object.entries(parsed.vars)) {
      assertSafeVarKey(key, `host ${parsed.alias}`);
    }

    const list = hostGroups.get(currentSection.name) || [];
    const existing = list.find((entry) => entry.alias === parsed.alias);
    if (existing) {
      existing.vars = { ...existing.vars, ...parsed.vars };
      if (!existing.listedGroups.includes(currentSection.name)) {
        existing.listedGroups.push(currentSection.name);
      }
    } else {
      list.push({
        alias: parsed.alias,
        vars: parsed.vars,
        listedGroups: [currentSection.name],
      });
    }
    hostGroups.set(currentSection.name, list);
  }

  // Merge hosts that appear in multiple groups into one entry keyed by alias.
  const byAlias = new Map<string, HostEntry>();
  for (const [groupName, entries] of hostGroups) {
    for (const entry of entries) {
      const existing = byAlias.get(entry.alias);
      if (existing) {
        existing.vars = { ...existing.vars, ...entry.vars };
        for (const g of entry.listedGroups) {
          if (!existing.listedGroups.includes(g)) existing.listedGroups.push(g);
        }
      } else {
        byAlias.set(entry.alias, {
          alias: entry.alias,
          vars: { ...entry.vars },
          listedGroups: [...entry.listedGroups],
        });
      }
      // Ensure listedGroups includes the map key group
      const target = byAlias.get(entry.alias)!;
      if (!target.listedGroups.includes(groupName)) {
        target.listedGroups.push(groupName);
      }
    }
  }

  const hosts: HostInventoryItem[] = [];
  const seenIds = new Set<string>();

  for (const entry of byAlias.values()) {
    const membership = expandGroupMembership(entry.listedGroups, childrenOf);
    const mergedVars = mergeVarsForGroups(membership, groupVars, entry.vars);

    for (const [key] of Object.entries(mergedVars)) {
      assertSafeVarKey(key, `host ${entry.alias}`);
    }

    const connection = (mergedVars.ansible_connection || "").toLowerCase();
    if (connection === "local" || connection === "docker" || connection === "community.docker.docker") {
      skippedLocal += 1;
      continue;
    }

    const item = hostEntryToInventoryItem(entry.alias, mergedVars, membership);
    if (!item) {
      skippedLocal += 1;
      continue;
    }
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate inventory host id after parse: ${item.id}`);
    }
    seenIds.add(item.id);
    hosts.push(item);
  }

  if (hosts.length === 0 && skippedHostRanges === 0 && skippedLocal === 0) {
    throw new Error("Ansible inventory did not contain any hosts.");
  }

  return {
    version: 1,
    hosts,
    skippedHostRanges,
    skippedLocal,
  };
}

function stripInlineComment(line: string): string {
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === "#" || ch === ";") {
      return line.slice(0, i);
    }
  }
  return line;
}

function looksLikeHostRange(line: string): boolean {
  // host[01:50].example.com or db-[a:c]
  const token = line.split(/\s+/)[0] || "";
  return /\[[^\]]*:/.test(token);
}

function parseVarAssignment(line: string): { key: string; value: string } | null {
  const eq = line.indexOf("=");
  if (eq <= 0) return null;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (!key) return null;
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
    || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
}

function assertSafeVarKey(key: string, context: string): void {
  const normalized = key.trim().toLowerCase();
  if (SECRET_VAR_KEYS.has(normalized)) {
    throw new Error(
      `Inventory must not include secrets (${context}.${key}). Use Keychain identities in MagiesTerminal.`,
    );
  }
}

function parseHostLine(line: string, lineNo: number): { alias: string; vars: Record<string, string> } {
  const tokens = tokenizeHostLine(line);
  if (tokens.length === 0) {
    throw new Error(`Empty host line at line ${lineNo}.`);
  }

  const first = tokens[0];
  const vars: Record<string, string> = {};
  for (let i = 1; i < tokens.length; i += 1) {
    const pair = parseVarAssignment(tokens[i]);
    if (!pair) {
      throw new Error(`Invalid host variable at line ${lineNo}: ${tokens[i]}`);
    }
    vars[pair.key] = pair.value;
  }

  // Support user@host:port in the alias token when ansible_* vars not set.
  let alias = first;
  const atIdx = first.lastIndexOf("@");
  if (atIdx > 0 && !vars.ansible_user) {
    vars.ansible_user = first.slice(0, atIdx);
    alias = first.slice(atIdx + 1);
  }
  const colonIdx = alias.lastIndexOf(":");
  if (colonIdx > 0 && !vars.ansible_port && !vars.ansible_host) {
    const maybePort = alias.slice(colonIdx + 1);
    if (/^\d+$/.test(maybePort)) {
      vars.ansible_port = maybePort;
      alias = alias.slice(0, colonIdx);
    }
  }

  if (!alias) {
    throw new Error(`Invalid host alias at line ${lineNo}.`);
  }

  return { alias, vars };
}

function tokenizeHostLine(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

function expandGroupMembership(
  listed: string[],
  childrenOf: Map<string, string[]>,
): string[] {
  // Include parents that claim listed groups as children (transitive up).
  const membership = new Set(listed);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [parent, children] of childrenOf) {
      if (membership.has(parent)) continue;
      if (children.some((child) => membership.has(child))) {
        membership.add(parent);
        changed = true;
      }
    }
  }
  return Array.from(membership);
}

function mergeVarsForGroups(
  membership: string[],
  groupVars: Map<string, Record<string, string>>,
  hostVars: Record<string, string>,
): Record<string, string> {
  // Lower precedence first: all → parent groups → host vars last.
  const ordered = [...membership].sort((a, b) => {
    if (a === "all") return -1;
    if (b === "all") return 1;
    return a.localeCompare(b);
  });
  const merged: Record<string, string> = {};
  const allVars = groupVars.get("all");
  if (allVars) Object.assign(merged, allVars);
  for (const group of ordered) {
    if (group === "all") continue;
    const vars = groupVars.get(group);
    if (vars) Object.assign(merged, vars);
  }
  Object.assign(merged, hostVars);
  return merged;
}

function hostEntryToInventoryItem(
  alias: string,
  vars: Record<string, string>,
  membership: string[],
): HostInventoryItem | null {
  const hostname = (vars.ansible_host || vars.ansible_ssh_host || alias).trim();
  if (!hostname) return null;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    // Keep only if explicitly non-local connection and not pure local alias.
    const connection = (vars.ansible_connection || "ssh").toLowerCase();
    if (connection === "local") return null;
  }

  let port: number | undefined;
  const portRaw = vars.ansible_port || vars.ansible_ssh_port;
  if (portRaw) {
    port = parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid ansible_port for host ${alias}: ${portRaw}`);
    }
  }

  const username = (vars.ansible_user || vars.ansible_ssh_user || "").trim() || undefined;
  const groups = membership
    .filter((g) => g !== "all" && g !== "ungrouped")
    .sort((a, b) => a.localeCompare(b));
  // Prefer a leaf-ish group: longest name among listed, else first sorted.
  const group = groups.length > 0 ? (groups[groups.length - 1] || groups[0]) : undefined;

  const tags = groups.filter((g) => g !== group);
  const identityHint = (vars.ansible_ssh_private_key_file || vars.ansible_private_key_file || "").trim()
    || undefined;

  const id = sanitizeExternalId(alias);

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

function sanitizeExternalId(alias: string): string {
  const cleaned = alias.trim().replace(/[^a-zA-Z0-9._@:+-]/g, "-");
  return cleaned.slice(0, 180) || "host";
}

/**
 * Serialize inventory items to classic Ansible INI (metadata only).
 * Never writes passwords or private key material — identityHint may become
 * ansible_ssh_private_key_file path only.
 */
export function inventoryItemsToAnsibleIni(
  items: HostInventoryItem[],
  options?: { headerComment?: string },
): string {
  const byGroup = new Map<string, HostInventoryItem[]>();
  for (const item of items) {
    if (item.protocol === "telnet") {
      // Ansible inventory here is SSH-oriented; skip telnet for clean re-import.
      continue;
    }
    const group = ansibleGroupName(item.group);
    const list = byGroup.get(group) || [];
    list.push(item);
    byGroup.set(group, list);
  }

  const lines: string[] = [];
  const header = (options?.headerComment || "Exported by MagiesTerminal (metadata only; no secrets)")
    .split(/\r?\n/)
    .map((line) => (line.startsWith("#") ? line : `# ${line}`));
  lines.push(...header);
  lines.push("# Re-import via Vault → Data Sources (JSON or Ansible INI).");
  lines.push("");

  const groupNames = Array.from(byGroup.keys()).sort((a, b) => {
    if (a === "ungrouped") return -1;
    if (b === "ungrouped") return 1;
    return a.localeCompare(b);
  });

  for (const group of groupNames) {
    lines.push(`[${group}]`);
    const hosts = byGroup.get(group) || [];
    const seenAlias = new Set<string>();
    for (const item of hosts) {
      const alias = ansibleHostAlias(item);
      if (seenAlias.has(alias)) continue;
      seenAlias.add(alias);
      lines.push(formatAnsibleHostLine(alias, item));
    }
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function ansibleGroupName(group?: string): string {
  const cleaned = (group || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("_")
    .replace(/[^a-zA-Z0-9._:-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "ungrouped";
}

function ansibleHostAlias(item: HostInventoryItem): string {
  const candidates = [item.label, item.id, item.hostname];
  for (const raw of candidates) {
    const token = (raw || "").trim();
    if (!token) continue;
    // Alias must be a single INI token (no spaces).
    if (/\s/.test(token)) continue;
    return sanitizeExternalId(token);
  }
  return "host";
}

function formatAnsibleHostLine(alias: string, item: HostInventoryItem): string {
  const parts: string[] = [alias];
  if (item.hostname && item.hostname !== alias) {
    parts.push(`ansible_host=${quoteAnsibleValue(item.hostname)}`);
  }
  if (item.username) {
    parts.push(`ansible_user=${quoteAnsibleValue(item.username)}`);
  }
  if (item.port && item.port !== 22) {
    parts.push(`ansible_port=${item.port}`);
  }
  if (item.identityHint) {
    parts.push(`ansible_ssh_private_key_file=${quoteAnsibleValue(item.identityHint)}`);
  }
  return parts.join(" ");
}

function quoteAnsibleValue(value: string): string {
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}
