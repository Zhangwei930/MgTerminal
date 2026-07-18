import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import {
  buildWebAuthnCreateOptions,
  buildWebAuthnGetOptions,
  createWebAuthnChallenge,
  isWebAuthnChallengeExpired,
  normalizeVaultWebAuthnCredential,
  verifyWebAuthnAssertionEs256,
} from "./vaultWebAuthn";

test("challenge expires", () => {
  const c = createWebAuthnChallenge({ purpose: "assert", now: 1000, ttlMs: 100 });
  assert.equal(isWebAuthnChallengeExpired(c, 1099), false);
  assert.equal(isWebAuthnChallengeExpired(c, 1100), true);
});

test("create/get options include challenge and platform UV", () => {
  const challenge = createWebAuthnChallenge({ purpose: "register" });
  const create = buildWebAuthnCreateOptions({
    challenge,
    rpId: "localhost",
    userId: "user-1",
    userName: "local",
  });
  assert.equal(create.challenge, challenge.challenge);
  assert.equal((create.authenticatorSelection as { userVerification: string }).userVerification, "required");

  const cred = {
    credentialId: "abc",
    publicKeySpki: "dead",
    rpId: "localhost",
    algorithm: -7,
    createdAt: 1,
  };
  const get = buildWebAuthnGetOptions({ challenge, rpId: "localhost", credential: cred });
  assert.equal(
    (get.allowCredentials as Array<{ id: string }>)[0]!.id,
    "abc",
  );
});

test("normalizeVaultWebAuthnCredential rejects incomplete records", () => {
  assert.equal(normalizeVaultWebAuthnCredential(null), null);
  assert.equal(normalizeVaultWebAuthnCredential({ credentialId: "x" }), null);
  const ok = normalizeVaultWebAuthnCredential({
    credentialId: "cid",
    publicKeySpki: "pk",
    rpId: "localhost",
    algorithm: -7,
    createdAt: 1,
  });
  assert.ok(ok);
  assert.equal(ok!.credentialId, "cid");
});

test("verifyWebAuthnAssertionEs256 accepts a crafted ES256 assertion", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const rpId = "localhost";
  const challenge = "test-challenge-b64url";

  const clientData = Buffer.from(
    JSON.stringify({
      type: "webauthn.get",
      challenge,
      origin: "http://localhost",
    }),
    "utf8",
  );
  const rpHash = crypto.createHash("sha256").update(rpId).digest();
  const flags = Buffer.from([0x05]); // UP | UV
  const counter = Buffer.alloc(4);
  const authData = Buffer.concat([rpHash, flags, counter]);
  const clientHash = crypto.createHash("sha256").update(clientData).digest();
  const signed = Buffer.concat([authData, clientHash]);
  const signature = crypto.sign("sha256", signed, privateKey);

  const ok = verifyWebAuthnAssertionEs256(
    {
      publicKeySpki: spki.toString("base64url"),
      authenticatorDataB64: authData.toString("base64url"),
      clientDataJSONB64: clientData.toString("base64url"),
      signatureB64: signature.toString("base64url"),
      expectedChallenge: challenge,
      expectedRpId: rpId,
    },
    crypto,
  );
  assert.equal(ok, true);

  const bad = verifyWebAuthnAssertionEs256(
    {
      publicKeySpki: spki.toString("base64url"),
      authenticatorDataB64: authData.toString("base64url"),
      clientDataJSONB64: clientData.toString("base64url"),
      signatureB64: signature.toString("base64url"),
      expectedChallenge: "wrong",
      expectedRpId: rpId,
    },
    crypto,
  );
  assert.equal(bad, false);
});
