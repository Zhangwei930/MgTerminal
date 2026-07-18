/**
 * End-to-end: patched ssh2 client negotiates mlkem768x25519-sha256 against a
 * local OpenSSH sshd that only offers that hybrid PQ KEX.
 *
 * Skipped when the platform OpenSSH lacks mlkem768x25519-sha256 or when we
 * cannot start a throwaway sshd (common in restricted CI sandboxes).
 */

"use strict";

const assert = require("node:assert/strict");
const { spawn, spawnSync, execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { installMlkem768, BUILTIN_PQ_KEX } = require("./mlkemPreload.cjs");

function platformSupportsMlkemKex() {
  try {
    const out = execFileSync("ssh", ["-Q", "kex"], { encoding: "utf8" });
    return out.split(/\r?\n/).includes(BUILTIN_PQ_KEX);
  } catch {
    return false;
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function waitForPort(port, timeoutMs = 8000) {
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

test("ssh2 negotiates mlkem768x25519-sha256 with OpenSSH sshd", async (t) => {
  if (!platformSupportsMlkemKex()) {
    t.skip("platform OpenSSH does not advertise mlkem768x25519-sha256");
    return;
  }

  installMlkem768();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "magies-mlkem-e2e-"));
  t.after(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  // Host key + passwordless user key for the throwaway sshd.
  const hostKey = path.join(tmp, "ssh_host_ed25519_key");
  const userKey = path.join(tmp, "id_ed25519");
  const authorizedKeys = path.join(tmp, "authorized_keys");
  execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", hostKey, "-q"]);
  execFileSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", userKey, "-q"]);
  fs.copyFileSync(`${userKey}.pub`, authorizedKeys);
  fs.chmodSync(authorizedKeys, 0o600);

  const port = await findFreePort();
  const sshdConfig = path.join(tmp, "sshd_config");
  const pidFile = path.join(tmp, "sshd.pid");
  fs.writeFileSync(
    sshdConfig,
    [
      `Port ${port}`,
      "ListenAddress 127.0.0.1",
      `HostKey ${hostKey}`,
      "PasswordAuthentication no",
      "KbdInteractiveAuthentication no",
      "ChallengeResponseAuthentication no",
      "PubkeyAuthentication yes",
      `AuthorizedKeysFile ${authorizedKeys}`,
      "StrictModes no",
      "UsePAM no",
      "PermitRootLogin yes",
      // Force hybrid PQ only — classical KEX must not be a fallback here.
      `KexAlgorithms ${BUILTIN_PQ_KEX}`,
      "LogLevel ERROR",
      `PidFile ${pidFile}`,
      "",
    ].join("\n"),
  );

  // Prefer the absolute path when available.
  let sshdPath = "sshd";
  for (const candidate of ["/usr/sbin/sshd", "/usr/local/sbin/sshd"]) {
    if (fs.existsSync(candidate)) {
      sshdPath = candidate;
      break;
    }
  }

  // Dry-run config check so we fail fast with a clear skip on permission issues.
  const check = spawnSync(sshdPath, ["-t", "-f", sshdConfig], { encoding: "utf8" });
  if (check.status !== 0) {
    t.skip(`sshd config rejected: ${check.stderr || check.stdout || check.status}`);
    return;
  }

  const sshd = spawn(sshdPath, ["-D", "-e", "-f", sshdConfig], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let sshdLog = "";
  sshd.stderr.on("data", (chunk) => { sshdLog += chunk.toString(); });
  sshd.stdout.on("data", (chunk) => { sshdLog += chunk.toString(); });
  t.after(() => {
    try { sshd.kill("SIGTERM"); } catch { /* ignore */ }
  });

  try {
    await waitForPort(port);
  } catch (err) {
    t.skip(`could not start sshd: ${err.message}; log=${sshdLog.slice(0, 400)}`);
    return;
  }

  // Require ssh2 only after ML-KEM is preloaded (constants.js only needs curve25519,
  // but the exchange class reads globalThis at runtime).
  const { Client } = require("ssh2");

  const negotiated = await new Promise((resolve, reject) => {
    const client = new Client();
    const timer = setTimeout(() => {
      client.end();
      reject(new Error(`handshake timed out; sshd log: ${sshdLog.slice(0, 400)}`));
    }, 15000);

    client
      .on("ready", () => {
        // ssh2 does not expose the negotiated KEX on the public API; force
        // success only when the server offered PQ-only and auth completed.
        clearTimeout(timer);
        client.end();
        resolve(true);
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect({
        host: "127.0.0.1",
        port,
        username: os.userInfo().username,
        privateKey: fs.readFileSync(userKey),
        readyTimeout: 12000,
        // Only offer the hybrid PQ algorithm — if wire format is wrong, handshake fails.
        algorithms: {
          kex: [BUILTIN_PQ_KEX],
        },
        // Accept the throwaway host key without known_hosts.
        hostVerifier: () => true,
      });
  });

  assert.equal(negotiated, true);
});

// Lightweight self-check of the ML-KEM API shape used by the ssh2 patch.
test("ML-KEM-768 preload API matches ssh2 patch contract", () => {
  installMlkem768();
  const impl = globalThis.__MAGIES_MLKEM768__;
  assert.equal(typeof impl.keygen, "function");
  assert.equal(typeof impl.decapsulate, "function");

  const keys = impl.keygen();
  assert.equal(keys.publicKey.length, 1184);
  assert.ok(keys.secretKey.length > 0);

  // Round-trip encapsulate via noble and decapsulate via the preload wrapper.
  const { ml_kem768 } = require("@noble/post-quantum/ml-kem.js");
  const enc = ml_kem768.encapsulate(keys.publicKey);
  const ss = impl.decapsulate(enc.cipherText, keys.secretKey);
  assert.equal(ss.length, 32);
  assert.ok(crypto.timingSafeEqual(Buffer.from(ss), Buffer.from(enc.sharedSecret)));
});
