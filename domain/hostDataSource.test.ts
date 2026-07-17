import test from "node:test";
import assert from "node:assert/strict";

import type { Host } from "./models.ts";
import {
  createJsonManagedSource,
  hashInventoryContent,
  isHttpInventoryUrl,
  parseHostInventoryDocument,
  syncHostsFromInventory,
} from "./hostDataSource.ts";

const sampleJson = JSON.stringify({
  version: 1,
  hosts: [
    {
      id: "web-1",
      label: "web-1",
      hostname: "10.0.0.10",
      port: 22,
      username: "deploy",
      group: "app",
      tags: ["prod"],
      protocol: "ssh",
    },
    {
      id: "db-1",
      label: "db-1",
      hostname: "10.0.0.20",
      username: "deploy",
      group: "data",
    },
  ],
});

test("parseHostInventoryDocument accepts clean inventory", () => {
  const doc = parseHostInventoryDocument(sampleJson);
  assert.equal(doc.version, 1);
  assert.equal(doc.hosts.length, 2);
  assert.equal(doc.hosts[0]?.id, "web-1");
});

test("parseHostInventoryDocument rejects secrets", () => {
  assert.throws(
    () => parseHostInventoryDocument(JSON.stringify({
      version: 1,
      hosts: [{ id: "x", hostname: "h", password: "nope" }],
    })),
    /must not include secrets/,
  );
});

test("syncHostsFromInventory adds and updates by external id", () => {
  const source = createJsonManagedSource({
    type: "json_http",
    filePath: "https://example.com/hosts.json",
    groupName: "cmdb",
    id: "src-1",
  });
  const doc = parseHostInventoryDocument(sampleJson);
  const first = syncHostsFromInventory({
    existingHosts: [],
    customGroups: [],
    inventory: doc,
    source,
    now: 1000,
  });
  assert.equal(first.stats.added, 2);
  assert.equal(first.hosts.length, 2);
  assert.equal(first.hosts[0]?.managedSourceId, "src-1");
  assert.equal(first.hosts[0]?.managedExternalId, "web-1");
  assert.equal(first.hosts[0]?.group, "cmdb/app");

  const updatedDoc = parseHostInventoryDocument(JSON.stringify({
    version: 1,
    hosts: [
      {
        id: "web-1",
        label: "web-1-renamed",
        hostname: "10.0.0.11",
        username: "deploy",
        group: "app",
      },
    ],
  }));
  const second = syncHostsFromInventory({
    existingHosts: first.hosts,
    customGroups: first.customGroups,
    inventory: updatedDoc,
    source,
    now: 2000,
  });
  assert.equal(second.stats.updated, 1);
  assert.equal(second.stats.removed, 1);
  assert.equal(second.hosts.length, 1);
  assert.equal(second.hosts[0]?.label, "web-1-renamed");
  assert.equal(second.hosts[0]?.hostname, "10.0.0.11");
  assert.equal(second.hosts[0]?.id, first.hosts.find((h) => h.managedExternalId === "web-1")?.id);
});

test("sync skips colliding unmanaged hosts", () => {
  const source = createJsonManagedSource({
    type: "json_file",
    filePath: "/tmp/hosts.json",
    groupName: "cmdb",
    id: "src-2",
  });
  const existing: Host[] = [{
    id: "manual-1",
    label: "manual",
    hostname: "10.0.0.10",
    port: 22,
    username: "deploy",
    tags: [],
    os: "linux",
    protocol: "ssh",
  }];
  const doc = parseHostInventoryDocument(sampleJson);
  const result = syncHostsFromInventory({
    existingHosts: existing,
    customGroups: [],
    inventory: doc,
    source,
  });
  assert.equal(result.stats.skipped, 1);
  assert.equal(result.stats.added, 1);
  assert.equal(result.hosts.some((h) => h.id === "manual-1"), true);
});

test("hash and url helpers", () => {
  assert.equal(hashInventoryContent("a"), hashInventoryContent("a"));
  assert.notEqual(hashInventoryContent("a"), hashInventoryContent("b"));
  assert.equal(isHttpInventoryUrl("https://example.com/x.json"), true);
  assert.equal(isHttpInventoryUrl("/tmp/x.json"), false);
});
