"use strict";

/**
 * Load / unload PKCS#11 modules into the system SSH agent via `ssh-add -s/-e`.
 * PIN is never logged or put on argv; temporary SSH_ASKPASS echoes it once.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { getAvailableAgentSocket } = require("./sshAuthHelper.cjs");

function isPkcs11AgentLoadSupported(platform = process.platform) {
  return platform === "darwin" || platform === "linux";
}

function isLikelyPkcs11ModulePath(filePath) {
  const value = String(filePath || "").trim();
  if (!value || value.includes("\0") || /[\r\n]/.test(value)) return false;
  const lower = value.toLowerCase();
  return (
    lower.endsWith(".so")
    || lower.endsWith(".dylib")
    || lower.includes("pkcs11")
  );
}

function buildSshAddPkcs11Args(action, modulePath) {
  const moduleFile = String(modulePath || "").trim();
  if (!moduleFile) return { ok: false, error: "module_path_required" };
  if (!isLikelyPkcs11ModulePath(moduleFile)) return { ok: false, error: "module_path_invalid" };
  if (action === "add") return { ok: true, args: ["-s", moduleFile] };
  if (action === "remove") return { ok: true, args: ["-e", moduleFile] };
  return { ok: false, error: "action_invalid" };
}

async function resolveSshAddPath() {
  const candidates = [
    "/usr/bin/ssh-add",
    "/bin/ssh-add",
    "/usr/local/bin/ssh-add",
    "/opt/homebrew/bin/ssh-add",
  ];
  for (const candidate of candidates) {
    try {
      await fs.promises.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return "ssh-add"; // rely on PATH
}

function writeAskpassArtifacts(pin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "magies-pkcs11-askpass-"));
  const scriptPath = path.join(dir, "askpass.sh");
  // Single-shot: print PIN to stdout for ssh-add PKCS#11 prompts.
  const script = `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(String(pin ?? ""))}\n`;
  fs.writeFileSync(scriptPath, script, { mode: 0o700 });
  return {
    dir,
    env: {
      SSH_ASKPASS: scriptPath,
      SSH_ASKPASS_REQUIRE: "force",
      // ssh-add requires DISPLAY (or equivalent) before honoring SSH_ASKPASS.
      DISPLAY: process.env.DISPLAY || ":0",
    },
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

function runSshAdd(sshAddPath, args, env) {
  return new Promise((resolve) => {
    const child = spawn(sshAddPath, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      resolve({
        success: false,
        code: null,
        error: err?.message || String(err),
        stdout,
        stderr,
      });
    });
    child.on("close", (code) => {
      resolve({
        success: code === 0,
        code,
        error: code === 0 ? undefined : (stderr.trim() || stdout.trim() || `ssh-add exited ${code}`),
        stdout,
        stderr,
      });
    });
  });
}

/**
 * @param {{ action: 'add'|'remove', modulePath: string, pin?: string }} input
 */
async function managePkcs11Module(input) {
  if (!isPkcs11AgentLoadSupported()) {
    return { success: false, error: "platform_unsupported" };
  }
  const action = input?.action === "remove" ? "remove" : "add";
  const modulePath = String(input?.modulePath || "").trim();
  const built = buildSshAddPkcs11Args(action, modulePath);
  if (!built.ok) return { success: false, error: built.error };

  try {
    await fs.promises.access(modulePath, fs.constants.R_OK);
  } catch {
    return { success: false, error: "module_not_readable" };
  }

  const agentSocket = await getAvailableAgentSocket();
  if (!agentSocket) {
    return { success: false, error: "agent_unavailable" };
  }

  const sshAddPath = await resolveSshAddPath();
  let askpass = null;
  try {
    const env = { SSH_AUTH_SOCK: agentSocket };
    if (action === "add" && typeof input?.pin === "string" && input.pin.length > 0) {
      askpass = writeAskpassArtifacts(input.pin);
      Object.assign(env, askpass.env);
    }
    const result = await runSshAdd(sshAddPath, built.args, env);
    if (!result.success) {
      return {
        success: false,
        error: "ssh_add_failed",
        message: result.error,
        code: result.code,
      };
    }
    return { success: true, action, modulePath };
  } finally {
    askpass?.cleanup?.();
  }
}

module.exports = {
  isPkcs11AgentLoadSupported,
  isLikelyPkcs11ModulePath,
  buildSshAddPkcs11Args,
  managePkcs11Module,
  resolveSshAddPath,
  writeAskpassArtifacts,
};
