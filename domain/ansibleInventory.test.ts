import test from "node:test";
import assert from "node:assert/strict";

import {
  inventoryItemsToAnsibleIni,
  looksLikeAnsibleInventoryIni,
  parseAnsibleInventoryIni,
} from "./ansibleInventory.ts";
import type { HostInventoryItem } from "./hostDataSource.ts";

const sampleIni = `
# web tier
[web]
web1.example.com
web2 ansible_host=10.0.0.2 ansible_user=deploy ansible_port=2222

[db:children]
db_primary

[db_primary]
db1.example.com ansible_user=ubuntu

[all:vars]
ansible_port=22
`;

test("looksLikeAnsibleInventoryIni detects section headers", () => {
  assert.equal(looksLikeAnsibleInventoryIni(sampleIni), true);
  assert.equal(looksLikeAnsibleInventoryIni('{"version":1,"hosts":[]}'), false);
  assert.equal(looksLikeAnsibleInventoryIni("plain text"), false);
});

test("parseAnsibleInventoryIni maps hosts, vars, and children groups", () => {
  const doc = parseAnsibleInventoryIni(sampleIni);
  assert.equal(doc.version, 1);
  assert.equal(doc.hosts.length, 3);

  const web2 = doc.hosts.find((h) => h.id === "web2");
  assert.ok(web2);
  assert.equal(web2.hostname, "10.0.0.2");
  assert.equal(web2.username, "deploy");
  assert.equal(web2.port, 2222);
  assert.equal(web2.group, "web");

  const db1 = doc.hosts.find((h) => h.id === "db1.example.com");
  assert.ok(db1);
  assert.equal(db1.username, "ubuntu");
  assert.equal(db1.port, 22);
  // membership includes parent db via :children
  assert.ok(db1.group === "db_primary" || db1.group === "db");
  assert.ok(
    (db1.tags || []).includes("db") || db1.group === "db" || (db1.tags || []).includes("db_primary"),
  );

  const web1 = doc.hosts.find((h) => h.id === "web1.example.com");
  assert.ok(web1);
  assert.equal(web1.hostname, "web1.example.com");
  assert.equal(web1.port, 22);
});

test("parseAnsibleInventoryIni rejects secret vars", () => {
  assert.throws(
    () => parseAnsibleInventoryIni(`
[web]
h1 ansible_host=1.2.3.4 ansible_password=secret
`),
    /must not include secrets/,
  );

  assert.throws(
    () => parseAnsibleInventoryIni(`
[web:vars]
ansible_become_pass=nope

[web]
h1
`),
    /must not include secrets/,
  );
});

test("parseAnsibleInventoryIni skips host ranges and local connections", () => {
  const doc = parseAnsibleInventoryIni(`
[web]
www[01:03].example.com
app1 ansible_host=10.0.0.5
local1 ansible_connection=local
`);
  assert.equal(doc.hosts.length, 1);
  assert.equal(doc.hosts[0]?.id, "app1");
  assert.equal(doc.skippedHostRanges, 1);
  assert.equal(doc.skippedLocal, 1);
});

test("parseAnsibleInventoryIni supports user@host:port alias form", () => {
  const doc = parseAnsibleInventoryIni(`
[edge]
deploy@edge.example.com:2201
`);
  assert.equal(doc.hosts.length, 1);
  assert.equal(doc.hosts[0]?.hostname, "edge.example.com");
  assert.equal(doc.hosts[0]?.username, "deploy");
  assert.equal(doc.hosts[0]?.port, 2201);
  assert.equal(doc.hosts[0]?.label, "edge.example.com");
});

test("parseAnsibleInventoryIni maps private key path to identityHint", () => {
  const doc = parseAnsibleInventoryIni(`
[web]
box1 ansible_host=10.1.1.1 ansible_ssh_private_key_file=/home/ops/.ssh/id_ed25519
`);
  assert.equal(doc.hosts[0]?.identityHint, "/home/ops/.ssh/id_ed25519");
  assert.equal(doc.hosts[0]?.authMethod, "key");
});

test("inventoryItemsToAnsibleIni round-trips through parser", () => {
  const items: HostInventoryItem[] = [
    {
      id: "web-1",
      label: "web-1",
      hostname: "10.0.0.10",
      port: 2222,
      username: "deploy",
      group: "app/web",
      protocol: "ssh",
    },
    {
      id: "db-1",
      label: "db primary",
      hostname: "db.example.com",
      username: "ubuntu",
      group: "data",
      protocol: "ssh",
      identityHint: "/keys/db.pem",
    },
  ];
  const ini = inventoryItemsToAnsibleIni(items);
  assert.match(ini, /\[app_web\]/);
  assert.match(ini, /ansible_host=10\.0\.0\.10/);
  assert.match(ini, /ansible_port=2222/);
  assert.match(ini, /\[data\]/);
  assert.match(ini, /ansible_ssh_private_key_file=\/keys\/db\.pem/);
  // label with space falls back to id
  assert.match(ini, /^db-1 /m);

  const parsed = parseAnsibleInventoryIni(ini);
  assert.equal(parsed.hosts.length, 2);
  const web = parsed.hosts.find((h) => h.hostname === "10.0.0.10");
  assert.ok(web);
  assert.equal(web.username, "deploy");
  assert.equal(web.port, 2222);
});
