import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createFollowWanInvitePayload,
  decodeAnyFollowInviteShareString,
  decodeFollowWanInviteShareString,
  encodeFollowWanInviteShareString,
  parseRelayEndpoint,
} from "./sessionFollowWan";
import {
  createFollowInvitePayload,
  encodeFollowInviteShareString,
} from "./sessionFollowInvite";

test("parseRelayEndpoint accepts host:port and ws urls", () => {
  assert.deepEqual(parseRelayEndpoint("relay.example.com:7788"), {
    host: "relay.example.com",
    port: 7788,
  });
  assert.deepEqual(parseRelayEndpoint("wss://relay.example.com:443/follow"), {
    host: "relay.example.com",
    port: 443,
  });
  assert.equal(parseRelayEndpoint("https://evil.example"), null);
});

test("WAN invite share string round-trips", () => {
  const payload = createFollowWanInvitePayload({
    relayHost: "relay.example.com",
    relayPort: 7788,
    sessionId: "sess-1",
    hostLabel: "prod",
    token: "0123456789abcdef",
    now: 1000,
    ttlMs: 60_000,
  });
  assert.equal(payload.v, 2);
  const share = encodeFollowWanInviteShareString(payload);
  assert.match(share, /^magies-follow:2:/);
  const decoded = decodeFollowWanInviteShareString(share);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.payload.relayHost, "relay.example.com");
  assert.equal(decoded.payload.relayPort, 7788);
  assert.equal(decoded.payload.sessionId, "sess-1");
  assert.equal(decoded.payload.expiresAt, 61_000);
});

test("decodeAnyFollowInviteShareString routes v1 and v2", () => {
  const lan = createFollowInvitePayload({
    host: "192.168.1.10",
    port: 41234,
    sessionId: "s",
    token: "0123456789abcdef",
  });
  const lanShare = encodeFollowInviteShareString(lan);
  const wan = createFollowWanInvitePayload({
    relayHost: "127.0.0.1",
    relayPort: 9,
    sessionId: "s",
    token: "0123456789abcdef",
  });
  const wanShare = encodeFollowWanInviteShareString(wan);

  const a = decodeAnyFollowInviteShareString(lanShare);
  assert.equal(a.ok, true);
  if (a.ok) assert.equal(a.kind, "lan");

  const b = decodeAnyFollowInviteShareString(wanShare);
  assert.equal(b.ok, true);
  if (b.ok) assert.equal(b.kind, "wan");
});
