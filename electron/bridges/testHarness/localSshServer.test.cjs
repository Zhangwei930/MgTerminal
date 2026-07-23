const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveSshdPath,
  resolveSftpServerPath,
  buildSshdConfig,
  SshTestServerUnavailableError,
} = require("./localSshServer.cjs");

test("resolveSshdPath returns the first existing absolute candidate", () => {
  const existsSync = (p) => p === "/usr/local/sbin/sshd";
  const result = resolveSshdPath(["/usr/sbin/sshd", "/usr/local/sbin/sshd", "sshd"], { existsSync });
  assert.equal(result, "/usr/local/sbin/sshd");
});

test("resolveSshdPath prefers an earlier existing candidate over a later one", () => {
  const existsSync = () => true;
  const result = resolveSshdPath(["/usr/sbin/sshd", "/usr/local/sbin/sshd", "sshd"], { existsSync });
  assert.equal(result, "/usr/sbin/sshd");
});

test("resolveSshdPath falls back to the bare PATH-relative name when nothing exists", () => {
  const existsSync = () => false;
  const result = resolveSshdPath(["/usr/sbin/sshd", "/usr/local/sbin/sshd", "sshd"], { existsSync });
  assert.equal(result, "sshd");
});

test("resolveSftpServerPath returns the first existing candidate", () => {
  const existsSync = (p) => p === "/usr/libexec/sftp-server";
  const result = resolveSftpServerPath(
    ["/usr/lib/openssh/sftp-server", "/usr/libexec/sftp-server"],
    { existsSync },
  );
  assert.equal(result, "/usr/libexec/sftp-server");
});

test("resolveSftpServerPath returns null when no candidate exists", () => {
  const existsSync = () => false;
  const result = resolveSftpServerPath(["/usr/lib/openssh/sftp-server"], { existsSync });
  assert.equal(result, null);
});

test("buildSshdConfig omits the Subsystem line when sftpServerPath is not given", () => {
  const config = buildSshdConfig({
    port: 2222,
    hostKeyPath: "/tmp/host_key",
    authorizedKeysPath: "/tmp/authorized_keys",
    pidFilePath: "/tmp/sshd.pid",
  });
  assert.doesNotMatch(config, /Subsystem sftp/);
  assert.match(config, /^Port 2222$/m);
  assert.match(config, /^HostKey \/tmp\/host_key$/m);
});

test("buildSshdConfig includes the Subsystem sftp line when a server path is given", () => {
  const config = buildSshdConfig({
    port: 2222,
    hostKeyPath: "/tmp/host_key",
    authorizedKeysPath: "/tmp/authorized_keys",
    pidFilePath: "/tmp/sshd.pid",
    sftpServerPath: "/usr/libexec/sftp-server",
  });
  assert.match(config, /^Subsystem sftp \/usr\/libexec\/sftp-server$/m);
});

test("buildSshdConfig appends extraConfigLines after the base lines", () => {
  const config = buildSshdConfig({
    port: 2222,
    hostKeyPath: "/tmp/host_key",
    authorizedKeysPath: "/tmp/authorized_keys",
    pidFilePath: "/tmp/sshd.pid",
    extraConfigLines: ["AuthenticationMethods publickey"],
  });
  const lines = config.split("\n").filter(Boolean);
  assert.equal(lines[lines.length - 1], "AuthenticationMethods publickey");
});

test("SshTestServerUnavailableError is a proper Error subclass", () => {
  const err = new SshTestServerUnavailableError("no sftp-server binary found");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof SshTestServerUnavailableError);
  assert.equal(err.message, "no sftp-server binary found");
});
