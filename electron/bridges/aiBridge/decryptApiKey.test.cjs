const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createLocalVault, ENC_PREFIX_V1, ENC_PREFIX_V2 } = require("../credentialBridge.cjs");
const { decryptApiKeyValue } = require("./decryptApiKey.cjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "magies-decrypt-key-"));
}

test("plaintext keys pass through unchanged", () => {
  assert.equal(decryptApiKeyValue("sk-live-real-key"), "sk-live-real-key");
  assert.equal(decryptApiKeyValue(""), "");
  assert.equal(decryptApiKeyValue(null), "");
});

test("enc:v1 decrypts via safeStorage", () => {
  const safeStorage = {
    isEncryptionAvailable: () => true,
    decryptString: (buf) => buf.toString("utf8").replace(/^cipher:/, ""),
  };
  const encrypted = `${ENC_PREFIX_V1}${Buffer.from("cipher:secret-key").toString("base64")}`;
  assert.equal(decryptApiKeyValue(encrypted, { safeStorage }), "secret-key");
});

test("enc:v1 never returns ciphertext when safeStorage is unavailable", () => {
  const encrypted = `${ENC_PREFIX_V1}${Buffer.from("cipher:secret").toString("base64")}`;
  const out = decryptApiKeyValue(encrypted, {
    safeStorage: { isEncryptionAvailable: () => false },
  });
  assert.equal(out, "");
  assert.doesNotMatch(out, /^enc:v1:/);
});

test("enc:v2 decrypts via local vault and never leaks ciphertext", () => {
  const dir = tempDir();
  const vault = createLocalVault({ userDataPath: dir });
  const encrypted = vault.encrypt("sk-from-local-vault");
  assert.match(encrypted, new RegExp(`^${ENC_PREFIX_V2}`));

  assert.equal(
    decryptApiKeyValue(encrypted, { userDataPath: dir }),
    "sk-from-local-vault",
  );

  assert.equal(
    decryptApiKeyValue(encrypted, { userDataPath: undefined }),
    "",
    "missing userData must not return enc:v2 blob",
  );
});

test("nested enc:v2(enc:v1) unwraps to the real key", () => {
  const dir = tempDir();
  const vault = createLocalVault({ userDataPath: dir });
  const safeStorage = {
    isEncryptionAvailable: () => true,
    decryptString: (buf) => buf.toString("utf8").replace(/^cipher:/, ""),
  };
  const inner = `${ENC_PREFIX_V1}${Buffer.from("cipher:sk-real-key").toString("base64")}`;
  const nested = vault.encrypt(inner);

  assert.equal(
    decryptApiKeyValue(nested, { safeStorage, userDataPath: dir }),
    "sk-real-key",
  );
});

test("fully decrypts a key nested up to the unwrap budget (no off-by-one drop)", () => {
  const dir = tempDir();
  const vault = createLocalVault({ userDataPath: dir });
  const safeStorage = {
    isEncryptionAvailable: () => true,
    decryptString: (buf) => buf.toString("utf8").replace(/^cipher:/, ""),
  };
  // enc:v2(enc:v2(enc:v2(enc:v1(key)))) — 4 layers = MAX_NESTED_DECRYPTS.
  let blob = `${ENC_PREFIX_V1}${Buffer.from("cipher:sk-deep-key").toString("base64")}`;
  for (let i = 0; i < 3; i++) blob = vault.encrypt(blob);

  assert.equal(
    decryptApiKeyValue(blob, { safeStorage, userDataPath: dir }),
    "sk-deep-key",
  );
});

test("fails closed when nesting exceeds the unwrap budget", () => {
  const dir = tempDir();
  const vault = createLocalVault({ userDataPath: dir });
  const safeStorage = {
    isEncryptionAvailable: () => true,
    decryptString: (buf) => buf.toString("utf8").replace(/^cipher:/, ""),
  };
  // 5 layers — one deeper than the budget.
  let blob = `${ENC_PREFIX_V1}${Buffer.from("cipher:sk-too-deep").toString("base64")}`;
  for (let i = 0; i < 4; i++) blob = vault.encrypt(blob);

  const out = decryptApiKeyValue(blob, { safeStorage, userDataPath: dir });
  assert.equal(out, "");
});

test("nested enc:v2(enc:v1) fails closed when the inner blob cannot be decrypted", () => {
  const dir = tempDir();
  const vault = createLocalVault({ userDataPath: dir });
  const inner = `${ENC_PREFIX_V1}${Buffer.from("v10-garbage").toString("base64")}`;
  const nested = vault.encrypt(inner);

  const out = decryptApiKeyValue(nested, {
    safeStorage: { isEncryptionAvailable: () => false },
    userDataPath: dir,
  });
  assert.equal(out, "", "must never send inner ciphertext as the API key");
});

test("failed enc:v1 decrypt returns empty string not base64 tail", () => {
  const safeStorage = {
    isEncryptionAvailable: () => true,
    decryptString: () => {
      throw new Error("bad key");
    },
  };
  const encrypted = `${ENC_PREFIX_V1}${Buffer.from("xxxx").toString("base64")}`;
  const out = decryptApiKeyValue(encrypted, { safeStorage });
  assert.equal(out, "");
});
