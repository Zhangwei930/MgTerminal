import test from "node:test";
import assert from "node:assert/strict";
import { runCredentialSelfTest } from "./credentialSelfTest.ts";
import type { Host } from "../domain/models";

const STUCK_CIPHERTEXT = "enc:v1:djEwAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const host = (over: Partial<Host>): Host => ({
  id: "h1",
  label: "prod-server",
  hostname: "example.com",
  port: 22,
  username: "root",
  group: "",
  tags: [],
  os: "linux",
  protocol: "ssh",
  authMethod: "password",
  createdAt: 1,
  ...over,
});

test("self-test passes when round-trip works and vault decrypts", async () => {
  const result = await runCredentialSelfTest({
    encrypt: async (v) => `enc:v1:djEw${Buffer.from(v).toString("base64")}`,
    decrypt: async (v) =>
      v.startsWith("enc:v1:djEw")
        ? Buffer.from(v.slice("enc:v1:djEw".length), "base64").toString()
        : v,
    readVault: () => ({ hosts: [host({ password: "enc:v1:djEwcGFzcw==" })] }),
  });
  assert.equal(result.probe, "ok");
  assert.equal(result.checkedFields, 1);
  assert.deepEqual(result.issues, []);
});

test("self-test reports unavailable when bridge is missing", async () => {
  const result = await runCredentialSelfTest({
    encrypt: undefined,
    decrypt: undefined,
    readVault: () => ({}),
  });
  assert.equal(result.probe, "unavailable");
});

test("self-test reports mismatch when decrypt returns wrong plaintext", async () => {
  const result = await runCredentialSelfTest({
    encrypt: async () => STUCK_CIPHERTEXT,
    decrypt: async () => "garbage",
    readVault: () => ({}),
  });
  assert.equal(result.probe, "mismatch");
});

test("self-test reports probe failure when encrypt throws", async () => {
  const result = await runCredentialSelfTest({
    encrypt: async () => {
      throw new Error("keychain locked");
    },
    decrypt: async (v) => v,
    readVault: () => ({}),
  });
  assert.equal(result.probe, "failed");
});

test("self-test flags vault fields that stay ciphertext after decrypt", async () => {
  const result = await runCredentialSelfTest({
    encrypt: async (v) => `enc:v1:djEw${Buffer.from(v).toString("base64")}`,
    decrypt: async (v) => {
      if (v === STUCK_CIPHERTEXT) throw new Error("undecryptable");
      return v.startsWith("enc:v1:djEw")
        ? Buffer.from(v.slice("enc:v1:djEw".length), "base64").toString()
        : v;
    },
    readVault: () => ({
      hosts: [host({ password: STUCK_CIPHERTEXT })],
      keys: [],
    }),
  });
  assert.equal(result.probe, "ok");
  assert.equal(result.checkedFields, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].label, "prod-server");
  assert.equal(result.issues[0].field, "password");
});
