import test from "node:test";
import assert from "node:assert/strict";

import type { Host } from "./models.ts";
import {
  createJsonManagedSource,
  exportHostsToInventoryDocument,
  hashInventoryContent,
  hostToInventoryItem,
  inventoryContainsSecrets,
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

test("exportHostsToInventoryDocument strips secrets and is re-importable", () => {
  const hosts: Host[] = [
    {
      id: "h1",
      label: "prod-web",
      hostname: "10.0.0.5",
      port: 22,
      username: "deploy",
      password: "super-secret",
      tags: ["prod"],
      group: "app",
      os: "linux",
      protocol: "ssh",
      authMethod: "password",
      privateKey: "-----BEGIN PRIVATE KEY-----",
    } as Host,
    {
      id: "serial-1",
      label: "console",
      hostname: "/dev/ttyUSB0",
      port: 0,
      username: "",
      tags: [],
      protocol: "serial",
    } as Host,
  ];

  const result = exportHostsToInventoryDocument(hosts, { now: 1234 });
  assert.equal(result.exportedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.document.exportedAt, 1234);
  assert.equal(result.document.source, "magies-terminal");
  assert.equal(result.document.hosts[0]?.id, "h1");
  assert.equal(result.document.hosts[0]?.hostname, "10.0.0.5");
  assert.equal(result.document.hosts[0]?.authMethod, "password");
  assert.equal((result.document.hosts[0] as { password?: string }).password, undefined);
  assert.equal(inventoryContainsSecrets(result.document), false);

  // Round-trip: teammate imports via data source parser
  const parsed = parseHostInventoryDocument(result.json);
  assert.equal(parsed.hosts.length, 1);
  assert.equal(parsed.hosts[0]?.label, "prod-web");
});

test("export respects host id selection and managedExternalId", () => {
  const hosts: Host[] = [
    {
      id: "local-1",
      managedExternalId: "cmdb-99",
      label: "a",
      hostname: "1.1.1.1",
      port: 22,
      username: "u",
      tags: [],
      protocol: "ssh",
    },
    {
      id: "local-2",
      label: "b",
      hostname: "2.2.2.2",
      port: 22,
      username: "u",
      tags: [],
      protocol: "ssh",
    },
  ];
  const result = exportHostsToInventoryDocument(hosts, { hostIds: ["local-1"] });
  assert.equal(result.exportedCount, 1);
  assert.equal(result.document.hosts[0]?.id, "cmdb-99");
  assert.equal(hostToInventoryItem(hosts[1]!)?.id, "local-2");
});
