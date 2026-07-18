/**
 * Device-bound WebAuthn / platform passkey for vault unlock (local-first MVP).
 *
 * Stores only public credential metadata. Unlock still goes through the main
 * process gate after challenge verification — not a portable cloud identity.
 */

export type VaultWebAuthnCredential = {
  /** Base64url credential id from the authenticator. */
  credentialId: string;
  /** SPKI public key as base64url (ECDSA P-256 preferred). */
  publicKeySpki: string;
  /** Relying party id used at registration. */
  rpId: string;
  /** COSE algorithm (e.g. -7 = ES256). */
  algorithm: number;
  createdAt: number;
  transports?: string[];
};

export type VaultWebAuthnChallenge = {
  challengeId: string;
  /** Base64url random challenge bytes. */
  challenge: string;
  expiresAt: number;
  purpose: "register" | "assert";
};

export const VAULT_WEBAUTHN_RP_NAME = "MagiesTerminal";
export const VAULT_WEBAUTHN_CHALLENGE_TTL_MS = 120_000;
export const VAULT_WEBAUTHN_ES256 = -7;

export function createWebAuthnChallenge(input: {
  purpose: "register" | "assert";
  now?: number;
  ttlMs?: number;
}): VaultWebAuthnChallenge {
  const now = input.now ?? Date.now();
  return {
    challengeId: randomId(8),
    challenge: randomId(32),
    expiresAt: now + (input.ttlMs ?? VAULT_WEBAUTHN_CHALLENGE_TTL_MS),
    purpose: input.purpose,
  };
}

export function isWebAuthnChallengeExpired(
  challenge: Pick<VaultWebAuthnChallenge, "expiresAt">,
  now = Date.now(),
): boolean {
  return !Number.isFinite(challenge.expiresAt) || challenge.expiresAt <= now;
}

/** Build PublicKeyCredentialCreationOptions (JSON-friendly, base64url fields). */
export function buildWebAuthnCreateOptions(input: {
  challenge: VaultWebAuthnChallenge;
  rpId: string;
  userId: string;
  userName: string;
  userDisplayName?: string;
}): Record<string, unknown> {
  return {
    challenge: input.challenge.challenge,
    rp: { id: input.rpId, name: VAULT_WEBAUTHN_RP_NAME },
    user: {
      id: input.userId,
      name: input.userName,
      displayName: input.userDisplayName || input.userName,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: VAULT_WEBAUTHN_ES256 },
      { type: "public-key", alg: -257 }, // RS256 fallback
    ],
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
      requireResidentKey: false,
    },
    timeout: 60_000,
    attestation: "none",
  };
}

/** Build PublicKeyCredentialRequestOptions for assertion. */
export function buildWebAuthnGetOptions(input: {
  challenge: VaultWebAuthnChallenge;
  rpId: string;
  credential: VaultWebAuthnCredential;
}): Record<string, unknown> {
  return {
    challenge: input.challenge.challenge,
    rpId: input.rpId,
    allowCredentials: [
      {
        type: "public-key",
        id: input.credential.credentialId,
        transports: input.credential.transports,
      },
    ],
    userVerification: "required",
    timeout: 60_000,
  };
}

export function normalizeVaultWebAuthnCredential(
  value: unknown,
): VaultWebAuthnCredential | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.credentialId !== "string" || !rec.credentialId) return null;
  if (typeof rec.publicKeySpki !== "string" || !rec.publicKeySpki) return null;
  if (typeof rec.rpId !== "string" || !rec.rpId) return null;
  const algorithm = Number(rec.algorithm);
  return {
    credentialId: rec.credentialId,
    publicKeySpki: rec.publicKeySpki,
    rpId: rec.rpId,
    algorithm: Number.isFinite(algorithm) ? algorithm : VAULT_WEBAUTHN_ES256,
    createdAt: Number(rec.createdAt) || 0,
    transports: Array.isArray(rec.transports)
      ? rec.transports.filter((t): t is string => typeof t === "string")
      : undefined,
  };
}

/**
 * Verify authenticatorData + clientDataJSON signature (ES256).
 * Node/Electron only (uses node:crypto). Returns false on any failure.
 *
 * Crypto is injected so this stays testable under ESM (tsx) without bare require.
 */
export function verifyWebAuthnAssertionEs256(
  input: {
    publicKeySpki: string;
    authenticatorDataB64: string;
    clientDataJSONB64: string;
    signatureB64: string;
    expectedChallenge: string;
    expectedRpId: string;
    expectedOriginPrefixes?: string[];
  },
  cryptoNode?: typeof import("node:crypto") | null,
): boolean {
  try {
    const nodeCrypto = cryptoNode ?? loadNodeCrypto();
    if (!nodeCrypto) return false;
    cryptoNode = nodeCrypto;
    const clientData = Buffer.from(input.clientDataJSONB64, "base64url");
    const client = JSON.parse(clientData.toString("utf8")) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
    if (client.type !== "webauthn.get") return false;
    if (client.challenge !== input.expectedChallenge) return false;
    if (typeof client.origin !== "string" || !client.origin) return false;
    // Electron origins vary (file://, app://, http://localhost); accept common prefixes.
    const prefixes = input.expectedOriginPrefixes || [
      "file://",
      "app://",
      "http://localhost",
      "https://localhost",
      "http://127.0.0.1",
    ];
    if (!prefixes.some((p) => client.origin!.startsWith(p) || client.origin === p)) {
      // Still allow custom schemes containing "magies" / "electron"
      if (!/magies|electron/i.test(client.origin)) return false;
    }

    const authData = Buffer.from(input.authenticatorDataB64, "base64url");
    if (authData.length < 37) return false;
    // RP ID hash is first 32 bytes of authenticatorData
    const rpHash = authData.subarray(0, 32);
    const expectedRpHash = nodeCrypto.createHash("sha256").update(input.expectedRpId).digest();
    if (!nodeCrypto.timingSafeEqual(rpHash, expectedRpHash)) return false;
    // User present + user verified flags
    const flags = authData[32]!;
    if ((flags & 0x01) === 0) return false; // UP
    if ((flags & 0x04) === 0) return false; // UV

    const clientHash = nodeCrypto.createHash("sha256").update(clientData).digest();
    const signed = Buffer.concat([authData, clientHash]);
    const signature = Buffer.from(input.signatureB64, "base64url");
    // WebAuthn ES256 signatures are ASN.1 DER
    const key = nodeCrypto.createPublicKey({
      key: Buffer.from(input.publicKeySpki, "base64url"),
      format: "der",
      type: "spki",
    });
    return nodeCrypto.verify("sha256", signed, key, signature);
  } catch {
    return false;
  }
}

function loadNodeCrypto(): typeof import("node:crypto") | undefined {
  try {
    return require("node:crypto");
  } catch {
    try {
      // ESM / tsx path
      const { createRequire } = require("node:module");
      return createRequire(import.meta.url)("node:crypto");
    } catch {
      return undefined;
    }
  }
}

function randomId(bytes: number): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buf = new Uint8Array(bytes);
    cryptoApi.getRandomValues(buf);
    // base64url without padding
    if (typeof Buffer !== "undefined") {
      return Buffer.from(buf).toString("base64url");
    }
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  return `x${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}
