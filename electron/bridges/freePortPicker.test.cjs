const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");

const { getFreeLocalPort } = require("./freePortPicker.cjs");

test("getFreeLocalPort resolves a usable port and releases the listener", async () => {
  const port = await getFreeLocalPort({ bindAddress: "127.0.0.1" });
  assert.ok(Number.isInteger(port) && port > 0);

  // The picker must have closed its own listener — this should succeed.
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close(resolve);
    });
  });
});

test("getFreeLocalPort resolves different ports across calls", async () => {
  const a = await getFreeLocalPort();
  const b = await getFreeLocalPort();
  assert.notEqual(a, b);
});
