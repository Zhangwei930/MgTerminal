import test from "node:test";
import assert from "node:assert/strict";
import { buildQuickConnectHost } from "./quickConnect.ts";

const base = {
  hostname: "example.com",
  username: "root",
  port: 22,
  authMethod: "password" as const,
  password: "secret",
};

test("buildQuickConnectHost: ssh maps to plain ssh host", () => {
  const host = buildQuickConnectHost({ ...base, protocol: "ssh" });
  assert.equal(host.protocol, "ssh");
  assert.equal(host.moshEnabled, false);
  assert.equal(host.etEnabled, false);
  assert.equal(host.telnetEnabled, false);
  assert.equal(host.etPort, undefined);
  assert.equal(host.telnetPort, undefined);
  assert.equal(host.password, "secret");
});

test("buildQuickConnectHost: mosh keeps ssh protocol with moshEnabled", () => {
  const host = buildQuickConnectHost({
    ...base,
    protocol: "mosh",
    moshServerPath: "/usr/local/bin/mosh-server",
  });
  assert.equal(host.protocol, "ssh");
  assert.equal(host.moshEnabled, true);
  assert.equal(host.moshServerPath, "/usr/local/bin/mosh-server");
  assert.equal(host.etEnabled, false);
});

test("buildQuickConnectHost: et keeps ssh protocol with etEnabled and etPort", () => {
  const host = buildQuickConnectHost({ ...base, protocol: "et", etPort: 2022 });
  assert.equal(host.protocol, "ssh");
  assert.equal(host.etEnabled, true);
  assert.equal(host.etPort, 2022);
  assert.equal(host.moshEnabled, false);
  assert.equal(host.telnetEnabled, false);
});

test("buildQuickConnectHost: et ignores etPort when protocol is not et", () => {
  const host = buildQuickConnectHost({ ...base, protocol: "ssh", etPort: 2022 });
  assert.equal(host.etPort, undefined);
});

test("buildQuickConnectHost: telnet sets telnetEnabled and telnetPort", () => {
  const host = buildQuickConnectHost({ ...base, protocol: "telnet", port: 23 });
  assert.equal(host.protocol, "telnet");
  assert.equal(host.telnetEnabled, true);
  assert.equal(host.telnetPort, 23);
  assert.equal(host.etEnabled, false);
});

test("buildQuickConnectHost: key auth maps identityFileId and drops password", () => {
  const host = buildQuickConnectHost({
    ...base,
    protocol: "ssh",
    authMethod: "key",
    password: undefined,
    identityFileId: "key-1",
  });
  assert.equal(host.authMethod, "key");
  assert.equal(host.identityFileId, "key-1");
  assert.equal(host.password, undefined);
});
