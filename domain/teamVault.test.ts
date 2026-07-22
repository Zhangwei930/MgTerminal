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
  classifyTeamVaultAuditSignatures,
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

test("classifyTeamVaultAuditSignatures separates verified, tampered and unsigned rows", async () => {
  const key = generateAuditKeyHex();
  const base = { ts: 1, teamId: "t1", type: "inventory_exported" as const, actorMemberId: "m1" };
  const signed = await signTeamVaultAuditEvent({ ...base, detail: "12 hosts" }, key);
  const tampered = { ...signed, detail: "1 host" };
  const unsigned = { ...base, ts: 2, detail: "no key at the time" };

  assert.deepEqual(
    await classifyTeamVaultAuditSignatures([signed, tampered, unsigned], key),
    ["verified", "invalid", "unsigned"],
  );
});

test("classifyTeamVaultAuditSignatures never claims verified without a key", async () => {
  const key = generateAuditKeyHex();
  const signed = await signTeamVaultAuditEvent(
    { ts: 1, teamId: "t1", type: "team_created", actorMemberId: "m1" },
    key,
  );
  // A signature we hold no key for is unverifiable — reporting it as either
  // verified or tampered would be a claim we cannot make.
  assert.deepEqual(await classifyTeamVaultAuditSignatures([signed], undefined), ["unverifiable"]);
  assert.deepEqual(await classifyTeamVaultAuditSignatures([signed], ""), ["unverifiable"]);
});

test("classifyTeamVaultAuditSignatures handles an empty ring", async () => {
  assert.deepEqual(await classifyTeamVaultAuditSignatures([], generateAuditKeyHex()), []);
});
