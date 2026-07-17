"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGssapiSshArgs } = require("./gssapiSession.cjs");

test("buildGssapiSshArgs prefers GSSAPI and disables password prompts", () => {
  const args = buildGssapiSshArgs({
    hostname: "dc.example.com",
    username: "alice",
    port: 22,
  });
  assert.ok(args.includes("GSSAPIAuthentication=yes") || args.some((a) => a.includes("GSSAPIAuthentication=yes")));
  // preferred auth list is split as -o VALUE pairs
  const oIdx = args.findIndex((a, i) => a === "-o" && String(args[i + 1] || "").startsWith("PreferredAuthentications="));
  assert.ok(oIdx >= 0);
  assert.match(args[oIdx + 1], /gssapi-with-mic/);
  assert.ok(args.includes("BatchMode=yes") || args.some((a) => a === "BatchMode=yes" || a.includes("BatchMode=yes")));
  assert.equal(args[args.length - 1], "alice@dc.example.com");
  assert.ok(!args.includes("-p"));
});

test("buildGssapiSshArgs includes non-default port", () => {
  const args = buildGssapiSshArgs({
    hostname: "host.example",
    username: "bob",
    port: 2222,
  });
  const pIdx = args.indexOf("-p");
  assert.ok(pIdx >= 0);
  assert.equal(args[pIdx + 1], "2222");
  assert.equal(args[args.length - 1], "bob@host.example");
});

test("buildGssapiSshArgs requires hostname", () => {
  assert.throws(() => buildGssapiSshArgs({ username: "x" }), /hostname/i);
});
