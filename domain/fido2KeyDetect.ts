/**
 * FIDO2 security-key (sk-*) SSH key detection.
 *
 * ssh2 cannot parse `sk-ssh-ed25519@openssh.com` / `sk-ecdsa-sha2-*` private
 * keys (they need a hardware token via ssh-agent), so importing one only
 * produces a cryptic parse failure at connect time. Detecting them up front
 * lets the UI steer the user to ssh-agent authentication instead.
 */

const SK_KEY_TYPES = [
  "sk-ssh-ed25519@openssh.com",
  "sk-ecdsa-sha2-nistp256@openssh.com",
] as const;

const SK_PUBLIC_KEY_RE = /^sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com\s/;

export function isFido2SecurityKey(keyText: string | undefined | null): boolean {
  if (!keyText) return false;
  const trimmed = keyText.trim();
  if (!trimmed) return false;

  // Public key line: "sk-ssh-ed25519@openssh.com AAAA... comment"
  if (SK_PUBLIC_KEY_RE.test(trimmed)) return true;

  // OpenSSH private key: the key type string sits inside the base64 payload.
  if (!trimmed.includes("BEGIN OPENSSH PRIVATE KEY")) return false;
  const base64 = trimmed
    .replace(/-----(BEGIN|END) OPENSSH PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  try {
    const decoded = atob(base64);
    return SK_KEY_TYPES.some((type) => decoded.includes(type));
  } catch {
    return false;
  }
}
