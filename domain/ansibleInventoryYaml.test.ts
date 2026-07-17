import test from "node:test";
import assert from "node:assert/strict";

import {
  looksLikeAnsibleInventoryYaml,
  parseAnsibleInventoryYaml,
} from "./ansibleInventoryYaml.ts";

const sampleYaml = `
all:
  hosts:
    web1:
      ansible_host: 10.0.0.10
      ansible_user: deploy
      ansible_port: 2222
  children:
    web:
      hosts:
        web1:
    db:
      hosts:
        db1:
          ansible_host: 10.0.0.20
          ansible_user: ubuntu
`;

test("looksLikeAnsibleInventoryYaml detects YAML inventory", () => {
  assert.equal(looksLikeAnsibleInventoryYaml(sampleYaml), true);
  assert.equal(looksLikeAnsibleInventoryYaml('{"version":1,"hosts":[]}'), false);
  assert.equal(looksLikeAnsibleInventoryYaml("[web]\nhost1"), false);
});

test("parseAnsibleInventoryYaml maps hosts and groups", () => {
  const doc = parseAnsibleInventoryYaml(sampleYaml);
  assert.equal(doc.version, 1);
  assert.equal(doc.hosts.length, 2);

  const web1 = doc.hosts.find((h) => h.id === "web1");
  assert.ok(web1);
  assert.equal(web1.hostname, "10.0.0.10");
  assert.equal(web1.username, "deploy");
  assert.equal(web1.port, 2222);

  const db1 = doc.hosts.find((h) => h.id === "db1");
  assert.ok(db1);
  assert.equal(db1.hostname, "10.0.0.20");
  assert.equal(db1.username, "ubuntu");
});

test("parseAnsibleInventoryYaml rejects secrets", () => {
  assert.throws(
    () => parseAnsibleInventoryYaml(`
all:
  hosts:
    bad:
      ansible_host: 1.2.3.4
      ansible_password: secret
`),
    /must not include secrets/,
  );
});

test("parseAnsibleInventoryYaml skips local connection", () => {
  const doc = parseAnsibleInventoryYaml(`
all:
  hosts:
    local:
      ansible_connection: local
    app:
      ansible_host: 10.1.1.1
`);
  assert.equal(doc.hosts.length, 1);
  assert.equal(doc.hosts[0]?.id, "app");
  assert.equal(doc.skippedLocal, 1);
});
