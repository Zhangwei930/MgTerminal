"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const follow = require("./sessionFollowManager.cjs");

test("follow manager start join grant write gate", () => {
  follow.__resetForTests();
  const start = follow.startFollow("s1", 1, "Host");
  assert.equal(start.success, true);
  assert.deepEqual(follow.getWebContentsIds("s1"), [1]);

  const join = follow.joinFollow("s1", 2, "Viewer");
  assert.equal(join.success, true);
  assert.equal(follow.shouldBlockWrite("s1", 1).blocked, false);
  assert.equal(follow.shouldBlockWrite("s1", 2).blocked, true);

  follow.requestControl("s1", 2);
  const grant = follow.grantControl("s1", 1, join.peerId);
  assert.equal(grant.success, true);
  assert.equal(follow.shouldBlockWrite("s1", 2).blocked, false);
  assert.equal(follow.shouldBlockWrite("s1", 1).blocked, true);

  follow.revokeControl("s1", 1);
  assert.equal(follow.shouldBlockWrite("s1", 1).blocked, false);

  follow.stopFollow("s1", 1);
  assert.equal(follow.getWebContentsIds("s1"), null);
  assert.equal(follow.shouldBlockWrite("s1", 2).blocked, false);
});

test("follow audit persists across reset when disk path configured", () => {
  follow.__resetForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "follow-mgr-audit-"));
  const filePath = path.join(dir, "follow-audit-v1.json");
  follow.configureAuditPersistence({ filePath });

  follow.startFollow("persist-1", 1, "Host");
  follow.joinFollow("persist-1", 2, "Viewer");
  follow.stopFollow("persist-1", 1);
  const before = follow.getAudit("persist-1");
  assert.ok(before.length >= 3);
  assert.ok(before.some((e) => e.type === "follow_started"));
  assert.ok(before.some((e) => e.type === "follow_stopped"));

  follow.flushAuditPersist();

  // Simulate process restart: clear memory, keep disk.
  follow.__resetForTests();
  follow.configureAuditPersistence({ filePath });
  const after = follow.getAudit("persist-1");
  assert.ok(after.length >= 3);
  assert.ok(after.some((e) => e.type === "peer_joined"));

  fs.rmSync(dir, { recursive: true, force: true });
});

test("clearAudit wipes memory and disk for a session", () => {
  follow.__resetForTests();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "follow-mgr-clear-"));
  const filePath = path.join(dir, "follow-audit-v1.json");
  follow.configureAuditPersistence({ filePath });

  follow.startFollow("clear-1", 1, "Host");
  follow.joinFollow("clear-1", 2, "Viewer");
  follow.stopFollow("clear-1", 1);
  assert.ok(follow.getAudit("clear-1").length >= 2);

  const cleared = follow.clearAudit("clear-1");
  assert.equal(cleared.success, true);
  assert.deepEqual(follow.getAudit("clear-1"), []);

  follow.__resetForTests();
  follow.configureAuditPersistence({ filePath });
  assert.deepEqual(follow.getAudit("clear-1"), []);

  fs.rmSync(dir, { recursive: true, force: true });
});
