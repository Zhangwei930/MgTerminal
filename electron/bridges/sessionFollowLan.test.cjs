"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const follow = require("./sessionFollowManager.cjs");
const lan = require("./sessionFollowLan.cjs");

test("encode/decode share string", () => {
  const payload = {
    v: 1,
    host: "192.168.0.2",
    port: 12345,
    token: "aabbccddeeff0011",
    sessionId: "s1",
    expiresAt: Date.now() + 60_000,
  };
  const share = lan.encodeShare(payload);
  const decoded = lan.decodeShare(share);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.payload.port, 12345);
  assert.equal(decoded.payload.token, "aabbccddeeff0011");
});

test("LAN invite accepts hello and relays granted input", async () => {
  follow.__resetForTests();
  lan.stopAll();

  let written = "";
  lan.configure({
    writeToSessionNow: (_payload, data) => {
      written += data;
    },
  });

  assert.equal(follow.startFollow("sess-lan", 101, "Host").success, true);

  const created = await lan.createInvite({
    sessionId: "sess-lan",
    hostLabel: "demo",
    webContentsId: 101,
  });
  assert.equal(created.success, true);
  assert.ok(created.invite.port > 0);

  const { token, port } = created.invite;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), 2500);
    const poll = setInterval(() => {
      if (written.includes("hello-lan")) {
        clearInterval(poll);
        clearTimeout(timer);
        socket.end();
        resolve();
      }
    }, 20);
    const socket = net.connect({ host: "127.0.0.1", port }, () => {
      socket.write(`${JSON.stringify({ type: "hello", token, displayName: "Peer" })}\n`);
    });
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.type === "welcome") {
          const grant = follow.grantControl("sess-lan", 101, msg.peerId);
          assert.equal(grant.success, true);
          socket.write(`${JSON.stringify({ type: "input", data: "hello-lan" })}\n`);
        }
      }
    });
    socket.on("error", (err) => {
      clearInterval(poll);
      clearTimeout(timer);
      reject(err);
    });
  });

  assert.match(written, /hello-lan/);
  lan.stopInvite("sess-lan");
  follow.__resetForTests();
});
