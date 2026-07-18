const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  buildRdpFileContent,
  buildRdpLaunchPlan,
  validateRdpLaunchOptions,
} = require("./rdpBridge.cjs");

test("buildRdpFileContent emits full address, username and safe defaults", () => {
  const content = buildRdpFileContent({ hostname: "win.example.com", port: 3390, username: "admin" });
  assert.match(content, /^full address:s:win\.example\.com:3390\r\n/);
  assert.match(content, /username:s:admin\r\n/);
  assert.match(content, /prompt for credentials:i:1/);
  assert.doesNotMatch(content, /password/i);
});

test("buildRdpFileContent defaults port to 3389 and omits empty username", () => {
  const content = buildRdpFileContent({ hostname: "10.0.0.5" });
  assert.match(content, /full address:s:10\.0\.0\.5:3389\r\n/);
  assert.doesNotMatch(content, /username:s:/);
});

test("buildRdpFileContent strips CRLF injection from values", () => {
  const content = buildRdpFileContent({
    hostname: "host\r\nadministrative session:i:1",
    username: "user\r\nevil:s:1",
  });
  assert.doesNotMatch(content, /administrative session:i:1\r\nevil/);
  assert.match(content, /full address:s:hostadministrative session:i:1:3389/);
});

test("buildRdpFileContent rejects empty hostname and invalid port", () => {
  assert.throws(() => buildRdpFileContent({ hostname: "  " }));
  assert.throws(() => buildRdpFileContent({ hostname: "h", port: 0 }));
  assert.throws(() => buildRdpFileContent({ hostname: "h", port: 70000 }));
});

test("win32 plan injects credentials via cmdkey and cleans up", () => {
  const plan = buildRdpLaunchPlan("win32", {
    rdpFilePath: "C:\\tmp\\a.rdp",
    hostname: "win.example.com",
    port: 3389,
    username: "admin",
    password: "s3cret",
  });
  assert.equal(plan.commands.length, 2);
  assert.equal(plan.commands[0].command, "cmdkey");
  assert.deepEqual(plan.commands[0].args, [
    "/generic:TERMSRV/win.example.com",
    "/user:admin",
    "/pass:s3cret",
  ]);
  assert.equal(plan.commands[1].command, "mstsc");
  assert.deepEqual(plan.commands[1].args, ["C:\\tmp\\a.rdp"]);
  assert.equal(plan.cleanup.command, "cmdkey");
  assert.deepEqual(plan.cleanup.args, ["/delete:TERMSRV/win.example.com"]);
  assert.ok(plan.cleanup.delayMs > 0);
});

test("win32 plan without password launches mstsc only", () => {
  const plan = buildRdpLaunchPlan("win32", {
    rdpFilePath: "C:\\tmp\\a.rdp",
    hostname: "win.example.com",
    port: 3389,
  });
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0].command, "mstsc");
  assert.equal(plan.cleanup, undefined);
});

test("darwin plan opens the .rdp file with the system handler", () => {
  const plan = buildRdpLaunchPlan("darwin", {
    rdpFilePath: "/tmp/a.rdp",
    hostname: "win.example.com",
    port: 3389,
    username: "admin",
    password: "s3cret",
  });
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0].command, "open");
  assert.deepEqual(plan.commands[0].args, ["/tmp/a.rdp"]);
});

test("linux plan uses xfreerdp with password over stdin, never argv", () => {
  const plan = buildRdpLaunchPlan("linux", {
    rdpFilePath: "/tmp/a.rdp",
    hostname: "win.example.com",
    port: 3390,
    username: "admin",
    password: "s3cret",
  });
  assert.equal(plan.commands.length, 1);
  const cmd = plan.commands[0];
  assert.equal(cmd.command, "xfreerdp");
  assert.ok(cmd.args.includes("/v:win.example.com:3390"));
  assert.ok(cmd.args.includes("/u:admin"));
  assert.ok(cmd.args.includes("/from-stdin"));
  assert.equal(cmd.stdinData, "s3cret\n");
  assert.ok(!cmd.args.some((a) => a.includes("s3cret")));
});

test("linux plan without credentials omits stdin plumbing", () => {
  const plan = buildRdpLaunchPlan("linux", {
    rdpFilePath: "/tmp/a.rdp",
    hostname: "win.example.com",
    port: 3389,
  });
  const cmd = plan.commands[0];
  assert.ok(!cmd.args.includes("/from-stdin"));
  assert.equal(cmd.stdinData, undefined);
});

test("validateRdpLaunchOptions rejects missing hostname and ciphertext passwords", () => {
  assert.equal(validateRdpLaunchOptions({ hostname: "h" }), null);
  assert.ok(validateRdpLaunchOptions({}));
  assert.ok(validateRdpLaunchOptions({ hostname: "" }));
  assert.ok(validateRdpLaunchOptions({ hostname: "h", password: "enc:v2:abcdef" }));
  assert.ok(validateRdpLaunchOptions({ hostname: "h", password: "enc:v1:abcdef" }));
  assert.ok(validateRdpLaunchOptions({ hostname: "h", password: "__IPC_SECURED__" }));
  assert.equal(validateRdpLaunchOptions({ hostname: "h", password: "plain" }), null);
});
