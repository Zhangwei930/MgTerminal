import assert from "node:assert/strict";
import test from "node:test";
import { classifySshKeyFile, collectSshKeyImportFiles } from "./sshKeyImportFiles";

const PRIVATE = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNza\n-----END OPENSSH PRIVATE KEY-----\n";
const RSA_PRIVATE = "-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----\n";
const PUBLIC = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 ada@laptop\n";
const CERT = "ssh-ed25519-cert-v01@openssh.com AAAAIHNzaC1lZDI1 ada@laptop\n";

test("classifySshKeyFile decides from content, since a cert is also a .pub", () => {
  assert.equal(classifySshKeyFile(PRIVATE), "privateKey");
  assert.equal(classifySshKeyFile(RSA_PRIVATE), "privateKey");
  assert.equal(classifySshKeyFile(PUBLIC), "publicKey");
  // The -cert-v01@openssh.com key type is what makes this one a certificate.
  assert.equal(classifySshKeyFile(CERT), "certificate");
});

test("classifySshKeyFile rejects anything it cannot place", () => {
  assert.equal(classifySshKeyFile("just some prose"), null);
  assert.equal(classifySshKeyFile(""), null);
});

test("collectSshKeyImportFiles pairs a key with its certificate", () => {
  const result = collectSshKeyImportFiles([
    { name: "id_ed25519", content: PRIVATE },
    { name: "id_ed25519.pub", content: PUBLIC },
    { name: "id_ed25519-cert.pub", content: CERT },
  ]);
  assert.equal(result.privateKey, PRIVATE);
  assert.equal(result.publicKey, PUBLIC);
  assert.equal(result.certificate, CERT);
  assert.equal(result.label, "id_ed25519");
});

test("collectSshKeyImportFiles works from a lone private key", () => {
  const result = collectSshKeyImportFiles([{ name: "deploy.pem", content: RSA_PRIVATE }]);
  assert.equal(result.privateKey, RSA_PRIVATE);
  assert.equal(result.publicKey, undefined);
  assert.equal(result.certificate, undefined);
  assert.equal(result.label, "deploy");
});

test("collectSshKeyImportFiles labels from the private key, not file order", () => {
  const result = collectSshKeyImportFiles([
    { name: "id_ed25519-cert.pub", content: CERT },
    { name: "id_ed25519", content: PRIVATE },
  ]);
  assert.equal(result.label, "id_ed25519");
});

test("collectSshKeyImportFiles ignores files it cannot classify", () => {
  const result = collectSshKeyImportFiles([
    { name: "README", content: "not a key" },
    { name: "id_ed25519", content: PRIVATE },
  ]);
  assert.equal(result.privateKey, PRIVATE);
});

test("collectSshKeyImportFiles keeps the first of each role", () => {
  const other = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3Blb2\n-----END OPENSSH PRIVATE KEY-----\n";
  const result = collectSshKeyImportFiles([
    { name: "first", content: PRIVATE },
    { name: "second", content: other },
  ]);
  assert.equal(result.privateKey, PRIVATE);
  assert.equal(result.label, "first");
});
