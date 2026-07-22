const test = require("node:test");
const assert = require("node:assert/strict");

const { isWindows, buildPetCommandSpawnOptions } = require("./petCommandBridge.cjs");

test("isWindows recognizes win32 and only win32", () => {
  assert.equal(isWindows("win32"), true);
  assert.equal(isWindows("darwin"), false);
  assert.equal(isWindows("linux"), false);
});

test("buildPetCommandSpawnOptions enables shell only on Windows", () => {
  assert.equal(buildPetCommandSpawnOptions("win32").shell, true, "Windows needs shell:true to resolve .cmd/.bat files and shell builtins (dir, npm, etc.) — spawn's CreateProcess path doesn't go through cmd.exe otherwise");
  assert.equal(buildPetCommandSpawnOptions("darwin").shell, false);
  assert.equal(buildPetCommandSpawnOptions("linux").shell, false);
});

test("buildPetCommandSpawnOptions preserves and merges caller-supplied options", () => {
  const options = buildPetCommandSpawnOptions("darwin", { detached: true, stdio: "ignore" });
  assert.equal(options.detached, true);
  assert.equal(options.stdio, "ignore");
  assert.equal(options.shell, false);
});

test("buildPetCommandSpawnOptions lets a caller option be overridden by the platform's shell requirement", () => {
  // Even if a caller passed shell:false explicitly, Windows still needs it on.
  const options = buildPetCommandSpawnOptions("win32", { shell: false, stdio: "ignore" });
  assert.equal(options.shell, true);
});
