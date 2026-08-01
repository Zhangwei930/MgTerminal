import test from "node:test";
import assert from "node:assert/strict";

import {
  canReplaceSftpConflict,
  describeSftpExistingKind,
  describeSftpIncomingKind,
  getSftpConflictTypeKey,
} from "./sftpConflict.ts";

// ── canReplaceSftpConflict ──────────────────────────────────────────────────
// Gates whether "replace" is offered at all. Saying yes to a mismatched pair
// means a transfer tries to overwrite a directory with a file (or vice versa),
// which no SFTP server does cleanly.

test("replace is allowed when both sides are the same kind", () => {
  assert.equal(canReplaceSftpConflict(false, "file"), true);
  assert.equal(canReplaceSftpConflict(true, "directory"), true);
});

test("replace is refused when a file would overwrite a directory", () => {
  assert.equal(canReplaceSftpConflict(false, "directory"), false);
  assert.equal(canReplaceSftpConflict(true, "file"), false);
});

test("a symlink target counts as not-a-directory", () => {
  // `(existingType === "directory") === isDirectory` puts symlink on the file
  // side, so an incoming file may replace it and an incoming directory may not.
  assert.equal(canReplaceSftpConflict(false, "symlink"), true);
  assert.equal(canReplaceSftpConflict(true, "symlink"), false);
});

test("replace is allowed when the existing type is unknown", () => {
  // Nothing is known about the target, so the decision is deferred to the
  // transfer itself rather than pre-emptively hiding the option.
  assert.equal(canReplaceSftpConflict(false, undefined), true);
  assert.equal(canReplaceSftpConflict(true, undefined), true);
});

// ── getSftpConflictTypeKey ──────────────────────────────────────────────────
// Keys the "apply to all" / remembered choice. Two conflicts sharing a key
// share a decision, so collapsing distinct pairs would apply a choice made
// about one kind of clash to a different one.

test("the conflict key separates every incoming/existing pair", () => {
  const keys = [
    getSftpConflictTypeKey(false, "file"),
    getSftpConflictTypeKey(false, "directory"),
    getSftpConflictTypeKey(false, "symlink"),
    getSftpConflictTypeKey(true, "file"),
    getSftpConflictTypeKey(true, "directory"),
    getSftpConflictTypeKey(true, "symlink"),
  ];

  assert.equal(new Set(keys).size, keys.length, "distinct pairs must not share a remembered choice");
});

test("the conflict key keeps symlink distinct, unlike the description", () => {
  assert.equal(getSftpConflictTypeKey(false, "symlink"), "file:symlink");
  assert.notEqual(getSftpConflictTypeKey(false, "symlink"), getSftpConflictTypeKey(false, "file"));
});

test("an unknown existing type gets its own key rather than merging with a known one", () => {
  assert.equal(getSftpConflictTypeKey(false, undefined), "file:unknown");
  assert.notEqual(getSftpConflictTypeKey(false, undefined), getSftpConflictTypeKey(false, "file"));
});

// ── description helpers ─────────────────────────────────────────────────────

test("descriptions name the incoming kind", () => {
  assert.equal(describeSftpIncomingKind(true), "directory");
  assert.equal(describeSftpIncomingKind(false), "file");
});

test("a symlink is described as a file in user-facing text", () => {
  // Deliberate simplification: the message says "replace existing file", not
  // "symlink". Pinned because the key above does distinguish the two, so the
  // asymmetry is easy to mistake for a bug.
  assert.equal(describeSftpExistingKind("symlink"), "file");
  assert.equal(describeSftpExistingKind(undefined), "file");
  assert.equal(describeSftpExistingKind("directory"), "directory");
  assert.equal(describeSftpExistingKind("file"), "file");
});
