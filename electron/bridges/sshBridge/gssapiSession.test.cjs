"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGssapiSshArgs, buildSystemOpenSshArgs } = require("./gssapiSession.cjs");

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

test("buildSystemOpenSshArgs prefers hybrid PQ KEX when requested", () => {
  const args = buildSystemOpenSshArgs({
    hostname: "pq.example.com",
    username: "alice",
    preferPostQuantumKex: true,
    identityFilePaths: ["/tmp/id_ed25519"],
  });
  const kex = args.find((a) => String(a).startsWith("KexAlgorithms="));
  assert.ok(kex);
  assert.match(kex, /sntrup761x25519|mlkem768x25519/);
  assert.ok(args.includes("-i"));
  assert.ok(args.includes("/tmp/id_ed25519"));
  assert.equal(args[args.length - 1], "alice@pq.example.com");
});
