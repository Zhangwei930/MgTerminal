import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSshAddPkcs11Args,
  isLikelyPkcs11ModulePath,
  isPkcs11AgentLoadSupported,
} from "./sshAgentPkcs11.ts";

test("platform gate", () => {
  assert.equal(isPkcs11AgentLoadSupported("darwin"), true);
  assert.equal(isPkcs11AgentLoadSupported("linux"), true);
  assert.equal(isPkcs11AgentLoadSupported("win32"), false);
});

test("module path heuristics", () => {
  assert.equal(isLikelyPkcs11ModulePath("/usr/lib/opensc-pkcs11.so"), true);
  assert.equal(isLikelyPkcs11ModulePath("/Library/OpenSC/lib/opensc-pkcs11.dylib"), true);
  assert.equal(isLikelyPkcs11ModulePath("not a path"), false);
  assert.equal(isLikelyPkcs11ModulePath("evil\npath.so"), false);
});

test("ssh-add argv never includes PIN", () => {
  const add = buildSshAddPkcs11Args("add", "/usr/lib/opensc-pkcs11.so");
  assert.equal(add.ok, true);
  if (add.ok) {
    assert.deepEqual(add.args, ["-s", "/usr/lib/opensc-pkcs11.so"]);
    assert.equal(add.args.some((a) => /pin|pass/i.test(a)), false);
  }
  const remove = buildSshAddPkcs11Args("remove", "/usr/lib/opensc-pkcs11.so");
  assert.equal(remove.ok, true);
  if (remove.ok) {
    assert.deepEqual(remove.args, ["-e", "/usr/lib/opensc-pkcs11.so"]);
  }
  assert.equal(buildSshAddPkcs11Args("add", "").ok, false);
});
