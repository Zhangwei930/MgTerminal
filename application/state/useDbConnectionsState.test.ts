import test from "node:test";
import assert from "node:assert/strict";

import { appendDbConnection } from "./useDbConnectionsState.ts";
import type { DbConnectionProfile } from "../../domain/models.ts";

const existing = (overrides: Partial<DbConnectionProfile> = {}): DbConnectionProfile =>
  ({
    id: "existing-1",
    label: "old",
    engine: "postgres",
    hostId: "h1",
    remoteHost: "127.0.0.1",
    remotePort: 5432,
    order: 1000,
    createdAt: 1,
    ...overrides,
  }) as DbConnectionProfile;

const incoming = {
  label: "new",
  engine: "postgres" as const,
  hostId: "h1",
  remoteHost: "127.0.0.1",
  remotePort: 55432,
};

// This is the operation that lost data: adding a connection replaced the list
// instead of extending it, because it ran against an empty `prev` while the
// saved list was still being decrypted. The function itself must always append.

test("appending keeps every existing connection", () => {
  const next = appendDbConnection([existing()], incoming, () => "new-1", () => 2);

  assert.equal(next.length, 2);
  assert.equal(next[0].id, "existing-1", "the existing one is still first");
  assert.equal(next[1].label, "new");
});

test("appending to several keeps all of them", () => {
  const prev = [existing({ id: "a", order: 1000 }), existing({ id: "b", order: 2000 })];
  const next = appendDbConnection(prev, incoming, () => "c", () => 3);

  assert.deepEqual(next.map((c) => c.id), ["a", "b", "c"]);
});

test("appending to an empty list yields exactly one", () => {
  const next = appendDbConnection([], incoming, () => "new-1", () => 2);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, "new-1");
});

test("the new connection sorts after the existing ones", () => {
  const prev = [existing({ id: "a", order: 1000 }), existing({ id: "b", order: 2000 })];
  const next = appendDbConnection(prev, incoming, () => "c", () => 3);

  const added = next.find((c) => c.id === "c")!;
  assert.ok(added.order > 2000, `expected order past 2000, got ${added.order}`);
});

test("id and timestamp come from the injected factories", () => {
  const next = appendDbConnection([], incoming, () => "fixed-id", () => 1234);

  assert.equal(next[0].id, "fixed-id");
  assert.equal(next[0].createdAt, 1234);
});

test("the incoming fields are carried through unchanged", () => {
  const next = appendDbConnection([], incoming, () => "x", () => 1);

  assert.equal(next[0].label, "new");
  assert.equal(next[0].engine, "postgres");
  assert.equal(next[0].remotePort, 55432);
});

test("appending does not mutate the previous list", () => {
  const prev = [existing()];
  const before = prev.length;
  appendDbConnection(prev, incoming, () => "x", () => 1);

  assert.equal(prev.length, before, "the caller's array must be left alone");
});
