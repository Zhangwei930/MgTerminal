import assert from "node:assert/strict";
import test from "node:test";

import { isFido2SecurityKey } from "./fido2KeyDetect.ts";

function makeOpensshPrivateKey(keyType: string): string {
  const payload = `openssh-key-v1\x00none\x00${keyType}\x00fakekeydata`;
  const base64 = Buffer.from(payload, "binary").toString("base64");
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${base64}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

test("detects sk- private keys inside the OpenSSH envelope", () => {
  assert.equal(isFido2SecurityKey(makeOpensshPrivateKey("sk-ssh-ed25519@openssh.com")), true);
  assert.equal(isFido2SecurityKey(makeOpensshPrivateKey("sk-ecdsa-sha2-nistp256@openssh.com")), true);
});

test("detects sk- public key lines", () => {
  assert.equal(
    isFido2SecurityKey("sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5 user@host"),
    true,
  );
  assert.equal(
    isFido2SecurityKey("sk-ecdsa-sha2-nistp256@openssh.com AAAA22 user@host"),
    true,
  );
});

test("regular keys are not flagged", () => {
  assert.equal(isFido2SecurityKey(makeOpensshPrivateKey("ssh-ed25519")), false);
  assert.equal(isFido2SecurityKey("ssh-ed25519 AAAAC3Nza user@host"), false);
  assert.equal(
    isFido2SecurityKey("-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n-----END RSA PRIVATE KEY-----"),
    false,
  );
});

test("handles empty and malformed input", () => {
  assert.equal(isFido2SecurityKey(""), false);
  assert.equal(isFido2SecurityKey(undefined), false);
  assert.equal(isFido2SecurityKey(null), false);
  assert.equal(
    isFido2SecurityKey("-----BEGIN OPENSSH PRIVATE KEY-----\n%%%not-base64%%%\n-----END OPENSSH PRIVATE KEY-----"),
    false,
  );
});
