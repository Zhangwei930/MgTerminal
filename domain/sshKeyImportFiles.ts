/**
 * Sorting the files a user picks when importing an SSH identity.
 *
 * A key, its public half and its certificate all arrive as ordinary files with
 * unhelpful names, and a certificate is itself a `.pub` file — so the role has
 * to come from the content, not the extension.
 */

export type SshKeyFileRole = "privateKey" | "publicKey" | "certificate";

export interface SshKeyImportFile {
  name: string;
  content: string;
}

export interface SshKeyImportSelection {
  privateKey?: string;
  publicKey?: string;
  certificate?: string;
  /** Suggested label, taken from the private key's filename. */
  label?: string;
}

const PRIVATE_KEY_MARKER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/;
const CERTIFICATE_MARKER = "-cert-v01@openssh.com";
const PUBLIC_KEY_MARKER = /^(ssh-|ecdsa-|sk-)/;

export function classifySshKeyFile(content: string): SshKeyFileRole | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (PRIVATE_KEY_MARKER.test(trimmed)) return "privateKey";
  // Checked before the public-key case: every certificate also looks like one.
  if (trimmed.includes(CERTIFICATE_MARKER)) return "certificate";
  if (PUBLIC_KEY_MARKER.test(trimmed)) return "publicKey";
  return null;
}

/** Strip the extensions ssh tooling uses so the label reads like the key name. */
function labelFromFileName(fileName: string): string {
  return fileName.replace(/\.(pem|key|pub|ppk)$/i, "");
}

export function collectSshKeyImportFiles(
  files: SshKeyImportFile[],
): SshKeyImportSelection {
  const selection: SshKeyImportSelection = {};
  for (const file of files) {
    const role = classifySshKeyFile(file.content);
    if (!role || selection[role] !== undefined) continue;
    selection[role] = file.content;
    if (role === "privateKey") selection.label = labelFromFileName(file.name);
  }
  return selection;
}
