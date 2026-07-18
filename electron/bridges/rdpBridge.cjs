/**
 * RDP Bridge - launches the system RDP client for vault hosts.
 *
 * System-client MVP: generate a .rdp file in the app temp dir and hand it to
 * the platform client (Windows mstsc + cmdkey credential injection, macOS
 * `open` → Windows App / Microsoft Remote Desktop, Linux xfreerdp). The .rdp
 * file never contains a password; Windows credentials go through cmdkey and
 * are deleted again after a grace period, Linux passwords are piped over
 * stdin so they never appear on argv.
 */

const { spawn } = require("node:child_process");
const fs = require("node:fs");

const { getTempFilePath } = require("./tempDirBridge.cjs");

const CREDENTIAL_PLACEHOLDER = "__IPC_SECURED__";
// A real password never starts with the vault ciphertext prefix; refuse any
// enc:v* value outright instead of validating the payload shape.
const ENCRYPTED_CREDENTIAL_PREFIX_RE = /^enc:v\d+:/;
// How long the transient cmdkey credential / temp .rdp file stays around —
// long enough for mstsc to read both, short enough not to linger.
const CLEANUP_DELAY_MS = 90_000;

const sanitizeValue = (value) => String(value ?? "").replace(/[\r\n]/g, "").trim();

function buildRdpFileContent({ hostname, port, username }) {
  const host = sanitizeValue(hostname);
  if (!host) throw new Error("RDP hostname is required");
  const resolvedPort = port === undefined || port === null ? 3389 : Number(port);
  if (!Number.isInteger(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
    throw new Error(`Invalid RDP port: ${port}`);
  }
  const lines = [
    `full address:s:${host}:${resolvedPort}`,
    "prompt for credentials:i:1",
    "authentication level:i:2",
    "administrative session:i:0",
    "screen mode id:i:2",
    "use multimon:i:0",
  ];
  const user = sanitizeValue(username);
  if (user) lines.push(`username:s:${user}`);
  return `${lines.join("\r\n")}\r\n`;
}

function buildRdpLaunchPlan(platform, { rdpFilePath, hostname, port, username, password }) {
  const host = sanitizeValue(hostname);
  const user = sanitizeValue(username);

  if (platform === "win32") {
    const commands = [];
    let cleanup;
    if (password) {
      commands.push({
        command: "cmdkey",
        args: [`/generic:TERMSRV/${host}`, `/user:${user || "Administrator"}`, `/pass:${password}`],
      });
      cleanup = {
        command: "cmdkey",
        args: [`/delete:TERMSRV/${host}`],
        delayMs: CLEANUP_DELAY_MS,
      };
    }
    commands.push({ command: "mstsc", args: [rdpFilePath] });
    return { commands, cleanup };
  }

  if (platform === "darwin") {
    // macOS clients offer no non-interactive credential injection; the .rdp
    // file carries the username and the client prompts for the password.
    return { commands: [{ command: "open", args: [rdpFilePath] }] };
  }

  const args = [`/v:${host}:${Number(port) || 3389}`, "/cert:tofu"];
  if (user) args.push(`/u:${user}`);
  let stdinData;
  if (password) {
    args.push("/from-stdin");
    stdinData = `${password}\n`;
  }
  return { commands: [{ command: "xfreerdp", args, stdinData }] };
}

/** Returns an error string, or null when the options are launchable. */
function validateRdpLaunchOptions(options) {
  const host = sanitizeValue(options?.hostname);
  if (!host) return "RDP hostname is required";
  const password = options?.password;
  if (typeof password === "string" && password.length > 0) {
    if (ENCRYPTED_CREDENTIAL_PREFIX_RE.test(password) || password.includes(CREDENTIAL_PLACEHOLDER)) {
      return "RDP password is still encrypted; unlock the vault and try again";
    }
  }
  return null;
}

const runCommand = ({ command, args, stdinData }, { detached }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached,
      stdio: stdinData ? ["pipe", "ignore", "ignore"] : "ignore",
      windowsHide: !detached,
    });
    child.on("error", (err) => reject(new Error(`${command}: ${err.message}`)));
    if (stdinData) {
      child.stdin.write(stdinData);
      child.stdin.end();
    }
    if (detached) {
      // Fire-and-forget: the RDP client owns its own lifecycle.
      child.unref();
      resolve(undefined);
      return;
    }
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });

const scheduleCleanup = (cleanup, rdpFilePath) => {
  const timer = setTimeout(() => {
    if (cleanup) {
      runCommand(cleanup, { detached: false }).catch(() => {
        // Credential may already be gone; nothing actionable.
      });
    }
    fs.promises.unlink(rdpFilePath).catch(() => {});
  }, cleanup?.delayMs ?? CLEANUP_DELAY_MS);
  timer.unref?.();
};

async function launchRdp(options) {
  const validationError = validateRdpLaunchOptions(options);
  if (validationError) return { success: false, error: validationError };

  try {
    const content = buildRdpFileContent(options);
    const rdpFilePath = getTempFilePath(`rdp-${Date.now()}.rdp`);
    await fs.promises.writeFile(rdpFilePath, content, { encoding: "utf8", mode: 0o600 });

    const plan = buildRdpLaunchPlan(process.platform, { ...options, rdpFilePath });
    for (let i = 0; i < plan.commands.length; i += 1) {
      const isLast = i === plan.commands.length - 1;
      await runCommand(plan.commands[i], { detached: isLast });
    }
    scheduleCleanup(plan.cleanup, rdpFilePath);
    return { success: true };
  } catch (err) {
    console.error("[RdpBridge] launch failed:", err?.message);
    return { success: false, error: err?.message || "Failed to launch RDP client" };
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("magiesTerminal:rdp:launch", (_event, options) => launchRdp(options));
}

module.exports = {
  buildRdpFileContent,
  buildRdpLaunchPlan,
  validateRdpLaunchOptions,
  launchRdp,
  registerHandlers,
};
