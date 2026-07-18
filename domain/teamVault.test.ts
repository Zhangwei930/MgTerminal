import assert from "node:assert/strict";
import { test } from "node:test";

import type { Host } from "./models";
import {
  buildTeamVaultPackage,
  createTeamVaultPolicy,
  decodeTeamVaultPackageShare,
  encodeTeamVaultPackageShare,
  generateAuditKeyHex,
  joinTeamVaultFromPackage,
  setTeamVaultMemberRole,
  signTeamVaultAuditEvent,
  teamVaultCan,
  verifyTeamVaultAuditEvent,
} from "./teamVault";

function sampleHost(id = "h1"): Host {
  return {
    id,
    label: "App",
    hostname: "app.example.com",
    port: 22,
    username: "deploy",
    password: "secret-must-not-export",
    protocol: "ssh",
  } as Host;
}

test("createTeamVaultPolicy makes a local owner", () => {
  const policy = createTeamVaultPolicy({
    teamName: "Ops",
    ownerDisplayName: "Ada",
    now: 1000,
  });
  assert.equal(policy.teamName, "Ops");
  assert.equal(policy.members.length, 1);
  assert.equal(policy.members[0]!.role, "owner");
  assert.equal(policy.localMemberId, policy.members[0]!.memberId);
  assert.equal(teamVaultCan(policy, "manage_members"), true);
  assert.equal(teamVaultCan(policy, "edit_hosts"), true);
});

test("team vault package strips secrets from inventory", () => {
  const policy = createTeamVaultPolicy({
    teamName: "Ops",
    ownerDisplayName: "Ada",
  });
  const pkg = buildTeamVaultPackage({
    policy,
    hosts: [sampleHost()],
  });
  assert.equal(pkg.kind, "magies-team-vault");
  assert.equal(pkg.inventory.hosts.length, 1);
  const json = JSON.stringify(pkg);
  assert.equal(json.includes("secret-must-not-export"), false);
  assert.equal(json.includes("password"), false);
});

test("share string round-trips", () => {
  const policy = createTeamVaultPolicy({
    teamName: "Ops",
    ownerDisplayName: "Ada",
  });
  const pkg = buildTeamVaultPackage({ policy, hosts: [sampleHost()] });
  const share = encodeTeamVaultPackageShare(pkg);
  assert.match(share, /^magies-team:1:/);
  const decoded = decodeTeamVaultPackageShare(share);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.package.teamId, pkg.teamId);
  assert.equal(decoded.package.inventory.hosts[0]!.hostname, "app.example.com");
});

test("join package assigns viewer role by default", () => {
  const owner = createTeamVaultPolicy({
    teamName: "Ops",
    ownerDisplayName: "Ada",
  });
  const pkg = buildTeamVaultPackage({ policy: owner, hosts: [sampleHost()] });
  const joined = joinTeamVaultFromPackage({
    package: pkg,
    displayName: "Bob",
  });
  assert.equal(joined.teamId, owner.teamId);
  assert.equal(teamVaultCan(joined, "edit_hosts"), false);
  assert.equal(teamVaultCan(joined, "view_audit"), true);
  assert.equal(joined.members.some((m) => m.displayName === "Bob"), true);
});

test("owner can change member roles", () => {
  const policy = createTeamVaultPolicy({
    teamName: "Ops",
    ownerDisplayName: "Ada",
  });
  const pkg = buildTeamVaultPackage({ policy, hosts: [] });
  let joined = joinTeamVaultFromPackage({ package: pkg, displayName: "Bob" });
  const bob = joined.members.find((m) => m.displayName === "Bob")!;
  joined = setTeamVaultMemberRole(joined, bob.memberId, "editor");
  // local member is still Bob (viewer→editor)
  assert.equal(teamVaultCan(joined, "edit_hosts"), true);
  assert.equal(teamVaultCan(joined, "manage_members"), false);
});

test("audit HMAC sign and verify", async () => {
  const key = generateAuditKeyHex();
  const event = await signTeamVaultAuditEvent(
    {
      ts: 1,
      teamId: "t1",
      type: "inventory_exported",
      actorMemberId: "m1",
      detail: "12 hosts",
    },
    key,
  );
  assert.ok(event.sig && event.sig.length === 64);
  assert.equal(await verifyTeamVaultAuditEvent(event, key), true);
  assert.equal(
    await verifyTeamVaultAuditEvent({ ...event, detail: "tampered" }, key),
    false,
  );
});
