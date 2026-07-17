"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("./sessionFollowAuditStore.cjs");

test("sanitizeEvent drops invalid payloads", () => {
  assert.equal(store.sanitizeEvent(null), null);
  assert.equal(store.sanitizeEvent({ ts: 1, sessionId: "s", type: "" }), null);
  const ok = store.sanitizeEvent({
    ts: 10,
    sessionId: "s1",
    type: "peer_joined",
    actorPeerId: "a",
    detail: "x",
  });
  assert.equal(ok.sessionId, "s1");
  assert.equal(ok.type, "peer_joined");
});

test("append and normalize caps events and sessions", () => {
  let s = store.emptyStore();
  for (let i = 0; i < 5; i += 1) {
    s = store.appendSessionEvent(s, {
      ts: i + 1,
      sessionId: "s1",
      type: "peer_joined",
      detail: String(i),
    }, { maxEvents: 3 });
  }
  assert.equal(s.sessions.s1.length, 3);
  assert.equal(s.sessions.s1[0].detail, "2");

  for (let i = 0; i < 5; i += 1) {
    s = store.appendSessionEvent(s, {
      ts: 100 + i,
      sessionId: `sess-${i}`,
      type: "follow_started",
    }, { maxSessions: 2, maxEvents: 10 });
  }
  assert.equal(Object.keys(s.sessions).length, 2);
});

test("load/save round-trip on disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "follow-audit-"));
  const filePath = path.join(dir, "follow-audit-v1.json");
  let s = store.emptyStore();
  s = store.appendSessionEvent(s, {
    ts: 42,
    sessionId: "abc",
    type: "control_granted",
    actorPeerId: "owner",
    targetPeerId: "v1",
  });
  assert.equal(store.saveStore(filePath, s), true);
  const loaded = store.loadStore(filePath);
  assert.equal(loaded.sessions.abc.length, 1);
  assert.equal(loaded.sessions.abc[0].type, "control_granted");
  fs.rmSync(dir, { recursive: true, force: true });
});
