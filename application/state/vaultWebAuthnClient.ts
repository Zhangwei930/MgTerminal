/**
 * Renderer helper for device-bound WebAuthn vault unlock.
 * Main process issues challenges and verifies assertions.
 */

import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";
import {
  buildWebAuthnCreateOptions,
  buildWebAuthnGetOptions,
} from "../../domain/vaultWebAuthn";

function b64urlFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bufferFromB64url(value: string): ArrayBuffer {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function resolveRpId(): string {
  try {
    const host = globalThis.location?.hostname;
    if (host && host !== "") return host;
  } catch {
    // ignore
  }
  return "localhost";
}

export function isWebAuthnAvailable(): boolean {
  return typeof globalThis.PublicKeyCredential !== "undefined"
    && typeof navigator.credentials?.create === "function"
    && typeof navigator.credentials?.get === "function";
}

export async function registerVaultWebAuthn(): Promise<{ success: boolean; error?: string }> {
  const bridge = magiesTerminalBridge.get();
  if (!bridge?.vaultBeginWebAuthnChallenge || !bridge.vaultCompleteWebAuthnRegistration) {
    return { success: false, error: "bridge_unavailable" };
  }
  if (!isWebAuthnAvailable()) return { success: false, error: "webauthn_unavailable" };

  const challengeRes = await bridge.vaultBeginWebAuthnChallenge({ purpose: "register" });
  if (!challengeRes?.success) {
    return { success: false, error: challengeRes?.error || "challenge_failed" };
  }

  const rpId = resolveRpId();
  const options = buildWebAuthnCreateOptions({
    challenge: {
      challengeId: challengeRes.challengeId,
      challenge: challengeRes.challenge,
      expiresAt: challengeRes.expiresAt,
      purpose: "register",
    },
    rpId,
    userId: b64urlFromBuffer(crypto.getRandomValues(new Uint8Array(16)).buffer),
    userName: "magies-local",
    userDisplayName: "MagiesTerminal",
  });

  // Convert base64url fields to ArrayBuffer for the WebAuthn API.
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: bufferFromB64url(String(options.challenge)),
    user: {
      ...(options.user as PublicKeyCredentialUserEntity),
      id: bufferFromB64url(String((options.user as { id: string }).id)),
    },
  } as PublicKeyCredentialCreationOptions;

  let credential: PublicKeyCredential;
  try {
    credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "create_failed",
    };
  }
  if (!credential) return { success: false, error: "create_empty" };

  const attestation = credential.response as AuthenticatorAttestationResponse;
  const publicKeySpki = typeof attestation.getPublicKey === "function"
    ? attestation.getPublicKey()
    : null;
  if (!publicKeySpki) return { success: false, error: "no_public_key" };
  const algorithm = typeof attestation.getPublicKeyAlgorithm === "function"
    ? attestation.getPublicKeyAlgorithm()
    : -7;

  const result = await bridge.vaultCompleteWebAuthnRegistration({
    challengeId: challengeRes.challengeId,
    challenge: challengeRes.challenge,
    credentialId: b64urlFromBuffer(credential.rawId),
    publicKeySpki: b64urlFromBuffer(publicKeySpki),
    rpId,
    algorithm,
    transports: typeof (attestation as { getTransports?: () => string[] }).getTransports === "function"
      ? (attestation as { getTransports: () => string[] }).getTransports()
      : undefined,
  });
  return result?.success
    ? { success: true }
    : { success: false, error: result?.error || "register_failed" };
}

export async function unlockVaultWithWebAuthn(): Promise<boolean> {
  const bridge = magiesTerminalBridge.get();
  if (!bridge?.vaultBeginWebAuthnChallenge || !bridge.vaultUnlockWithWebAuthn) {
    return false;
  }
  if (!isWebAuthnAvailable()) return false;

  const challengeRes = await bridge.vaultBeginWebAuthnChallenge({ purpose: "assert" });
  if (!challengeRes?.success || !challengeRes.credential) return false;

  const options = buildWebAuthnGetOptions({
    challenge: {
      challengeId: challengeRes.challengeId,
      challenge: challengeRes.challenge,
      expiresAt: challengeRes.expiresAt,
      purpose: "assert",
    },
    rpId: challengeRes.credential.rpId || resolveRpId(),
    credential: challengeRes.credential,
  });

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: bufferFromB64url(String(options.challenge)),
    rpId: String(options.rpId),
    allowCredentials: (options.allowCredentials as Array<{ id: string; type: string; transports?: string[] }>).map(
      (c) => ({
        type: "public-key" as const,
        id: bufferFromB64url(c.id),
        transports: c.transports as AuthenticatorTransport[] | undefined,
      }),
    ),
    userVerification: "required",
    timeout: 60_000,
  };

  let credential: PublicKeyCredential;
  try {
    credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
  } catch {
    return false;
  }
  if (!credential) return false;
  const assertion = credential.response as AuthenticatorAssertionResponse;
  const result = await bridge.vaultUnlockWithWebAuthn({
    challengeId: challengeRes.challengeId,
    authenticatorData: b64urlFromBuffer(assertion.authenticatorData),
    clientDataJSON: b64urlFromBuffer(assertion.clientDataJSON),
    signature: b64urlFromBuffer(assertion.signature),
  });
  return Boolean(result?.success);
}
