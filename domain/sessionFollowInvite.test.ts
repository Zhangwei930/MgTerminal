import test from "node:test";
import assert from "node:assert/strict";

import {
  createFollowInvitePayload,
  decodeFollowInviteShareString,
  encodeFollowInviteShareString,
  formatFollowInviteCode,
  isFollowInviteExpired,
  listLanIPv4Addresses,
} from "./sessionFollowInvite.ts";

test("invite encode/decode round-trip", () => {
  const payload = createFollowInvitePayload({
    host: "192.168.1.10",
    port: 48765,
    sessionId: "sess-1",
    hostLabel: "prod",
    token: "deadbeefcafebabe",
    now: 1_000_000,
    ttlMs: 60_000,
  });
  const share = encodeFollowInviteShareString(payload);
  assert.match(share, /^magies-follow:1:/);
  const decoded = decodeFollowInviteShareString(share);
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.equal(decoded.payload.host, "192.168.1.10");
    assert.equal(decoded.payload.port, 48765);
    assert.equal(decoded.payload.token, "deadbeefcafebabe");
    assert.equal(decoded.payload.sessionId, "sess-1");
  }
});

test("expiry helper", () => {
  const payload = createFollowInvitePayload({
    host: "10.0.0.1",
    port: 1,
    sessionId: "s",
    token: "0123456789abcdef",
    now: 1000,
    ttlMs: 100,
  });
  assert.equal(isFollowInviteExpired(payload, 1050), false);
  assert.equal(isFollowInviteExpired(payload, 1100), true);
});

test("display code is stable for token", () => {
  assert.equal(formatFollowInviteCode("aa"), formatFollowInviteCode("aa"));
  assert.notEqual(formatFollowInviteCode("aa"), formatFollowInviteCode("bb"));
  assert.match(formatFollowInviteCode("aa"), /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
});

test("listLanIPv4Addresses filters internals", () => {
  const ips = listLanIPv4Addresses({
    lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
    en0: [
      { family: "IPv4", address: "192.168.1.5", internal: false },
      { family: "IPv6", address: "fe80::1", internal: false },
    ],
  });
  assert.deepEqual(ips, ["192.168.1.5"]);
});
