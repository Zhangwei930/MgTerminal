import assert from "node:assert/strict";
import test from "node:test";
import type { Host } from "./models";
import { hasOnlyEncryptedCredentials } from "./hostHealthCredentials";

const host = (over: Partial<Host>): Host => ({
  id: "h1", label: "app", hostname: "a.example.com", port: 22,
  username: "root", protocol: "ssh", ...over,
} as Host);

// Must satisfy the real placeholder check: enc:v2 + base64 over the minimum
// length. A short stub silently fails isEncryptedCredentialPlaceholder and
// would make these tests pass for the wrong reason.
const ENC = `enc:v2:${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVph".repeat(2)}`;

test("a host whose password is still ciphertext is reported", () => {
  // decryptField deliberately returns the stored ciphertext when the keychain
  // cannot decrypt it, so this state reaches the health check intact.
  assert.equal(hasOnlyEncryptedCredentials(host({ password: ENC }), [], []), true);
});

test("a host with a usable credential is not reported", () => {
  assert.equal(hasOnlyEncryptedCredentials(host({ password: "hunter2" }), [], []), false);
});

test("a host with no configured credential at all is not reported", () => {
  // Agent or identity-file auth is legitimate; claiming its credentials are
  // encrypted would be a false alarm.
  assert.equal(hasOnlyEncryptedCredentials(host({}), [], []), false);
});

test("a referenced key that is still ciphertext is reported", () => {
  const keys = [{ id: "k1", label: "k", type: "ED25519", privateKey: ENC, source: "imported", category: "key", created: 0 }] as never;
  assert.equal(hasOnlyEncryptedCredentials(host({ keyId: "k1" }), keys, []), true);
});

test("a mix of one usable and one encrypted credential is not reported", () => {
  const keys = [{ id: "k1", label: "k", type: "ED25519", privateKey: ENC, source: "imported", category: "key", created: 0 }] as never;
  assert.equal(
    hasOnlyEncryptedCredentials(host({ keyId: "k1", password: "hunter2" }), keys, []),
    false,
    "the password still works, so the probe is worth running",
  );
});

test("an encrypted passphrase alone does not count as a credential", () => {
  // A passphrase without a key unlocks nothing; it must not trigger the notice.
  assert.equal(hasOnlyEncryptedCredentials(host({ passphrase: ENC }), [], []), false);
});
