import test from "node:test";
import assert from "node:assert/strict";

import {
  hashInventoryContent,
  isHttpInventoryUrl,
  parseHostInventoryDocument,
  syncHostsFromInventory,
  createJsonManagedSource,
} from "../../domain/hostDataSource.ts";

/**
 * Application-layer load helpers are browser/Electron-bound; cover the pure
 * contract used by useHostDataSourceSync (hash skip + merge path).
 */
test("unchanged hash short-circuit contract", () => {
  const raw = JSON.stringify({
    version: 1,
    hosts: [{ id: "a", hostname: "1.2.3.4", username: "u" }],
  });
  const hash = hashInventoryContent(raw);
  assert.equal(hash, hashInventoryContent(raw));
  assert.notEqual(hash, hashInventoryContent(raw + " "));
});

test("http url validation used by addJsonSource", () => {
  assert.equal(isHttpInventoryUrl("https://cmdb.example/hosts.json"), true);
  assert.equal(isHttpInventoryUrl("ftp://x"), false);
});

test("sync path used after successful load", () => {
  const source = createJsonManagedSource({
    type: "json_file",
    filePath: "/tmp/inv.json",
    groupName: "cmdb",
    id: "s1",
  });
  const inventory = parseHostInventoryDocument(JSON.stringify({
    version: 1,
    hosts: [{ id: "h1", hostname: "10.0.0.1", username: "root", group: "prod" }],
  }));
  const result = syncHostsFromInventory({
    existingHosts: [],
    customGroups: [],
    inventory,
    source,
  });
  assert.equal(result.stats.added, 1);
  assert.equal(result.hosts[0]?.group, "cmdb/prod");
  assert.equal(result.hosts[0]?.managedExternalId, "h1");
});
