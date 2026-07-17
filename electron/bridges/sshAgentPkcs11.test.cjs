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
    const body = fs.readFileSync(artifacts.env.SSH_ASKPASS, "utf8");
    assert.match(body, /123456/);
    assert.equal(artifacts.env.SSH_ASKPASS_REQUIRE, "force");
  } finally {
    artifacts.cleanup();
  }
  assert.equal(fs.existsSync(artifacts.env.SSH_ASKPASS), false);
});
