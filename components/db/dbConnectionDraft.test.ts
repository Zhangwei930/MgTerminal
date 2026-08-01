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

test("a draft without a host cannot be saved", () => {
  // The host is picked through a button-opened selector rather than typed, so
  // it is the field most easily missed — and an unsaved host means an empty
  // selector and a permanently disabled button.
  assert.equal(canSaveDbConnectionDraft(draft({ label: "mgtest", hostId: "" })), false);
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
