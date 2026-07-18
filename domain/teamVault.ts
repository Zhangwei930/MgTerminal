/**
 * Local-first team vault MVP.
 *
 * - Shared document is inventory metadata only (no secrets).
 * - Roles gate write/share actions on each device.
 * - Audit events can be HMAC-signed with a shared team audit key.
 *
 * Full multi-user secret decryption / central IdP is intentionally out of scope.
 */

import {
  exportHostsToInventoryDocument,
  type HostInventoryShareDocument,
} from "./hostDataSource";
import type { Host } from "./models";

export type TeamVaultRole = "owner" | "editor" | "viewer";

export type TeamVaultMember = {
  memberId: string;
  displayName: string;
  role: TeamVaultRole;
  /** Optional public identifier (email / handle); never a secret. */
  handle?: string;
  joinedAt: number;
};

export type TeamVaultPolicy = {
  teamId: string;
  teamName: string;
  /** Hex-encoded shared HMAC key for audit signatures (local-first MVP). */
  auditKeyHex?: string;
  members: TeamVaultMember[];
  /** Local device's member id within this team. */
  localMemberId: string;
  updatedAt: number;
};

export type TeamVaultPackage = {
  v: 1;
  kind: "magies-team-vault";
  teamId: string;
  teamName: string;
  /** Inventory only — never secrets. */
  inventory: HostInventoryShareDocument;
  /** Public membership roster (roles only). */
  members: TeamVaultMember[];
  exportedAt: number;
  exportedByMemberId?: string;
};

export type TeamVaultAuditType =
  | "team_created"
  | "member_joined"
  | "member_role_changed"
  | "inventory_exported"
  | "inventory_imported"
  | "inventory_synced"
  | "package_shared"
  | "audit_cleared";

export type TeamVaultAuditEvent = {
  ts: number;
  teamId: string;
  type: TeamVaultAuditType;
  actorMemberId?: string;
  detail?: string;
  /** HMAC-SHA256 hex over canonical event body (without `sig`). */
  sig?: string;
};

export type TeamVaultPermission =
  | "edit_hosts"
  | "share_package"
  | "manage_members"
  | "import_inventory"
  | "view_audit";

const ROLE_PERMISSIONS: Record<TeamVaultRole, ReadonlySet<TeamVaultPermission>> = {
  owner: new Set([
    "edit_hosts",
    "share_package",
    "manage_members",
    "import_inventory",
    "view_audit",
  ]),
  editor: new Set([
    "edit_hosts",
    "share_package",
    "import_inventory",
    "view_audit",
  ]),
  viewer: new Set(["view_audit"]),
};

export function teamVaultRolePermissions(role: TeamVaultRole): ReadonlySet<TeamVaultPermission> {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.viewer;
}

export function teamVaultCan(
  policy: Pick<TeamVaultPolicy, "members" | "localMemberId"> | null | undefined,
  permission: TeamVaultPermission,
): boolean {
  if (!policy?.localMemberId) return false;
  const me = policy.members.find((m) => m.memberId === policy.localMemberId);
  if (!me) return false;
  return teamVaultRolePermissions(me.role).has(permission);
}

export function getLocalTeamVaultRole(
  policy: Pick<TeamVaultPolicy, "members" | "localMemberId"> | null | undefined,
): TeamVaultRole | null {
  if (!policy?.localMemberId) return null;
  return policy.members.find((m) => m.memberId === policy.localMemberId)?.role ?? null;
}

export function createTeamVaultPolicy(input: {
  teamId?: string;
  teamName: string;
  ownerDisplayName: string;
  ownerHandle?: string;
  auditKeyHex?: string;
  now?: number;
}): TeamVaultPolicy {
  const now = input.now ?? Date.now();
  const teamId = (input.teamId || generateTeamId()).trim();
  const ownerId = `member-${teamId.slice(0, 8)}-owner`;
  return {
    teamId,
    teamName: input.teamName.trim() || "Team",
    auditKeyHex: input.auditKeyHex,
    localMemberId: ownerId,
    updatedAt: now,
    members: [
      {
        memberId: ownerId,
        displayName: input.ownerDisplayName.trim() || "Owner",
        handle: input.ownerHandle?.trim() || undefined,
        role: "owner",
        joinedAt: now,
      },
    ],
  };
}

export function generateTeamId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buf = new Uint8Array(12);
    cryptoApi.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `team-${Date.now().toString(16)}`;
}

export function generateAuditKeyHex(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buf = new Uint8Array(32);
    cryptoApi.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Weak fallback only for pure domain tests without Web Crypto.
  let out = "";
  for (let i = 0; i < 64; i += 1) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

export function buildTeamVaultPackage(input: {
  policy: TeamVaultPolicy;
  hosts: Host[];
  now?: number;
}): TeamVaultPackage {
  const now = input.now ?? Date.now();
  const exported = exportHostsToInventoryDocument(input.hosts, {
    now,
    source: `magies-team:${input.policy.teamId}`,
  });
  return {
    v: 1,
    kind: "magies-team-vault",
    teamId: input.policy.teamId,
    teamName: input.policy.teamName,
    inventory: exported.document,
    members: input.policy.members.map((m) => ({ ...m })),
    exportedAt: now,
    exportedByMemberId: input.policy.localMemberId,
  };
}

export function parseTeamVaultPackage(
  raw: unknown,
): { ok: true; package: TeamVaultPackage } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "payload" };
  const rec = raw as Record<string, unknown>;
  if (rec.kind !== "magies-team-vault") return { ok: false, error: "kind" };
  if (Number(rec.v) !== 1) return { ok: false, error: "version" };
  if (typeof rec.teamId !== "string" || !rec.teamId.trim()) return { ok: false, error: "teamId" };
  if (typeof rec.teamName !== "string") return { ok: false, error: "teamName" };
  if (!rec.inventory || typeof rec.inventory !== "object") return { ok: false, error: "inventory" };
  const inventory = rec.inventory as HostInventoryShareDocument;
  // HostInventoryShareDocument is { version, hosts, exportedAt?, source? } — no kind field.
  if (!Array.isArray(inventory.hosts)) return { ok: false, error: "inventory_hosts" };
  if (inventory.version !== undefined && Number(inventory.version) !== 1) {
    return { ok: false, error: "inventory_version" };
  }
  const members = Array.isArray(rec.members)
    ? rec.members
        .filter((m): m is TeamVaultMember => Boolean(m && typeof m === "object"))
        .map((m) => ({
          memberId: String((m as TeamVaultMember).memberId || ""),
          displayName: String((m as TeamVaultMember).displayName || "Member"),
          role: normalizeRole((m as TeamVaultMember).role),
          handle: (m as TeamVaultMember).handle
            ? String((m as TeamVaultMember).handle)
            : undefined,
          joinedAt: Number((m as TeamVaultMember).joinedAt) || 0,
        }))
        .filter((m) => m.memberId)
    : [];
  return {
    ok: true,
    package: {
      v: 1,
      kind: "magies-team-vault",
      teamId: rec.teamId.trim(),
      teamName: String(rec.teamName).trim() || "Team",
      inventory,
      members,
      exportedAt: Number(rec.exportedAt) || Date.now(),
      exportedByMemberId:
        typeof rec.exportedByMemberId === "string" ? rec.exportedByMemberId : undefined,
    },
  };
}

function normalizeRole(role: unknown): TeamVaultRole {
  if (role === "owner" || role === "editor" || role === "viewer") return role;
  return "viewer";
}

/** Join a package as a new local viewer (or keep matching member id if present). */
export function joinTeamVaultFromPackage(input: {
  package: TeamVaultPackage;
  displayName: string;
  handle?: string;
  preferredRole?: TeamVaultRole;
  auditKeyHex?: string;
  now?: number;
}): TeamVaultPolicy {
  const now = input.now ?? Date.now();
  const existing = input.package.members.find(
    (m) =>
      (input.handle && m.handle && m.handle === input.handle)
      || m.displayName === input.displayName.trim(),
  );
  if (existing) {
    return {
      teamId: input.package.teamId,
      teamName: input.package.teamName,
      auditKeyHex: input.auditKeyHex,
      localMemberId: existing.memberId,
      members: input.package.members.map((m) => ({ ...m })),
      updatedAt: now,
    };
  }
  const memberId = `member-${generateTeamId().slice(0, 10)}`;
  // Joining from a shared package never elevates above viewer unless the package
  // already lists this person (checked above). Owners distribute elevated roles
  // via updated packages.
  const role: TeamVaultRole = "viewer";
  void input.preferredRole;
  const members = [
    ...input.package.members.map((m) => ({ ...m })),
    {
      memberId,
      displayName: input.displayName.trim() || "Member",
      handle: input.handle?.trim() || undefined,
      role,
      joinedAt: now,
    },
  ];
  return {
    teamId: input.package.teamId,
    teamName: input.package.teamName,
    auditKeyHex: input.auditKeyHex,
    localMemberId: memberId,
    members,
    updatedAt: now,
  };
}

export function setTeamVaultMemberRole(
  policy: TeamVaultPolicy,
  memberId: string,
  role: TeamVaultRole,
  now = Date.now(),
): TeamVaultPolicy {
  return {
    ...policy,
    updatedAt: now,
    members: policy.members.map((m) =>
      m.memberId === memberId ? { ...m, role } : m,
    ),
  };
}

/** Canonical bytes used for HMAC (excludes `sig`). */
export function teamVaultAuditCanonical(event: Omit<TeamVaultAuditEvent, "sig">): string {
  return JSON.stringify({
    ts: event.ts,
    teamId: event.teamId,
    type: event.type,
    actorMemberId: event.actorMemberId || "",
    detail: event.detail || "",
  });
}

export async function signTeamVaultAuditEvent(
  event: Omit<TeamVaultAuditEvent, "sig">,
  auditKeyHex: string | undefined,
): Promise<TeamVaultAuditEvent> {
  if (!auditKeyHex) return { ...event };
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) return { ...event };
  const keyBytes = hexToBytes(auditKeyHex);
  if (keyBytes.length < 16) return { ...event };
  const key = await cryptoApi.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await cryptoApi.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(teamVaultAuditCanonical(event)),
  );
  return { ...event, sig: bytesToHex(new Uint8Array(sig)) };
}

export async function verifyTeamVaultAuditEvent(
  event: TeamVaultAuditEvent,
  auditKeyHex: string | undefined,
): Promise<boolean> {
  if (!event.sig || !auditKeyHex) return false;
  const signed = await signTeamVaultAuditEvent(
    {
      ts: event.ts,
      teamId: event.teamId,
      type: event.type,
      actorMemberId: event.actorMemberId,
      detail: event.detail,
    },
    auditKeyHex,
  );
  if (!signed.sig || signed.sig.length !== event.sig.length) return false;
  // Constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < signed.sig.length; i += 1) {
    diff |= signed.sig.charCodeAt(i) ^ event.sig.charCodeAt(i);
  }
  return diff === 0;
}

export function encodeTeamVaultPackageShare(pkg: TeamVaultPackage): string {
  const json = JSON.stringify(pkg);
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf8").toString("base64url")
    : btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `magies-team:1:${b64}`;
}

export function decodeTeamVaultPackageShare(
  value: string,
): { ok: true; package: TeamVaultPackage } | { ok: false; error: string } {
  const raw = String(value || "").trim();
  // Raw JSON package
  if (raw.startsWith("{")) {
    try {
      return parseTeamVaultPackage(JSON.parse(raw));
    } catch {
      return { ok: false, error: "json" };
    }
  }
  const match = /^magies-team:(\d+):([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match) return { ok: false, error: "format" };
  if (Number(match[1]) !== 1) return { ok: false, error: "version" };
  try {
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(match[2]!, "base64url").toString("utf8")
      : decodeURIComponent(escape(atob(match[2]!.replace(/-/g, "+").replace(/_/g, "/"))));
    return parseTeamVaultPackage(JSON.parse(json));
  } catch {
    return { ok: false, error: "decode" };
  }
}

export function exportTeamVaultAuditText(events: TeamVaultAuditEvent[]): string {
  return events
    .map((e) => {
      const parts = [
        new Date(e.ts).toISOString(),
        e.teamId,
        e.type,
        e.actorMemberId || "-",
        e.detail || "",
        e.sig ? `sig=${e.sig.slice(0, 16)}…` : "unsigned",
      ];
      return parts.join("\t");
    })
    .join("\n");
}

export function exportTeamVaultAuditNdjson(events: TeamVaultAuditEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(Math.floor(clean.length / 2));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
