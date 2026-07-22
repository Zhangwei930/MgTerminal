import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHostFieldMapping,
  isSecretSourceField,
  validateHostFieldMapping,
} from "./hostFieldMapping";

test("applyHostFieldMapping renames source fields onto the canonical ones", () => {
  const mapped = applyHostFieldMapping(
    { name: "App server", ip: "10.0.0.5", ssh_port: 2222, owner: "deploy" },
    { label: "name", hostname: "ip", port: "ssh_port", username: "owner" },
  );
  assert.equal(mapped.label, "App server");
  assert.equal(mapped.hostname, "10.0.0.5");
  assert.equal(mapped.port, 2222);
  assert.equal(mapped.username, "deploy");
});

test("applyHostFieldMapping keeps fields that already use canonical names", () => {
  const mapped = applyHostFieldMapping(
    { id: "h1", hostname: "a.example.com", ip: "10.0.0.5" },
    { hostname: "ip" },
  );
  assert.equal(mapped.id, "h1", "unmapped keys survive");
  // An explicit mapping wins over a same-named field, otherwise the mapping
  // would appear to be ignored.
  assert.equal(mapped.hostname, "10.0.0.5");
});

test("applyHostFieldMapping ignores entries whose source field is absent", () => {
  const mapped = applyHostFieldMapping({ hostname: "a" }, { label: "missing" });
  assert.equal(mapped.label, undefined);
  assert.equal(mapped.hostname, "a");
});

test("applyHostFieldMapping is a no-op for an empty mapping", () => {
  const item = { id: "h1", hostname: "a" };
  assert.deepEqual(applyHostFieldMapping(item, {}), item);
  assert.deepEqual(applyHostFieldMapping(item, undefined), item);
});

test("isSecretSourceField recognises the keys the inventory already forbids", () => {
  for (const field of ["password", "Password", "passphrase", "privateKey", "private_key", "secret", "token", "apiKey", "api_key"]) {
    assert.equal(isSecretSourceField(field), true, field);
  }
  for (const field of ["hostname", "ip", "owner", "notes"]) {
    assert.equal(isSecretSourceField(field), false, field);
  }
});

test("validateHostFieldMapping refuses to read a canonical field from a secret", () => {
  // Without this, `hostname: "password"` copies the secret's value into a
  // field that IS allowed, and the key-based secret check sees nothing wrong
  // because the forbidden key no longer appears in the mapped object.
  const result = validateHostFieldMapping({ hostname: "password" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.field, "hostname");
  assert.equal(result.ok === false && result.sourceField, "password");
});

test("validateHostFieldMapping accepts an ordinary mapping", () => {
  assert.equal(validateHostFieldMapping({ label: "name", hostname: "ip" }).ok, true);
  assert.equal(validateHostFieldMapping({}).ok, true);
  assert.equal(validateHostFieldMapping(undefined).ok, true);
});

test("validateHostFieldMapping ignores blank source fields", () => {
  assert.equal(validateHostFieldMapping({ label: "  ", hostname: "ip" }).ok, true);
});

test("applyHostFieldMapping does not strip a forbidden key it was not asked about", () => {
  // Mapping is a rename, not a sanitiser: the inventory's own secret check
  // still has to see the raw payload and reject it.
  const mapped = applyHostFieldMapping(
    { hostname: "a", password: "hunter2" },
    { label: "hostname" },
  );
  assert.equal(mapped.password, "hunter2");
});

test("a mapping cannot launder a secret past the inventory check", async () => {
  const { parseHostInventoryDocument } = await import("./hostDataSource");
  const raw = JSON.stringify({
    version: 1,
    hosts: [{ id: "h1", ip: "10.0.0.5", password: "hunter2" }],
  });

  // Even asked to read hostname from a harmless field, the raw payload still
  // carries a forbidden key and must be rejected.
  assert.throws(
    () => parseHostInventoryDocument(raw, { hostname: "ip" }),
    /must not include secrets/i,
  );

  // And a mapping that reads *from* the secret is refused outright.
  assert.throws(
    () => parseHostInventoryDocument(
      JSON.stringify({ version: 1, hosts: [{ id: "h1", ip: "10.0.0.5" }] }),
      { hostname: "password" },
    ),
    /secret/i,
  );
});

test("parseHostInventoryDocument applies a mapping to non-canonical feeds", async () => {
  const { parseHostInventoryDocument } = await import("./hostDataSource");
  const doc = parseHostInventoryDocument(
    JSON.stringify({ version: 1, hosts: [{ ref: "h1", name: "App", ip: "10.0.0.5", ssh_port: "2222" }] }),
    { id: "ref", label: "name", hostname: "ip", port: "ssh_port" },
  );
  assert.equal(doc.hosts.length, 1);
  assert.equal(doc.hosts[0]?.id, "h1");
  assert.equal(doc.hosts[0]?.label, "App");
  assert.equal(doc.hosts[0]?.hostname, "10.0.0.5");
  assert.equal(doc.hosts[0]?.port, 2222);
});

test("createJsonManagedSource stores a mapping and refuses a secret source", async () => {
  const { createJsonManagedSource } = await import("./hostDataSource");
  const base = { type: "json_http" as const, filePath: "https://x/i.json", groupName: "Inv" };

  const source = createJsonManagedSource({ ...base, fieldMapping: { hostname: "ip", label: "name" } });
  assert.deepEqual(source.fieldMapping, { hostname: "ip", label: "name" });

  // Blank entries are dropped rather than stored as noise.
  assert.equal(
    createJsonManagedSource({ ...base, fieldMapping: { hostname: "  " } }).fieldMapping,
    undefined,
  );

  // The same guard as the parser: configuring this must fail loudly, not at
  // the next sync.
  assert.throws(
    () => createJsonManagedSource({ ...base, fieldMapping: { hostname: "password" } }),
    /secret/i,
  );
});
