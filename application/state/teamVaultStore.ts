/**
 * Renderer-side team vault policy + signed audit (local-first MVP).
 * Secrets never enter team packages; inventory only.
 */

import {
  STORAGE_KEY_TEAM_VAULT_AUDIT,
  STORAGE_KEY_TEAM_VAULT_POLICY,
} from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";
import {
  buildTeamVaultPackage,
  createTeamVaultPolicy,
  decodeTeamVaultPackageShare,
  encodeTeamVaultPackageShare,
  exportTeamVaultAuditNdjson,
  exportTeamVaultAuditText,
  generateAuditKeyHex,
  joinTeamVaultFromPackage,
  parseTeamVaultPackage,
  setTeamVaultMemberRole,
  signTeamVaultAuditEvent,
  teamVaultCan,
  type TeamVaultAuditEvent,
  type TeamVaultPackage,
  type TeamVaultPolicy,
  type TeamVaultRole,
} from "../../domain/teamVault";
import type { Host } from "../../domain/models";

const MAX_AUDIT_EVENTS = 200;

export function readTeamVaultPolicy(): TeamVaultPolicy | null {
  const raw = localStorageAdapter.read<TeamVaultPolicy>(STORAGE_KEY_TEAM_VAULT_POLICY);
  if (!raw || typeof raw !== "object" || !raw.teamId) return null;
  return raw;
}

export function writeTeamVaultPolicy(policy: TeamVaultPolicy | null): void {
  if (!policy) {
    localStorageAdapter.remove(STORAGE_KEY_TEAM_VAULT_POLICY);
    return;
  }
  localStorageAdapter.write(STORAGE_KEY_TEAM_VAULT_POLICY, policy);
}

export function readTeamVaultAudit(): TeamVaultAuditEvent[] {
  const raw = localStorageAdapter.read<TeamVaultAuditEvent[]>(STORAGE_KEY_TEAM_VAULT_AUDIT);
  return Array.isArray(raw) ? raw : [];
}

function writeTeamVaultAudit(events: TeamVaultAuditEvent[]): void {
  localStorageAdapter.write(STORAGE_KEY_TEAM_VAULT_AUDIT, events.slice(-MAX_AUDIT_EVENTS));
}

export async function appendTeamVaultAudit(
  partial: Omit<TeamVaultAuditEvent, "ts" | "sig" | "teamId"> & {
    teamId?: string;
    ts?: number;
  },
): Promise<TeamVaultAuditEvent> {
  const policy = readTeamVaultPolicy();
  const teamId = partial.teamId || policy?.teamId || "unknown";
  const event = await signTeamVaultAuditEvent(
    {
      ts: partial.ts ?? Date.now(),
      teamId,
      type: partial.type,
      actorMemberId: partial.actorMemberId || policy?.localMemberId,
      detail: partial.detail,
    },
    policy?.auditKeyHex,
  );
  const events = readTeamVaultAudit();
  events.push(event);
  writeTeamVaultAudit(events);
  return event;
}

export function clearTeamVaultAudit(): void {
  writeTeamVaultAudit([]);
}

export function createLocalTeamVault(input: {
  teamName: string;
  ownerDisplayName: string;
  ownerHandle?: string;
}): TeamVaultPolicy {
  const policy = createTeamVaultPolicy({
    teamName: input.teamName,
    ownerDisplayName: input.ownerDisplayName,
    ownerHandle: input.ownerHandle,
    auditKeyHex: generateAuditKeyHex(),
  });
  writeTeamVaultPolicy(policy);
  void appendTeamVaultAudit({
    type: "team_created",
    detail: policy.teamName,
    actorMemberId: policy.localMemberId,
    teamId: policy.teamId,
  });
  return policy;
}

export function exportLocalTeamVaultPackage(hosts: Host[]): {
  ok: true;
  package: TeamVaultPackage;
  shareString: string;
  json: string;
} | { ok: false; error: string } {
  const policy = readTeamVaultPolicy();
  if (!policy) return { ok: false, error: "no_team" };
  if (!teamVaultCan(policy, "share_package")) return { ok: false, error: "forbidden" };
  const pkg = buildTeamVaultPackage({ policy, hosts });
  void appendTeamVaultAudit({
    type: "inventory_exported",
    detail: `${pkg.inventory.hosts.length} hosts`,
  });
  void appendTeamVaultAudit({ type: "package_shared" });
  return {
    ok: true,
    package: pkg,
    shareString: encodeTeamVaultPackageShare(pkg),
    json: `${JSON.stringify(pkg, null, 2)}\n`,
  };
}

export function importTeamVaultPackageShare(
  shareOrJson: string,
  displayName: string,
): { ok: true; policy: TeamVaultPolicy; package: TeamVaultPackage } | { ok: false; error: string } {
  const decoded = decodeTeamVaultPackageShare(shareOrJson);
  if (!decoded.ok) {
    // try raw package parse
    try {
      const parsed = parseTeamVaultPackage(JSON.parse(shareOrJson));
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return finishImport(parsed.package, displayName);
    } catch {
      return { ok: false, error: decoded.error };
    }
  }
  return finishImport(decoded.package, displayName);
}

function finishImport(
  pkg: TeamVaultPackage,
  displayName: string,
): { ok: true; policy: TeamVaultPolicy; package: TeamVaultPackage } | { ok: false; error: string } {
  const existing = readTeamVaultPolicy();
  const policy = joinTeamVaultFromPackage({
    package: pkg,
    displayName,
    auditKeyHex: existing?.teamId === pkg.teamId ? existing.auditKeyHex : undefined,
  });
  writeTeamVaultPolicy(policy);
  void appendTeamVaultAudit({
    type: "inventory_imported",
    detail: `${pkg.inventory.hosts.length} hosts`,
    teamId: policy.teamId,
    actorMemberId: policy.localMemberId,
  });
  void appendTeamVaultAudit({
    type: "member_joined",
    detail: displayName,
    teamId: policy.teamId,
    actorMemberId: policy.localMemberId,
  });
  return { ok: true, policy, package: pkg };
}

export function updateLocalMemberRole(
  memberId: string,
  role: TeamVaultRole,
): { ok: true; policy: TeamVaultPolicy } | { ok: false; error: string } {
  const policy = readTeamVaultPolicy();
  if (!policy) return { ok: false, error: "no_team" };
  if (!teamVaultCan(policy, "manage_members")) return { ok: false, error: "forbidden" };
  const next = setTeamVaultMemberRole(policy, memberId, role);
  writeTeamVaultPolicy(next);
  void appendTeamVaultAudit({
    type: "member_role_changed",
    detail: `${memberId}→${role}`,
  });
  return { ok: true, policy: next };
}

export function leaveTeamVault(): void {
  writeTeamVaultPolicy(null);
}

export function getTeamVaultAuditExport(format: "text" | "ndjson"): string {
  const events = readTeamVaultAudit();
  return format === "ndjson"
    ? exportTeamVaultAuditNdjson(events)
    : exportTeamVaultAuditText(events);
}
