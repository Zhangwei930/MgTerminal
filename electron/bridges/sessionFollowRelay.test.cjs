const assert = require("node:assert/strict");
const net = require("node:net");
const { test } = require("node:test");
const { createFollowRelayServer } = require("./sessionFollowRelay.cjs");

function send(socket, obj) {
  socket.write(`${JSON.stringify(obj)}\n`);
}

function readLines(socket, count, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const lines = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${count} lines, got ${lines.length}: ${lines.join(" | ")}`));
    }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        lines.push(JSON.parse(line));
        if (lines.length >= count) {
          cleanup();
          resolve(lines);
        }
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
    };
    socket.on("data", onData);
  });
}

test("relay fans host data to viewer and viewer input to host", async () => {
  const relay = createFollowRelayServer({ host: "127.0.0.1", port: 0 });
  const { port } = await relay.start();

  const host = net.connect({ host: "127.0.0.1", port });
  const viewer = net.connect({ host: "127.0.0.1", port });
  await Promise.all([
    new Promise((r) => host.once("connect", r)),
    new Promise((r) => viewer.once("connect", r)),
  ]);
  host.setEncoding("utf8");
  viewer.setEncoding("utf8");

  send(host, { type: "relayJoin", role: "host", roomId: "r1", token: "0123456789abcdef" });
  const hostWelcome = await readLines(host, 1);
  assert.equal(hostWelcome[0].type, "relayWelcome");

  send(viewer, {
    type: "relayJoin",
    role: "viewer",
    roomId: "r1",
    token: "0123456789abcdef",
    displayName: "Bob",
  });
  const viewerWelcome = await readLines(viewer, 1);
  assert.equal(viewerWelcome[0].type, "relayWelcome");
  assert.equal(viewerWelcome[0].role, "viewer");

  const hostJoinNotice = await readLines(host, 1);
  assert.equal(hostJoinNotice[0].type, "viewerJoined");

  send(host, { type: "data", data: "hello-from-host" });
  const viewerData = await readLines(viewer, 1);
  assert.equal(viewerData[0].type, "data");
  assert.equal(viewerData[0].data, "hello-from-host");

  send(viewer, { type: "input", data: "ls\n" });
  const hostInput = await readLines(host, 1);
  assert.equal(hostInput[0].type, "input");
  assert.equal(hostInput[0].data, "ls\n");
  assert.ok(hostInput[0].peerId);

  host.destroy();
  viewer.destroy();
  await relay.stop();
});
