import test from "node:test";
import assert from "node:assert/strict";

import {
  appendFollowAudit,
  canWriteFollowInput,
  createFollowAuditEvent,
  createFollowPeer,
  createFollowRoom,
  exportFollowAuditNdjson,
  exportFollowAuditText,
  formatFollowAuditLine,
  grantFollowControl,
  joinFollowRoom,
  leaveFollowRoom,
  listFollowWebContentsIds,
  requestFollowControl,
  revokeFollowControl,
  toFollowPublicState,
} from "./sessionFollow.ts";

const owner = createFollowPeer({
  peerId: "owner",
  webContentsId: 1,
  displayName: "Host",
  role: "controller",
  now: 1000,
});

test("create room makes owner the controller", () => {
  const room = createFollowRoom({ sessionId: "s1", owner, now: 1000 });
  assert.equal(room.controllerPeerId, "owner");
  assert.equal(room.peers.length, 1);
  assert.deepEqual(listFollowWebContentsIds(room), [1]);
});

test("join adds viewer; write gate blocks non-controller", () => {
  let room = createFollowRoom({ sessionId: "s1", owner });
  const viewer = createFollowPeer({
    peerId: "v1",
    webContentsId: 2,
    displayName: "Viewer",
    role: "viewer",
  });
  const joined = joinFollowRoom(room, viewer);
  assert.equal(joined.joined, true);
  room = joined.room;
  assert.equal(canWriteFollowInput(room, 1).allowed, true);
  assert.equal(canWriteFollowInput(room, 2).allowed, false);
  assert.equal(canWriteFollowInput(null, 2).allowed, true);
});

test("request and grant control handoff", () => {
  let room = createFollowRoom({ sessionId: "s1", owner });
  room = joinFollowRoom(room, createFollowPeer({
    peerId: "v1",
    webContentsId: 2,
    displayName: "Viewer",
    role: "viewer",
  })).room;

  const requested = requestFollowControl(room, "v1");
  assert.equal(requested.requested, true);
  room = requested.room;
  assert.equal(room.pendingControlRequests.includes("v1"), true);

  const granted = grantFollowControl(room, "owner", "v1");
  assert.equal(granted.granted, true);
  room = granted.room;
  assert.equal(room.controllerPeerId, "v1");
  assert.equal(canWriteFollowInput(room, 2).allowed, true);
  assert.equal(canWriteFollowInput(room, 1).allowed, false);

  const revoked = revokeFollowControl(room, "owner");
  assert.equal(revoked.revoked, true);
  room = revoked.room;
  assert.equal(room.controllerPeerId, "owner");
});

test("leave controller returns control to owner", () => {
  let room = createFollowRoom({ sessionId: "s1", owner });
  room = joinFollowRoom(room, createFollowPeer({
    peerId: "v1",
    webContentsId: 2,
    displayName: "Viewer",
    role: "viewer",
  })).room;
  room = grantFollowControl(room, "owner", "v1").room;
  const left = leaveFollowRoom(room, "v1");
  assert.equal(left.left, true);
  assert.equal(left.controllerChanged, true);
  assert.equal(left.room?.controllerPeerId, "owner");
});

test("public state snapshot", () => {
  const room = createFollowRoom({ sessionId: "s1", owner });
  const state = toFollowPublicState(room);
  assert.equal(state.peerCount, 1);
  assert.equal(state.peers[0]?.displayName, "Host");
});

test("appendFollowAudit caps ring buffer", () => {
  let events = [] as ReturnType<typeof createFollowAuditEvent>[];
  for (let i = 0; i < 5; i += 1) {
    events = appendFollowAudit(
      events,
      createFollowAuditEvent({ sessionId: "s1", type: "peer_joined", detail: String(i), now: 1000 + i }),
      3,
    );
  }
  assert.equal(events.length, 3);
  assert.equal(events[0]?.detail, "2");
  assert.equal(events[2]?.detail, "4");
});

test("formatFollowAuditLine and export formats", () => {
  const event = createFollowAuditEvent({
    sessionId: "s1",
    type: "control_granted",
    actorPeerId: "owner",
    targetPeerId: "v1",
    detail: "ok",
    now: Date.UTC(2026, 0, 1, 12, 30, 45),
  });
  const line = formatFollowAuditLine(event, {
    nameByPeerId: { owner: "Host", v1: "Viewer" },
    locale: "en-GB",
  });
  assert.match(line, /Control granted/);
  assert.match(line, /Host → Viewer/);
  assert.match(line, /ok/);

  const ndjson = exportFollowAuditNdjson([event]);
  const parsed = JSON.parse(ndjson);
  assert.equal(parsed.type, "control_granted");
  assert.equal(parsed.actorPeerId, "owner");

  const text = exportFollowAuditText([event], {
    nameByPeerId: { owner: "Host", v1: "Viewer" },
    header: "# follow audit",
    locale: "en-GB",
  });
  assert.ok(text.startsWith("# follow audit\n"));
  assert.match(text, /Control granted/);
});
