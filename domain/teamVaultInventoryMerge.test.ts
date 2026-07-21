import test from "node:test";
import assert from "node:assert/strict";

import type { Host } from "./models";
import type { HostInventoryShareDocument } from "./hostDataSource";
import { mergeTeamVaultInventory } from "./teamVault.ts";

const inventory = (
  items: HostInventoryShareDocument["hosts"],
): HostInventoryShareDocument => ({ version: 1, hosts: items });

const item = (over: Partial<HostInventoryShareDocument["hosts"][number]> = {}) => ({
  id: "ext-1",
  label: "web-01",
  hostname: "10.0.0.5",
  port: 22,
  username: "deploy",
  ...over,
});

test("inventory hosts land in the vault", () => {
  const result = mergeTeamVaultInventory([], inventory([item()]));

  assert.equal(result.added, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].hostname, "10.0.0.5");
  assert.equal(result.hosts[0].username, "deploy");
  assert.equal(result.hosts[0].label, "web-01");
});

test("re-importing the same package does not duplicate hosts", () => {
  const first = mergeTeamVaultInventory([], inventory([item()]));
  const second = mergeTeamVaultInventory(first.hosts, inventory([item()]));

  assert.equal(second.added, 0);
  assert.equal(second.skipped, 1);
  assert.equal(second.hosts.length, 1);
});

test("existing hosts are preserved and never overwritten", () => {
  const existing = [
    { id: "local-1", label: "my own name", hostname: "10.0.0.5", port: 22, username: "deploy", tags: [] },
  ] as unknown as Host[];

  const result = mergeTeamVaultInventory(existing, inventory([item({ label: "team name" })]));

  assert.equal(result.added, 0);
  assert.equal(result.hosts.length, 1);
  assert.equal(result.hosts[0].id, "local-1", "the local host object must survive");
  assert.equal(result.hosts[0].label, "my own name", "local edits must win over the package");
});

test("hosts differing only by username or port are distinct", () => {
  const base = mergeTeamVaultInventory([], inventory([item()]));
  const otherUser = mergeTeamVaultInventory(base.hosts, inventory([item({ id: "ext-2", username: "root" })]));
  const otherPort = mergeTeamVaultInventory(otherUser.hosts, inventory([item({ id: "ext-3", port: 2222 })]));

  assert.equal(otherPort.hosts.length, 3);
});

test("duplicates inside one package collapse to a single host", () => {
  const result = mergeTeamVaultInventory([], inventory([item(), item({ id: "ext-9" })]));

  assert.equal(result.hosts.length, 1);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
});

test("unusable inventory entries are skipped instead of throwing", () => {
  const result = mergeTeamVaultInventory(
    [],
    inventory([item({ hostname: "" }), item({ id: "ext-ok", hostname: "10.0.0.6" })]),
  );

  assert.equal(result.added, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.hosts[0].hostname, "10.0.0.6");
});

test("no credentials are ever produced from a package", () => {
  const result = mergeTeamVaultInventory([], inventory([item()]));
  const serialized = JSON.stringify(result.hosts[0]);

  assert.doesNotMatch(serialized, /"password"\s*:\s*"[^"]/);
  assert.equal(result.hosts[0].password ?? "", "");
});
