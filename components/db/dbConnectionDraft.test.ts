import test from "node:test";
import assert from "node:assert/strict";

import {
  applyEngineToDraft,
  buildDbConnectionPayload,
  canSaveDbConnectionDraft,
  emptyDbConnectionDraft,
} from "./dbConnectionDraft.ts";

const draft = (overrides: Partial<ReturnType<typeof emptyDbConnectionDraft>> = {}) => ({
  ...emptyDbConnectionDraft(),
  ...overrides,
});

// ── canSaveDbConnectionDraft ────────────────────────────────────────────────
// Drives whether the Save button is enabled. Getting it wrong strands the user
// with a greyed-out button and nothing explaining which field is missing.

test("a draft needs both a label and a host", () => {
  assert.equal(canSaveDbConnectionDraft(draft({ label: "mgtest", hostId: "h1" })), true);
});

// Superseded by direct connections: an empty hostId now means "no tunnel",
// which is a valid configuration rather than an incomplete one.
test("a draft without a host is a direct connection, not an invalid one", () => {
  assert.equal(canSaveDbConnectionDraft(draft({ label: "mgtest", hostId: "" })), true);
});

test("a draft without a label cannot be saved", () => {
  assert.equal(canSaveDbConnectionDraft(draft({ label: "", hostId: "h1" })), false);
  assert.equal(canSaveDbConnectionDraft(draft({ label: "   ", hostId: "h1" })), false);
});

// ── applyEngineToDraft ──────────────────────────────────────────────────────
// Switching engine retargets the port, but only when the user has not chosen
// one. Overwriting a deliberate port is how a connection ends up pointed at a
// different database than intended — on a host where 5432 is already occupied
// by something else, that is the difference between a test box and production.

test("switching engine moves an untouched port to the new default", () => {
  const next = applyEngineToDraft(draft({ engine: "mysql", remotePort: 3306 }), "postgres");
  assert.equal(next.engine, "postgres");
  assert.equal(next.remotePort, 5432);
});

test("switching engine preserves a port the user typed", () => {
  const next = applyEngineToDraft(draft({ engine: "postgres", remotePort: 55432 }), "mysql");
  assert.equal(next.engine, "mysql");
  assert.equal(next.remotePort, 55432, "a deliberate port must survive an engine change");
});

test("switching engine leaves every other field alone", () => {
  const before = draft({
    label: "mgtest", hostId: "h1", remoteHost: "10.0.0.5",
    database: "app", dbUsername: "reader", dbPassword: "secret", engine: "mysql",
  });
  const next = applyEngineToDraft(before, "oracle");

  assert.equal(next.label, "mgtest");
  assert.equal(next.hostId, "h1");
  assert.equal(next.remoteHost, "10.0.0.5");
  assert.equal(next.database, "app");
  assert.equal(next.dbUsername, "reader");
  assert.equal(next.dbPassword, "secret");
});

test("switching to the same engine is a no-op for the port", () => {
  const next = applyEngineToDraft(draft({ engine: "mysql", remotePort: 3306 }), "mysql");
  assert.equal(next.remotePort, 3306);
});

// ── buildDbConnectionPayload ────────────────────────────────────────────────

test("the payload trims text fields", () => {
  const payload = buildDbConnectionPayload(draft({
    label: "  mgtest  ", hostId: "h1", remoteHost: " 10.0.0.5 ",
    database: " app ", dbUsername: " reader ",
  }));

  assert.equal(payload.label, "mgtest");
  assert.equal(payload.remoteHost, "10.0.0.5");
  assert.equal(payload.database, "app");
  assert.equal(payload.dbUsername, "reader");
});

test("an empty host address falls back to loopback", () => {
  // The tunnel terminates on the SSH host, so the database is reached at
  // 127.0.0.1 from its point of view — an empty field means "same machine".
  const payload = buildDbConnectionPayload(draft({ label: "x", hostId: "h1", remoteHost: "  " }));
  assert.equal(payload.remoteHost, "127.0.0.1");
});

test("blank optional fields become undefined rather than empty strings", () => {
  const payload = buildDbConnectionPayload(draft({
    label: "x", hostId: "h1", database: "", dbUsername: "  ", dbPassword: "",
  }));

  assert.equal(payload.database, undefined);
  assert.equal(payload.dbUsername, undefined);
  assert.equal(payload.dbPassword, undefined);
});

test("the password is passed through untrimmed", () => {
  // Trailing whitespace can be part of a password; trimming it would produce a
  // silent authentication failure with no clue why.
  const payload = buildDbConnectionPayload(draft({ label: "x", hostId: "h1", dbPassword: " s p " }));
  assert.equal(payload.dbPassword, " s p ");
});

test("the payload carries engine, host and port verbatim", () => {
  const payload = buildDbConnectionPayload(draft({
    label: "x", hostId: "h1", engine: "postgres", remotePort: 55432,
  }));

  assert.equal(payload.engine, "postgres");
  assert.equal(payload.hostId, "h1");
  assert.equal(payload.remotePort, 55432);
});

// ── emptyDbConnectionDraft ──────────────────────────────────────────────────

test("a fresh draft starts on mysql at its default port and loopback", () => {
  const fresh = emptyDbConnectionDraft();
  assert.equal(fresh.engine, "mysql");
  assert.equal(fresh.remotePort, 3306);
  assert.equal(fresh.remoteHost, "127.0.0.1");
  assert.equal(fresh.label, "");
  assert.equal(fresh.hostId, "");
});

test("a fresh draft cannot be saved", () => {
  assert.equal(canSaveDbConnectionDraft(emptyDbConnectionDraft()), false);
});

// ── editing an existing connection ──────────────────────────────────────────

import { buildDbConnectionUpdate, draftFromDbConnection } from "./dbConnectionDraft.ts";
import type { DbConnectionProfile } from "../../domain/models.ts";

const saved = (overrides: Partial<DbConnectionProfile> = {}): DbConnectionProfile =>
  ({
    id: "c1", label: "mgtest", engine: "postgres", hostId: "h1",
    remoteHost: "127.0.0.1", remotePort: 55432, database: "mgtest",
    dbUsername: "postgres", dbPassword: "s3cret", order: 1000, createdAt: 1,
    ...overrides,
  }) as DbConnectionProfile;

test("editing loads every field except the password", () => {
  const d = draftFromDbConnection(saved());

  assert.equal(d.label, "mgtest");
  assert.equal(d.engine, "postgres");
  assert.equal(d.hostId, "h1");
  assert.equal(d.remoteHost, "127.0.0.1");
  assert.equal(d.remotePort, 55432);
  assert.equal(d.database, "mgtest");
  assert.equal(d.dbUsername, "postgres");
});

// The stored password may be plaintext or an enc:v1/enc:v2 placeholder that
// failed to decrypt. Pre-filling either is wrong: the placeholder would be
// re-encrypted into nested ciphertext, and showing a real password in a form
// field is not something an edit dialog should do. Blank means "unchanged".
test("editing never pre-fills the password field", () => {
  assert.equal(draftFromDbConnection(saved({ dbPassword: "s3cret" })).dbPassword, "");
  assert.equal(draftFromDbConnection(saved({ dbPassword: "enc:v1:AAAA" })).dbPassword, "");
  assert.equal(draftFromDbConnection(saved({ dbPassword: undefined })).dbPassword, "");
});

test("a blank password on save keeps the stored one", () => {
  const next = buildDbConnectionUpdate(
    { ...draftFromDbConnection(saved()), remoteHost: "10.0.0.9" },
    saved(),
  );

  assert.equal(next.remoteHost, "10.0.0.9", "the edited field is applied");
  assert.equal(next.dbPassword, "s3cret", "the untouched password survives");
});

test("a typed password on save replaces the stored one", () => {
  const next = buildDbConnectionUpdate(
    { ...draftFromDbConnection(saved()), dbPassword: "newpass" },
    saved(),
  );
  assert.equal(next.dbPassword, "newpass");
});

test("editing preserves identity and ordering fields", () => {
  const next = buildDbConnectionUpdate(draftFromDbConnection(saved()), saved());

  assert.equal(next.id, "c1", "the id must not change");
  assert.equal(next.order, 1000);
  assert.equal(next.createdAt, 1);
});

test("editing can change engine and port together", () => {
  const next = buildDbConnectionUpdate(
    { ...draftFromDbConnection(saved()), engine: "mysql", remotePort: 3306 },
    saved(),
  );
  assert.equal(next.engine, "mysql");
  assert.equal(next.remotePort, 3306);
});

// ── direct connections ──────────────────────────────────────────────────────
//
// The SSH leg is optional. A database reachable from this machine — local,
// on the LAN, or a cloud endpoint — needs nothing but its own address. Forcing
// a saved SSH host on those is the reason the form had two different "host"
// fields, which is a real source of confusion.

test("a draft without an SSH host can be saved when it is direct", () => {
  assert.equal(
    canSaveDbConnectionDraft({ ...emptyDbConnectionDraft(), label: "local", hostId: "" }),
    true,
    "a direct connection needs no SSH host",
  );
});

test("a draft still needs a label", () => {
  assert.equal(canSaveDbConnectionDraft({ ...emptyDbConnectionDraft(), label: "", hostId: "" }), false);
  assert.equal(canSaveDbConnectionDraft({ ...emptyDbConnectionDraft(), label: "  ", hostId: "h1" }), false);
});

test("a tunnelled draft is still saveable", () => {
  assert.equal(
    canSaveDbConnectionDraft({ ...emptyDbConnectionDraft(), label: "via ssh", hostId: "h1" }),
    true,
  );
});

test("the payload keeps an empty hostId rather than inventing one", () => {
  const payload = buildDbConnectionPayload({ ...emptyDbConnectionDraft(), label: "local", hostId: "" });
  assert.equal(payload.hostId, "", "empty means direct, and must survive to the backend");
});

test("a direct draft defaults its address to loopback", () => {
  const payload = buildDbConnectionPayload({ ...emptyDbConnectionDraft(), label: "local", hostId: "", remoteHost: "" });
  assert.equal(payload.remoteHost, "127.0.0.1");
});

// ── TLS ─────────────────────────────────────────────────────────────────────

test('a new draft has TLS off, which is what a tunnelled connection wants', () => {
  assert.equal(emptyDbConnectionDraft().sslMode, 'disable');
});

test('disable stores no ssl field, so old connections keep behaving as they did', () => {
  const payload = buildDbConnectionPayload({ ...emptyDbConnectionDraft(), label: 'x' });
  assert.equal(payload.ssl, undefined);
});

test('a chosen TLS mode is stored', () => {
  const payload = buildDbConnectionPayload({
    ...emptyDbConnectionDraft(), label: 'x', sslMode: 'verify',
  });
  assert.deepEqual(payload.ssl, { mode: 'verify' });
});

test('editing a connection round-trips its TLS mode', () => {
  const draft = draftFromDbConnection({
    id: 'c1', label: 'x', engine: 'postgres', hostId: '',
    remoteHost: 'db', remotePort: 5432, ssl: { mode: 'require' }, order: 1, createdAt: 1,
  } as never);
  assert.equal(draft.sslMode, 'require');
});
