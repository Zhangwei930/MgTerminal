const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createVaultUnlockGate } = require("./vaultUnlockGate.cjs");

test("webauthn register + assertion unlocks the vault gate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-wa-"));
  const gate = createVaultUnlockGate({ userDataPath: dir });
  assert.equal(gate.configure({ pin: "1234" }).success, true);
  gate.lock();
  assert.equal(gate.status().locked, true);

  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const reg = gate.beginWebAuthnChallenge("register");
  assert.equal(reg.success, true);
  const done = gate.completeWebAuthnRegistration({
    challengeId: reg.challengeId,
    challenge: reg.challenge,
    credentialId: "cid",
    publicKeySpki: spki.toString("base64url"),
    rpId: "localhost",
    algorithm: -7,
  });
  assert.equal(done.success, true);
  gate.lock();
  assert.equal(gate.status().hasWebAuthn, true);

  const ch = gate.beginWebAuthnChallenge("assert");
  const clientData = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge: ch.challenge,
      origin: "http://localhost",
    }),
    "utf8",
  );
  const rpHash = crypto.createHash("sha256").update("localhost").digest();
  const authData = Buffer.concat([rpHash, Buffer.from([0x05]), Buffer.alloc(4)]);
  const clientHash = crypto.createHash("sha256").update(clientData).digest();
  const signed = Buffer.concat([authData, clientHash]);
  const signature = crypto.sign("sha256", signed, privateKey);
  const unlocked = gate.unlockWithWebAuthn({
    challengeId: ch.challengeId,
    authenticatorData: authData.toString("base64url"),
    clientDataJSON: clientData.toString("base64url"),
    signature: signature.toString("base64url"),
  });
  assert.equal(unlocked.success, true);
  assert.equal(gate.status().locked, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
