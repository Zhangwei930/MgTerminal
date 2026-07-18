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

test("buildSystemOpenSshArgs rejects option-like hostname and username", () => {
  assert.throws(
    () => buildSystemOpenSshArgs({ hostname: "-oProxyCommand=touch${IFS}/tmp/x" }),
    /hostname/i,
  );
  assert.throws(
    () => buildSystemOpenSshArgs({ hostname: "host.example", username: "-oProxyCommand=evil" }),
    /username/i,
  );
});

test("buildSystemOpenSshArgs terminates option parsing before the target", () => {
  const args = buildSystemOpenSshArgs({ hostname: "host.example", username: "alice" });
  assert.equal(args[args.length - 2], "--");
  assert.equal(args[args.length - 1], "alice@host.example");
});

test("buildSystemOpenSshArgs builds a ProxyJump chain with per-hop ports", () => {
  const args = buildSystemOpenSshArgs({
    hostname: "target.example.com",
    username: "alice",
    jumpHosts: [
      { hostname: "bastion1.example.com", port: 22, username: "jump1" },
      { hostname: "bastion2.example.com", port: 2222, username: "jump2" },
    ],
  });
  const jIdx = args.indexOf("-J");
  assert.ok(jIdx >= 0);
  assert.equal(args[jIdx + 1], "jump1@bastion1.example.com,jump2@bastion2.example.com:2222");
  assert.equal(args[args.length - 1], "alice@target.example.com");
});

test("buildSystemOpenSshArgs brackets IPv6 jump hosts and omits empty username", () => {
  const args = buildSystemOpenSshArgs({
    hostname: "target.example.com",
    jumpHosts: [{ hostname: "2001:db8::1", port: 2200 }],
  });
  const jIdx = args.indexOf("-J");
  assert.equal(args[jIdx + 1], "[2001:db8::1]:2200");
});

test("buildSystemOpenSshArgs rejects malformed jump hosts", () => {
  const base = { hostname: "target.example.com", username: "alice" };
  assert.throws(() => buildSystemOpenSshArgs({ ...base, jumpHosts: [{ hostname: "-oProxyCommand=x" }] }));
  assert.throws(() => buildSystemOpenSshArgs({ ...base, jumpHosts: [{ hostname: "a,b" }] }));
  assert.throws(() => buildSystemOpenSshArgs({ ...base, jumpHosts: [{ hostname: "host", username: "-bad" }] }));
  assert.throws(() => buildSystemOpenSshArgs({ ...base, jumpHosts: [{ hostname: "" }] }));
  assert.throws(() => buildSystemOpenSshArgs({ ...base, jumpHosts: [{ hostname: "host x" }] }));
});

test("buildSystemOpenSshArgs adds per-hop identity files once", () => {
  const args = buildSystemOpenSshArgs({
    hostname: "target.example.com",
    username: "alice",
    identityFilePaths: ["/keys/target"],
    jumpHosts: [
      { hostname: "bastion.example.com", identityFilePaths: ["/keys/bastion", "/keys/target"] },
    ],
  });
  const identityArgs = args.filter((a, i) => args[i - 1] === "-i");
  assert.deepEqual(identityArgs.sort(), ["/keys/bastion", "/keys/target"]);
});

test("buildSystemOpenSshArgs passes command proxies through ProxyCommand", () => {
  const args = buildSystemOpenSshArgs({
    hostname: "target.example.com",
    username: "alice",
    proxy: { type: "command", host: "", port: 0, command: "connect -H proxy:8080 %h %p" },
  });
  const oIdx = args.findIndex((a, i) => a === "-o" && String(args[i + 1] || "").startsWith("ProxyCommand="));
  assert.ok(oIdx >= 0);
  assert.match(args[oIdx + 1], /connect -H proxy:8080/);
  assert.match(args[oIdx + 1], /target\.example\.com/);
});

test("buildSystemOpenSshArgs keeps host key identity when relayed via loopback", () => {
  const args = buildSystemOpenSshArgs({
    hostname: "127.0.0.1",
    port: 54321,
    username: "alice",
    hostKeyAlias: "target.example.com",
  });
  const aliasIdx = args.findIndex((a, i) => a === "-o" && args[i + 1] === "HostKeyAlias=target.example.com");
  assert.ok(aliasIdx >= 0);
  assert.ok(args.some((a, i) => a === "-o" && args[i + 1] === "CheckHostIP=no"));
  assert.equal(args[args.length - 1], "alice@127.0.0.1");
});

test("createLoopbackProxyRelay pipes bytes through a SOCKS5 proxy", async () => {
  const net = require("node:net");
  const { createLoopbackProxyRelay } = require("./gssapiSession.cjs");

  // Fake SOCKS5 server: no-auth greeting, accept CONNECT, then echo payload.
  const proxyServer = net.createServer((socket) => {
    let stage = "greeting";
    socket.on("data", (data) => {
      if (stage === "greeting") {
        stage = "connect";
        socket.write(Buffer.from([0x05, 0x00]));
      } else if (stage === "connect") {
        stage = "echo";
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
      } else {
        socket.write(data);
      }
    });
  });
  await new Promise((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
  const proxyPort = proxyServer.address().port;

  const relay = await createLoopbackProxyRelay(
    { type: "socks5", host: "127.0.0.1", port: proxyPort },
    "target.example.com",
    22,
  );

  const received = await new Promise((resolve, reject) => {
    const client = net.connect(relay.port, "127.0.0.1", () => {
      client.write("hello-through-proxy");
    });
    client.on("data", (data) => {
      client.destroy();
      resolve(data.toString());
    });
    client.on("error", reject);
    setTimeout(() => reject(new Error("relay timeout")), 5000).unref();
  });

  assert.equal(received, "hello-through-proxy");
  relay.close();
  proxyServer.close();
});
