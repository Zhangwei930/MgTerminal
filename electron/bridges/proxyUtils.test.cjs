const test = require("node:test");
const assert = require("node:assert/strict");
/**
 * These two tests spawn a real Node process and wait for its first write. One
 * second was enough on an idle machine but not on a loaded one — starting an
 * interpreter while the rest of the suite (and anything else on the box)
 * competes for CPU regularly takes longer, which made them fail at random.
 * The ceiling is only here to stop a genuinely broken implementation hanging
 * the run, so it can be generous without weakening anything.
 */
const SPAWN_TIMEOUT_MS = 15_000;

const { EventEmitter } = require("node:events");
const { once } = require("node:events");
const net = require("node:net");

const {
  classifyProxyTestError,
  createProxySocket,
  substituteProxyCommand,
} = require("./proxyUtils.cjs");

test("substituteProxyCommand replaces OpenSSH-style host and port tokens for POSIX shells", () => {
  assert.equal(
    substituteProxyCommand(
      "cloudflared access ssh --hostname %h --port %p --literal %%",
      "server's.example.com",
      2222,
      { platform: "linux" },
    ),
    "cloudflared access ssh --hostname 'server'\\''s.example.com' --port '2222' --literal %",
  );
});

test("substituteProxyCommand quotes safe OpenSSH-style host and port tokens for Windows cmd.exe", () => {
  assert.equal(
    substituteProxyCommand(
      "cloudflared access ssh --hostname %h --port %p --literal %%",
      "server.example.com",
      2222,
      { platform: "win32" },
    ),
    'cloudflared access ssh --hostname "server.example.com" --port "2222" --literal %',
  );
});

test("substituteProxyCommand rejects unsafe Windows cmd.exe placeholder values", () => {
  assert.throws(
    () => substituteProxyCommand("proxy --host %h", 'server" & whoami & "', 22, { platform: "win32" }),
    /cannot be safely substituted/,
  );
  assert.throws(
    () => substituteProxyCommand("proxy --host %h", "%USERPROFILE%.example.com", 22, { platform: "win32" }),
    /cannot be safely substituted/,
  );
});

test("createProxySocket exposes ProxyCommand stdout as socket data", async () => {
  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify("process.stdout.write('hello')")}`;
  const socket = await createProxySocket(
    { type: "command", host: "", port: 0, command },
    "server.example.com",
    22,
  );

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Timed out waiting for ProxyCommand output")), SPAWN_TIMEOUT_MS).unref();
  });

  try {
    const data = await Promise.race([
      once(socket, "data").then(([chunk]) => chunk),
      timeout,
    ]);

    assert.equal(data.toString(), "hello");
  } finally {
    socket.destroy();
  }
});

test("ProxyCommand spawn restores launch-time proxy env under Direct mode", async () => {
  const {
    applyNodeProxyEnv,
    resetProxyEnvOwnershipForTests,
  } = require("./httpNetworkProxyBridge.cjs");
  resetProxyEnvOwnershipForTests();

  const previous = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY,
  };
  process.env.HTTP_PROXY = "launch-proxy";
  process.env.HTTPS_PROXY = "launch-proxy";
  process.env.NO_PROXY = "localhost";
  applyNodeProxyEnv({ mode: "direct", url: "", bypass: "<local>" }, process.env);
  assert.equal(process.env.HTTP_PROXY, undefined);

  const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
    "process.stdout.write(process.env.HTTP_PROXY || '')",
  )}`;
  const socket = await createProxySocket(
    { type: "command", host: "", port: 0, command },
    "server.example.com",
    22,
  );

  try {
    const data = await Promise.race([
      once(socket, "data").then(([chunk]) => chunk.toString()),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Timed out waiting for ProxyCommand env")), SPAWN_TIMEOUT_MS).unref();
      }),
    ]);
    assert.equal(data, "launch-proxy");
  } finally {
    socket.destroy();
    // Restore process.env ownership and prior values for later tests.
    applyNodeProxyEnv({ mode: "system", url: "", bypass: "<local>" }, process.env);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetProxyEnvOwnershipForTests();
  }
});

test("createProxySocket times out stalled HTTP proxy handshakes", async (t) => {
  const originalConnect = net.connect;
  let socketDestroyed = false;
  const keepAlive = setTimeout(() => {}, 100);
  t.after(() => {
    clearTimeout(keepAlive);
    net.connect = originalConnect;
  });
  net.connect = () => {
    const socket = new EventEmitter();
    socket.setNoDelay = () => socket;
    socket.destroy = () => {
      socketDestroyed = true;
      socket.emit("close");
      return socket;
    };
    socket.write = () => true;
    return socket;
  };

  await assert.rejects(
    () => createProxySocket(
      { type: "http", host: "127.0.0.1", port: 8080 },
      "server.example.com",
      22,
      { timeoutMs: 20 },
    ),
    /Proxy connection timeout to server\.example\.com:22/,
  );
  assert.equal(socketDestroyed, true);
});

test("classifyProxyTestError maps failures to codes without echoing the message", () => {
    // Never return the raw error: HTTP CONNECT responses and ProxyCommand
    // output can carry the Proxy-Authorization blob or the command line, both
    // of which contain the user's credentials.
    assert.equal(classifyProxyTestError(new Error("SOCKS5 authentication failed")), "auth");
    assert.equal(classifyProxyTestError(new Error("HTTP proxy error: HTTP/1.1 407 Proxy Authentication Required")), "auth");
    assert.equal(classifyProxyTestError(new Error("SOCKS5 authentication method not supported")), "auth");

    assert.equal(classifyProxyTestError(new Error("Proxy connection timeout to db:22")), "timeout");
    assert.equal(Object.assign(new Error("x"), { code: "ETIMEDOUT" }) && classifyProxyTestError(Object.assign(new Error("x"), { code: "ETIMEDOUT" })), "timeout");

    assert.equal(classifyProxyTestError(Object.assign(new Error("x"), { code: "ECONNREFUSED" })), "refused");
    assert.equal(classifyProxyTestError(Object.assign(new Error("x"), { code: "ENOTFOUND" })), "dns");
    assert.equal(classifyProxyTestError(Object.assign(new Error("x"), { code: "EAI_AGAIN" })), "dns");
});

test("classifyProxyTestError falls back to a generic code", () => {
    assert.equal(classifyProxyTestError(new Error("something odd")), "failed");
    assert.equal(classifyProxyTestError(undefined), "failed");
    assert.equal(classifyProxyTestError(new Error("")), "failed");
});

test("classifyProxyTestError never returns text derived from the error", () => {
    const secret = "hunter2-super-secret";
    const codes = new Set(["auth", "timeout", "refused", "dns", "failed"]);
    for (const message of [
        `HTTP proxy error: Proxy-Authorization: Basic ${Buffer.from(`ada:${secret}`).toString("base64")}`,
        `ProxyCommand exited with code 1: corkscrew proxy 8080 %h %p ${secret}`,
        secret,
    ]) {
        const code = classifyProxyTestError(new Error(message));
        assert.ok(codes.has(code), `unexpected code ${code}`);
        assert.ok(!code.includes(secret));
    }
});

test("testProxy reports a coded failure and never leaks the target credentials", async () => {
    const { testProxy } = require("./connectionDiagnosticsBridge.cjs");

    assert.deepEqual(
        await testProxy({}, { hostname: "db.internal", port: 22 }),
        { success: false, error: "invalid" },
        "a missing proxy is rejected before any socket is opened",
    );
    assert.deepEqual(
        await testProxy({}, { proxy: { type: "socks5", host: "127.0.0.1", port: 1 } }),
        { success: false, error: "invalid" },
        "a missing target is rejected",
    );

    // Port 1 on loopback refuses; the point is the shape of the answer.
    const result = await testProxy({}, {
        proxy: { type: "socks5", host: "127.0.0.1", port: 1, username: "ada", password: "hunter2" },
        hostname: "db.internal",
        port: 22,
    });
    assert.equal(result.success, false);
    assert.ok(["refused", "failed", "timeout"].includes(result.error), result.error);
    assert.ok(!JSON.stringify(result).includes("hunter2"));
});

test("testProxy succeeds through a working proxy and closes the socket", async () => {
    // Minimal SOCKS5 server: no-auth greeting, then accept the CONNECT.
    const proxyServer = net.createServer((socket) => {
        let stage = 0;
        socket.on("data", () => {
            if (stage === 0) {
                socket.write(Buffer.from([0x05, 0x00]));
                stage = 1;
                return;
            }
            socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
        });
    });
    await new Promise((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
    const { port } = proxyServer.address();

    try {
        const { testProxy } = require("./connectionDiagnosticsBridge.cjs");
        const result = await testProxy({}, {
            proxy: { type: "socks5", host: "127.0.0.1", port },
            hostname: "db.internal",
            port: 22,
        });
        assert.equal(result.success, true, result.error);
        assert.equal(typeof result.elapsedMs, "number");
        // The probe must not hold the connection open.
        await new Promise((resolve) => setTimeout(resolve, 50));
        const open = await new Promise((resolve, reject) => {
            proxyServer.getConnections((err, count) => (err ? reject(err) : resolve(count)));
        });
        assert.equal(open, 0, "the test socket must be closed");
    } finally {
        await new Promise((resolve) => proxyServer.close(resolve));
    }
});
