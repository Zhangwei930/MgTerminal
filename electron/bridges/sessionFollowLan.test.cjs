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

function connectRaw(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port }, () => resolve(socket));
    socket.on("error", reject);
  });
}

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("no message")), 3000);
    socket.setEncoding("utf8");
    const onData = (chunk) => {
      buf += chunk;
      const idx = buf.indexOf("\n");
      if (idx >= 0) {
        clearTimeout(timer);
        socket.removeListener("data", onData);
        try {
          resolve(JSON.parse(buf.slice(0, idx)));
        } catch (err) {
          reject(err);
        }
      }
    };
    socket.on("data", onData);
    socket.on("close", () => {
      clearTimeout(timer);
      if (!buf) reject(new Error("closed"));
    });
  });
}

async function createBasicInvite(sessionId) {
  follow.__resetForTests();
  lan.stopAll();
  lan.configure({ writeToSessionNow: () => {} });
  follow.startFollow(sessionId, 200, "Host");
  const created = await lan.createInvite({ sessionId, hostLabel: "x", webContentsId: 200 });
  return created.invite;
}

test("unauthenticated socket is dropped after the auth timeout", async () => {
  lan.configure({ limits: { authTimeoutMs: 150 } });
  const invite = await createBasicInvite("sess-timeout");
  try {
    const socket = await connectRaw(invite.port);
    const msg = await nextMessage(socket);
    assert.equal(msg.error, "auth_timeout");
    socket.destroy();
  } finally {
    lan.configure({ limits: { authTimeoutMs: 10_000 } });
    lan.stopInvite("sess-timeout");
    follow.__resetForTests();
  }
});

test("oversized pre-auth frame is rejected without buffering unbounded data", async () => {
  lan.configure({ limits: { maxLineBytes: 1024 } });
  const invite = await createBasicInvite("sess-frame");
  try {
    const socket = await connectRaw(invite.port);
    const msgPromise = nextMessage(socket);
    socket.write("x".repeat(5000)); // no newline
    const msg = await msgPromise;
    assert.equal(msg.error, "frame_too_large");
    socket.destroy();
  } finally {
    lan.configure({ limits: { maxLineBytes: 64 * 1024 } });
    lan.stopInvite("sess-frame");
    follow.__resetForTests();
  }
});

test("connections beyond the peer limit are refused", async () => {
  lan.configure({ limits: { maxPeers: 1 } });
  const invite = await createBasicInvite("sess-peers");
  const sockets = [];
  try {
    // First peer authenticates and takes the only slot.
    const first = await connectRaw(invite.port);
    sockets.push(first);
    first.write(`${JSON.stringify({ type: "hello", token: invite.token, displayName: "A" })}\n`);
    const welcome = await nextMessage(first);
    assert.equal(welcome.type, "welcome");

    const second = await connectRaw(invite.port);
    sockets.push(second);
    second.write(`${JSON.stringify({ type: "hello", token: invite.token, displayName: "B" })}\n`);
    const rejected = await nextMessage(second);
    assert.equal(rejected.error, "too_many_peers");
  } finally {
    for (const s of sockets) s.destroy();
    lan.configure({ limits: { maxPeers: 8 } });
    lan.stopInvite("sess-peers");
    follow.__resetForTests();
  }
});
