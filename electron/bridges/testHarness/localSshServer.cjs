"use strict";

// Reusable "spin up a real throwaway sshd" harness for integration tests,
// generalized from electron/bridges/sshBridge/mlkemKex.e2e.test.cjs (which
// proved the approach for one narrow KEX-negotiation test). Any bridge's
// tests can use this to drive real auth/exec/SFTP/shell protocol behavior
// against a real OpenSSH server instead of a hand-rolled ssh2 fake.

const { spawn, spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const { getFreeLocalPort } = require("../freePortPicker.cjs");

const DEFAULT_SSHD_CANDIDATES = ["/usr/sbin/sshd", "/usr/local/sbin/sshd", "sshd"];
const DEFAULT_SFTP_SERVER_CANDIDATES = [
  "/usr/lib/openssh/sftp-server", // Debian/Ubuntu (matches CI's ubuntu-latest)
  "/usr/libexec/sftp-server", // macOS
  "/usr/lib/ssh/sftp-server",
];

/** Thrown whenever the harness cannot provide a working server — callers
 *  should catch this specific type and turn it into a test skip. */
class SshTestServerUnavailableError extends Error {}

/**
 * Returns the first absolute candidate that exists on disk; a non-absolute
 * candidate (e.g. bare "sshd") is treated as an immediate PATH-relative
 * fallback rather than filesystem-checked, so it should be listed last.
 */
function resolveSshdPath(candidates = DEFAULT_SSHD_CANDIDATES, { existsSync = fs.existsSync } = {}) {
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return candidates[candidates.length - 1];
}

function resolveSftpServerPath(candidates = DEFAULT_SFTP_SERVER_CANDIDATES, options = {}) {
  const { existsSync = fs.existsSync } = options;
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function buildSshdConfig({
  port,
  hostKeyPath,
  authorizedKeysPath,
  pidFilePath,
  sftpServerPath = null,
  extraConfigLines = [],
}) {
  const lines = [
    `Port ${port}`,
    "ListenAddress 127.0.0.1",
    `HostKey ${hostKeyPath}`,
    "PasswordAuthentication no",
    "KbdInteractiveAuthentication no",
    "ChallengeResponseAuthentication no",
    "PubkeyAuthentication yes",
    `AuthorizedKeysFile ${authorizedKeysPath}`,
    "StrictModes no",
    "UsePAM no",
    "PermitRootLogin yes",
    "LogLevel ERROR",
    `PidFile ${pidFilePath}`,
  ];
  if (sftpServerPath) {
    lines.push(`Subsystem sftp ${sftpServerPath}`);
  }
  lines.push(...extraConfigLines);
  lines.push("");
  return lines.join("\n");
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`sshd did not listen on ${port} within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tryOnce, 50);
      });
    };
    tryOnce();
  });
}

/**
 * Spins up a real throwaway OpenSSH sshd on 127.0.0.1 with a generated
 * ed25519 host key and a passwordless user keypair pre-authorized for the
 * current OS user. Throws SshTestServerUnavailableError (never a generic
 * Error) when the environment can't provide a working server, so callers
 * have a single type to catch and turn into a test skip.
 */
async function startTestSshServer({
  enableSftp = false,
  username = os.userInfo().username,
  extraConfigLines = [],
  waitTimeoutMs = 8000,
} = {}) {
  const sftpServerPath = enableSftp ? resolveSftpServerPath() : null;
  if (enableSftp && !sftpServerPath) {
    throw new SshTestServerUnavailableError("no sftp-server binary found on this platform");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magies-ssh-e2e-"));
  const cleanupTmpDir = () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  let sshdProcess = null;
  const cleanupProcess = () => {
    try { sshdProcess?.kill("SIGTERM"); } catch { /* ignore */ }
  };

  try {
    const hostKeyPath = path.join(tmpDir, "ssh_host_ed25519_key");
    const userKeyPath = path.join(tmpDir, "id_ed25519");
    const authorizedKeysPath = path.join(tmpDir, "authorized_keys");
    try {
      execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", hostKeyPath, "-q"]);
      execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", userKeyPath, "-q"]);
    } catch (err) {
      throw new SshTestServerUnavailableError(`ssh-keygen unavailable or failed: ${err.message}`);
    }
    fs.copyFileSync(`${userKeyPath}.pub`, authorizedKeysPath);
    fs.chmodSync(authorizedKeysPath, 0o600);

    const port = await getFreeLocalPort({ bindAddress: "127.0.0.1" });
    const sshdConfigPath = path.join(tmpDir, "sshd_config");
    const pidFilePath = path.join(tmpDir, "sshd.pid");
    fs.writeFileSync(sshdConfigPath, buildSshdConfig({
      port, hostKeyPath, authorizedKeysPath, pidFilePath, sftpServerPath, extraConfigLines,
    }));

    const sshdPath = resolveSshdPath();
    const check = spawnSync(sshdPath, ["-t", "-f", sshdConfigPath], { encoding: "utf8" });
    if (check.status !== 0) {
      throw new SshTestServerUnavailableError(
        `sshd config rejected: ${check.stderr || check.stdout || check.status}`,
      );
    }

    sshdProcess = spawn(sshdPath, ["-D", "-e", "-f", sshdConfigPath], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    const appendLog = (chunk) => { log += chunk.toString(); };
    sshdProcess.stdout.on("data", appendLog);
    sshdProcess.stderr.on("data", appendLog);

    try {
      await waitForPort(port, waitTimeoutMs);
    } catch (err) {
      throw new SshTestServerUnavailableError(`could not start sshd: ${err.message}; log=${log.slice(0, 400)}`);
    }

    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      cleanupProcess();
      cleanupTmpDir();
    };

    return {
      port,
      hostname: "127.0.0.1",
      username,
      tmpDir,
      hostKeyPath,
      userKeyPath,
      authorizedKeysPath,
      privateKey: fs.readFileSync(userKeyPath),
      sshdConfigPath,
      getLog: () => log,
      stop,
    };
  } catch (err) {
    cleanupProcess();
    cleanupTmpDir();
    throw err;
  }
}

/**
 * Convenience wrapper for node:test: starts the server, skips the test via
 * `t.skip()` on SshTestServerUnavailableError, and registers `t.after()` to
 * stop it. The harness core above stays test-runner-agnostic; this is the
 * one place that takes `t`.
 */
async function withTestSshServer(t, options, fn) {
  let server;
  try {
    server = await startTestSshServer(options);
  } catch (err) {
    if (err instanceof SshTestServerUnavailableError) {
      t.skip(err.message);
      return undefined;
    }
    throw err;
  }
  t.after(() => server.stop());
  return fn(server);
}

module.exports = {
  startTestSshServer,
  withTestSshServer,
  SshTestServerUnavailableError,
  resolveSshdPath,
  resolveSftpServerPath,
  buildSshdConfig,
};
