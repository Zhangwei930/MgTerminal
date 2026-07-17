"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSshAddPkcs11Args,
  isLikelyPkcs11ModulePath,
  isPkcs11AgentLoadSupported,
  writeAskpassArtifacts,
} = require("./sshAgentPkcs11.cjs");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("platform and path helpers", () => {
  assert.equal(isPkcs11AgentLoadSupported("darwin"), true);
  assert.equal(isPkcs11AgentLoadSupported("win32"), false);
  assert.equal(isLikelyPkcs11ModulePath("/usr/lib/opensc-pkcs11.so"), true);
  assert.equal(isLikelyPkcs11ModulePath("bad"), false);
});

test("build args never embed PIN", () => {
  const add = buildSshAddPkcs11Args("add", "/tmp/opensc-pkcs11.so");
  assert.deepEqual(add, { ok: true, args: ["-s", "/tmp/opensc-pkcs11.so"] });
});

test("askpass script prints pin and is cleaned up", () => {
  const artifacts = writeAskpassArtifacts("123456");
  try {
    assert.ok(fs.existsSync(artifacts.env.SSH_ASKPASS));
    const output = execFileSync("/bin/sh", [artifacts.env.SSH_ASKPASS], { encoding: "utf8" });
    assert.equal(output, "123456\n");
    assert.equal(artifacts.env.SSH_ASKPASS_REQUIRE, "force");
  } finally {
    artifacts.cleanup();
  }
  assert.equal(fs.existsSync(artifacts.env.SSH_ASKPASS), false);
});

test("askpass never lets the shell expand PIN content", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "magies-pkcs11-pin-probe-"));
  const marker = path.join(dir, "pwned");
  const pin = `$(touch ${marker})\`touch ${marker}\``;
  const artifacts = writeAskpassArtifacts(pin);
  try {
    const script = fs.readFileSync(artifacts.env.SSH_ASKPASS, "utf8");
    assert.equal(script.includes(pin), false, "PIN must not be embedded in the shell script");
    const output = execFileSync("/bin/sh", [artifacts.env.SSH_ASKPASS], { encoding: "utf8" });
    assert.equal(output, `${pin}\n`);
    assert.equal(fs.existsSync(marker), false, "PIN content must never execute");
  } finally {
    artifacts.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("askpass artifacts live under the MagiesTerminal temp dir", () => {
  const artifacts = writeAskpassArtifacts("42");
  try {
    assert.ok(artifacts.dir.includes(`${path.sep}MagiesTerminal${path.sep}`));
  } finally {
    artifacts.cleanup();
  }
});
