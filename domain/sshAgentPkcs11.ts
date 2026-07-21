/**
 * PKCS#11 → ssh-agent load helpers (productized OpenSC / smartcard path).
 * Does not implement PKCS#11 itself — only validates paths and documents
 * the ssh-add -s/-e contract MagiesTerminal shells out to.
 */

export type SshAddPkcs11Action = "add" | "remove";

export function isPkcs11AgentLoadSupported(platform: string = process.platform): boolean {
  return platform === "darwin" || platform === "linux";
}

export function isLikelyPkcs11ModulePath(filePath: string): boolean {
  const value = String(filePath || "").trim();
  if (!value) return false;
  // Absolute or home-relative; reject bare names that could be shell injection bait.
  if (value.includes("\0") || value.includes("\n") || value.includes("\r")) return false;
  const lower = value.toLowerCase();
  return (
    lower.endsWith(".so")
    || lower.endsWith(".dylib")
    || lower.includes("pkcs11")
    || lower.endsWith(".dll")
  );
}

/**
 * Build argv for `ssh-add` PKCS#11 module load/unload.
 * PIN is never placed on argv — fed via SSH_ASKPASS only.
 */
export function buildSshAddPkcs11Args(
  action: SshAddPkcs11Action,
  modulePath: string,
): { ok: true; args: string[] } | { ok: false; error: string } {
  const path = String(modulePath || "").trim();
  if (!path) return { ok: false, error: "module_path_required" };
  if (!isLikelyPkcs11ModulePath(path)) return { ok: false, error: "module_path_invalid" };
  if (action === "add") return { ok: true, args: ["-s", path] };
  if (action === "remove") return { ok: true, args: ["-e", path] };
  return { ok: false, error: "action_invalid" };
}

/** Common vendor module basenames for file-picker hints (not auto-probed). */
export const COMMON_PKCS11_MODULE_HINTS: readonly string[] = [
  "opensc-pkcs11.so",
  "opensc-pkcs11.dylib",
  "libykcs11.so",
  "libykcs11.dylib",
  "libeTPkcs11.dylib",
  "libeTPkcs11.so",
];

/** Directories each platform's package managers install PKCS#11 modules into. */
const PKCS11_MODULE_DIRS: Record<string, readonly string[]> = {
  darwin: ["/Library/OpenSC/lib", "/opt/homebrew/lib", "/usr/local/lib"],
  linux: ["/usr/lib/x86_64-linux-gnu", "/usr/lib64", "/usr/lib"],
};

/**
 * Absolute module paths to offer as typing suggestions. Nothing is probed on
 * disk — these are hints, and a path that does not exist simply fails at
 * `ssh-add` with the usual error.
 */
export function getCommonPkcs11ModulePaths(platform: string = process.platform): string[] {
  const dirs = PKCS11_MODULE_DIRS[platform];
  if (!dirs) return [];
  const extension = platform === "darwin" ? ".dylib" : ".so";
  const basenames = COMMON_PKCS11_MODULE_HINTS.filter((name) => name.endsWith(extension));
  return dirs.flatMap((dir) => basenames.map((name) => `${dir}/${name}`));
}
