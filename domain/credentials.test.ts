import test from "node:test";
import assert from "node:assert/strict";

import {
  findSyncPayloadEncryptedCredentialPaths,
  isEncryptedCredentialPlaceholder,
  sanitizeCredentialValue,
} from "./credentials.ts";
import type { SyncPayload } from "./sync.ts";

// enc:v1 with macOS/Linux safeStorage "v10" header (djEw)
const ENC_V1 = "enc:v1:djEwAAAA";
// enc:v2 local vault: iv(12)+tag(16)+ct(>=1) packed as base64 (≥40 chars payload)
const ENC_V2 =
  "enc:v2:1feSzAIGRXzKDn3N0hT9JWhj7/wziizHekIt0jUJ1Yor";

test("isEncryptedCredentialPlaceholder recognizes enc:v1 safeStorage blobs", () => {
  assert.equal(isEncryptedCredentialPlaceholder(ENC_V1), true);
});

test("isEncryptedCredentialPlaceholder recognizes enc:v2 local vault blobs", () => {
  assert.equal(isEncryptedCredentialPlaceholder(ENC_V2), true);
});

test("isEncryptedCredentialPlaceholder recognizes Windows DPAPI enc:v1 blobs", () => {
  // DPAPI blob: bytes 01 00 00 00 D0 8C … base64-encode to "AQAAAN…".
  const dpapi = "enc:v1:" + Buffer.from([0x01, 0x00, 0x00, 0x00, 0xd0, 0x8c, 0x9d, 0xdf, 0x01]).toString("base64");
  assert.match(dpapi, /^enc:v1:AQAAAN/);
  assert.equal(isEncryptedCredentialPlaceholder(dpapi), true);
});

test("isEncryptedCredentialPlaceholder rejects plaintext and short/invalid prefixes", () => {
  assert.equal(isEncryptedCredentialPlaceholder("sk-live-real-key"), false);
  assert.equal(isEncryptedCredentialPlaceholder("enc:v1:not-base64!!!"), false);
  assert.equal(isEncryptedCredentialPlaceholder("enc:v2:short"), false);
  assert.equal(isEncryptedCredentialPlaceholder("enc:v2:!!!!"), false);
  assert.equal(isEncryptedCredentialPlaceholder(null), false);
  assert.equal(isEncryptedCredentialPlaceholder(undefined), false);
  assert.equal(isEncryptedCredentialPlaceholder(""), false);
});

test("sanitizeCredentialValue strips both enc:v1 and enc:v2", () => {
  assert.equal(sanitizeCredentialValue(ENC_V1), undefined);
  assert.equal(sanitizeCredentialValue(ENC_V2), undefined);
  assert.equal(sanitizeCredentialValue("real-password"), "real-password");
  assert.equal(sanitizeCredentialValue(undefined), undefined);
});

test("findSyncPayloadEncryptedCredentialPaths flags enc:v2 host passwords", () => {
  const payload = {
    hosts: [{ password: ENC_V2, telnetPassword: undefined }],
    keys: [{ privateKey: ENC_V2, passphrase: ENC_V1 }],
    identities: [{ password: ENC_V2 }],
    proxyProfiles: [{ config: { password: ENC_V2 } }],
    groupConfigs: [{ password: ENC_V1, telnetPassword: ENC_V2 }],
  } as unknown as SyncPayload;

  const paths = findSyncPayloadEncryptedCredentialPaths(payload);
  assert.ok(paths.includes("hosts[0].password"));
  assert.ok(paths.includes("keys[0].privateKey"));
  assert.ok(paths.includes("keys[0].passphrase"));
  assert.ok(paths.includes("identities[0].password"));
  assert.ok(paths.includes("proxyProfiles[0].config.password"));
  assert.ok(paths.includes("groupConfigs[0].password"));
  assert.ok(paths.includes("groupConfigs[0].telnetPassword"));
});
