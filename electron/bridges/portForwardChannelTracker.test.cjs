const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  createPortForwardChannelTracker,
  formatSocketAddress,
} = require("./portForwardChannelTracker.cjs");

test("formatSocketAddress normalizes ipv4-mapped addresses", () => {
  assert.equal(
    formatSocketAddress({ remoteAddress: "::ffff:127.0.0.1", remotePort: 4242 }),
    "127.0.0.1:4242",
  );
});

test("attach tracks open/close and byte counters", async () => {
  const snapshots = [];
  const tracker = createPortForwardChannelTracker({
    flushMs: 10,
    onChange: (list) => snapshots.push(list),
  });

  const socket = new EventEmitter();
  const stream = new EventEmitter();
  socket.remoteAddress = "10.0.0.2";
  socket.remotePort = 5555;

  const channel = tracker.attach({
    tunnelId: "t1",
    ruleId: "r1",
    type: "local",
    source: formatSocketAddress(socket),
    destination: "192.168.1.10:80",
    socket,
    stream,
  });

  assert.equal(tracker.list().length, 1);
  assert.equal(tracker.list()[0].destination, "192.168.1.10:80");

  socket.emit("data", Buffer.from("hello"));
  stream.emit("data", Buffer.from("world!!"));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const live = tracker.list().find((entry) => entry.id === channel.id);
  assert.ok(live);
  assert.equal(live.bytesIn, 5);
  assert.equal(live.bytesOut, 7);

  socket.emit("close");
  assert.equal(tracker.list().length, 0);
  assert.ok(snapshots.some((list) => list.length === 0));
});

test("clearTunnel removes only matching channels", () => {
  const tracker = createPortForwardChannelTracker({ flushMs: 0 });
  tracker.openChannel({
    tunnelId: "a",
    ruleId: "r",
    type: "local",
    source: "1:1",
    destination: "2:2",
  });
  tracker.openChannel({
    tunnelId: "b",
    ruleId: "r2",
    type: "dynamic",
    source: "3:3",
    destination: "4:4",
  });
  tracker.clearTunnel("a");
  assert.equal(tracker.list().length, 1);
  assert.equal(tracker.list()[0].tunnelId, "b");
});
