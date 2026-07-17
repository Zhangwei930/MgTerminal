import test from "node:test";
import assert from "node:assert/strict";

import type { Host } from "./models.ts";
import {
  createJsonManagedSource,
  exportHostsToAnsibleInventoryIni,
  exportHostsToInventoryDocument,
  hashInventoryContent,
  hostToInventoryItem,
  inventoryContainsSecrets,
  isHttpInventoryUrl,
  isHostDataSourceDueForAutoSync,
  listDueHostDataSources,
  buildHttpInventoryHeaders,
  normalizeAutoSyncIntervalMs,
  normalizeHttpAuthHeaderName,
  normalizeHttpAuthHeaderValue,
  normalizeLastSyncError,
  normalizeLastSyncStatus,
  parseHostInventoryDocument,
  parseInventoryDocument,
  syncHostsFromInventory,
  withHostDataSourceSyncOutcome,
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

test("parseInventoryDocument accepts MagiesTerminal JSON and Ansible INI", () => {
  const jsonDoc = parseInventoryDocument(sampleJson);
  assert.equal(jsonDoc.hosts.length, 2);

  const ansibleDoc = parseInventoryDocument(`
[app]
api ansible_host=10.9.9.9 ansible_user=ops ansible_port=22
`);
  assert.equal(ansibleDoc.version, 1);
  assert.equal(ansibleDoc.hosts.length, 1);
  assert.equal(ansibleDoc.hosts[0]?.hostname, "10.9.9.9");
  assert.equal(ansibleDoc.hosts[0]?.username, "ops");
  assert.equal(ansibleDoc.hosts[0]?.group, "app");
});

test("parseInventoryDocument accepts Ansible YAML inventory", () => {
  const doc = parseInventoryDocument(`
all:
  hosts:
    edge1:
      ansible_host: 10.8.8.8
      ansible_user: ops
`);
  assert.equal(doc.hosts.length, 1);
  assert.equal(doc.hosts[0]?.hostname, "10.8.8.8");
  assert.equal(doc.hosts[0]?.username, "ops");
});

test("buildHttpInventoryHeaders applies allowed auth headers only", () => {
  assert.deepEqual(
    buildHttpInventoryHeaders({
      httpAuthHeaderName: "Authorization",
      httpAuthHeaderValue: "Bearer secret",
    }).Authorization,
    "Bearer secret",
  );
  assert.equal(normalizeHttpAuthHeaderName("X-Evil"), undefined);
  assert.equal(normalizeHttpAuthHeaderValue("a\nb"), undefined);
  assert.equal(normalizeHttpAuthHeaderName("X-Api-Key"), "X-Api-Key");
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

test("exportHostsToAnsibleInventoryIni is secret-free and re-importable", () => {
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
    } as Host,
  ];
  const result = exportHostsToAnsibleInventoryIni(hosts);
  assert.equal(result.exportedCount, 1);
  assert.doesNotMatch(result.ini, /super-secret/);
  assert.match(result.ini, /\[app\]/);
  assert.match(result.ini, /ansible_host=10\.0\.0\.5/);
  const roundTrip = parseInventoryDocument(result.ini);
  assert.equal(roundTrip.hosts.length, 1);
  assert.equal(roundTrip.hosts[0]?.hostname, "10.0.0.5");
});

test("withHostDataSourceSyncOutcome records ok / unchanged / error", () => {
  const base = createJsonManagedSource({
    type: "json_file",
    filePath: "/tmp/a.json",
    groupName: "g",
    id: "s-status",
  });
  const ok = withHostDataSourceSyncOutcome(base, {
    success: true,
    contentHash: "abc",
    now: 10,
  });
  assert.equal(ok.lastSyncStatus, "ok");
  assert.equal(ok.lastFileHash, "abc");
  assert.equal(ok.lastSyncError, undefined);

  const unchanged = withHostDataSourceSyncOutcome(base, {
    success: true,
    unchanged: true,
    now: 20,
  });
  assert.equal(unchanged.lastSyncStatus, "unchanged");

  const err = withHostDataSourceSyncOutcome(base, {
    success: false,
    error: "  boom  ",
    now: 30,
  });
  assert.equal(err.lastSyncStatus, "error");
  assert.equal(err.lastSyncError, "boom");
  assert.equal(normalizeLastSyncStatus("error"), "error");
  assert.equal(normalizeLastSyncStatus("nope"), undefined);
  assert.equal(normalizeLastSyncError("x".repeat(500))?.length, 400);
});

test("normalizeAutoSyncIntervalMs clamps and clears invalid values", () => {
  assert.equal(normalizeAutoSyncIntervalMs(undefined), undefined);
  assert.equal(normalizeAutoSyncIntervalMs(0), undefined);
  assert.equal(normalizeAutoSyncIntervalMs(-1), undefined);
  assert.equal(normalizeAutoSyncIntervalMs(30_000), 60_000);
  assert.equal(normalizeAutoSyncIntervalMs(5 * 60_000), 5 * 60_000);
  assert.equal(normalizeAutoSyncIntervalMs(48 * 60 * 60_000), 24 * 60 * 60_000);
});

test("isHostDataSourceDueForAutoSync respects interval and lastSyncedAt", () => {
  const source = createJsonManagedSource({
    type: "json_http",
    filePath: "https://example.com/hosts.json",
    groupName: "cmdb",
    id: "src-auto",
    autoSyncIntervalMs: 5 * 60_000,
  });
  assert.equal(isHostDataSourceDueForAutoSync({ ...source, lastSyncedAt: 0 }, 5 * 60_000), true);
  assert.equal(
    isHostDataSourceDueForAutoSync({ ...source, lastSyncedAt: 1000 }, 1000 + 5 * 60_000 - 1),
    false,
  );
  assert.equal(
    isHostDataSourceDueForAutoSync({ ...source, lastSyncedAt: 1000 }, 1000 + 5 * 60_000),
    true,
  );
  assert.equal(
    isHostDataSourceDueForAutoSync({ ...source, enabled: false, lastSyncedAt: 0 }, 1_000_000),
    false,
  );
  assert.equal(
    listDueHostDataSources([
      { ...source, lastSyncedAt: 0 },
      createJsonManagedSource({
        type: "json_file",
        filePath: "/tmp/x.json",
        groupName: "other",
        id: "src-manual",
      }),
    ], 5 * 60_000).map((s) => s.id).join(","),
    "src-auto",
  );
});
