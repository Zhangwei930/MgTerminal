"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { _loadProbeKey } = require("./connectionDiagnosticsBridge.cjs");

// Realistic fixtures: looksLikePrivateKey wants a "-----BEGIN" opener, and
// isKeyEncrypted detects legacy PEM encryption via Proc-Type/ENCRYPTED.
const PLAIN_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIEfake\n-----END RSA PRIVATE KEY-----\n";
const ENCRYPTED_KEY = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "Proc-Type: 4,ENCRYPTED",
  "DEK-Info: AES-128-CBC,ABCD",
  "",
  "MIIEfake",
  "-----END RSA PRIVATE KEY-----",
  "",
].join("\n");

function withTempKey(content, name = "id_test") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-key-test-"));
  const keyPath = path.join(dir, name);
  fs.writeFileSync(keyPath, content, { mode: 0o600 });
  return { dir, keyPath };
}

test("loadProbeKey actually reads a key file from disk", async () => {
  // readFileNoFollow is async; loadProbeKey called it without await, so the
  // "content" it examined was a Promise, looksLikePrivateKey rejected it, and
  // every identity-file key was silently skipped. The probe then had nothing
  // to offer and ssh2 reported "All configured authentication methods failed"
  // for hosts that connect fine in the terminal.
  const { dir, keyPath } = withTempKey(PLAIN_KEY);
  try {
    const probe = await _loadProbeKey({ identityFilePaths: [keyPath] });
    assert.equal(probe.privateKey, PLAIN_KEY, "the key on disk must be offered");
    assert.equal(probe.hasConfiguredKey, true);
    assert.equal(probe.encryptedKeySkipped, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadProbeKey flags an encrypted key it has no passphrase for", async () => {
  const { dir, keyPath } = withTempKey(ENCRYPTED_KEY);
  try {
    const probe = await _loadProbeKey({ identityFilePaths: [keyPath] });
    assert.equal(probe.privateKey, undefined);
    assert.equal(probe.encryptedKeySkipped, true, "the skip reason must survive");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadProbeKey uses the passphrase when one is supplied", async () => {
  const { dir, keyPath } = withTempKey(ENCRYPTED_KEY);
  try {
    const probe = await _loadProbeKey({ identityFilePaths: [keyPath], passphrase: "pp" });
    assert.equal(probe.privateKey, ENCRYPTED_KEY);
    assert.equal(probe.passphrase, "pp");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadProbeKey skips files that are not keys and reads the next one", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-key-test-"));
  const notKey = path.join(dir, "known_hosts");
  const realKey = path.join(dir, "id_real");
  fs.writeFileSync(notKey, "github.com ssh-ed25519 AAAA...\n");
  fs.writeFileSync(realKey, PLAIN_KEY, { mode: 0o600 });
  try {
    const probe = await _loadProbeKey({ identityFilePaths: [notKey, realKey] });
    assert.equal(probe.privateKey, PLAIN_KEY);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an inline private key still short-circuits the file scan", async () => {
  const probe = await _loadProbeKey({ privateKey: PLAIN_KEY, identityFilePaths: ["/nope"] });
  assert.equal(probe.privateKey, PLAIN_KEY);
});
