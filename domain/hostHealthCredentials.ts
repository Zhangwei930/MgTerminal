/**
 * Detecting credentials that are configured but still ciphertext.
 *
 * decryptField returns the stored value unchanged when the keychain cannot
 * decrypt it — deliberately, so a later repair can still recover it — and the
 * vault also holds placeholders while platform unlock is pending. Either way a
 * host can reach the health check carrying enc:v1 / enc:v2 strings, which
 * buildConnectionDiagnosticsRequest then drops via sanitizeCredentialValue.
 *
 * The probe therefore connects with no credential at all and the server
 * answers "All configured authentication methods failed" — blaming the
 * credentials or the host for what is really a local decryption problem.
 */

import { isEncryptedCredentialPlaceholder } from "./credentials";
import type { Host, Identity, SSHKey } from "./models";

/**
 * True when the host has at least one configured credential and every one of
 * them is still an encrypted placeholder.
 *
 * Configuring nothing is not reported: agent and identity-file auth are
 * legitimate, and claiming their credentials are encrypted would be a false
 * alarm. A passphrase is not counted on its own — without a key it unlocks
 * nothing.
 */
export function hasOnlyEncryptedCredentials(
  host: Host,
  keys: SSHKey[],
  identities: Identity[],
): boolean {
  const identity = host.identityId
    ? identities.find((candidate) => candidate.id === host.identityId)
    : undefined;
  const keyId = host.keyId || identity?.keyId;
  const key = keyId ? keys.find((candidate) => candidate.id === keyId) : undefined;

  const credentials = [host.password, identity?.password, key?.privateKey]
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  if (credentials.length === 0) return false;
  return credentials.every(isEncryptedCredentialPlaceholder);
}
