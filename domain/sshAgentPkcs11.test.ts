import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSshAddPkcs11Args,
  getCommonPkcs11ModulePaths,
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

test("getCommonPkcs11ModulePaths suggests absolute, platform-correct modules", () => {
  const mac = getCommonPkcs11ModulePaths("darwin");
  const linux = getCommonPkcs11ModulePaths("linux");

  // Bare basenames pass isLikelyPkcs11ModulePath but ssh-add cannot resolve
  // them, so every suggestion has to be a real absolute path.
  for (const candidate of [...mac, ...linux]) {
    assert.ok(candidate.startsWith("/"), `${candidate} must be absolute`);
    assert.equal(isLikelyPkcs11ModulePath(candidate), true);
  }
  assert.ok(mac.every((p) => p.endsWith(".dylib")), "macOS modules are dylibs");
  assert.ok(linux.every((p) => p.endsWith(".so")), "Linux modules are shared objects");

  // Both OpenSC (generic smartcard) and ykcs11 (YubiKey PIV) must be offered.
  assert.ok(mac.some((p) => p.includes("opensc-pkcs11")));
  assert.ok(mac.some((p) => p.includes("libykcs11")));
  assert.ok(linux.some((p) => p.includes("opensc-pkcs11")));
  assert.ok(linux.some((p) => p.includes("libykcs11")));

  assert.deepEqual(getCommonPkcs11ModulePaths("win32"), [], "no ssh-add -s support on Windows");
  assert.deepEqual([...new Set(mac)], mac, "no duplicate suggestions");
});
