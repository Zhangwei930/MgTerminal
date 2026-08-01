import test from "node:test";
import assert from "node:assert/strict";

import {
  cancelPendingUploadConflicts,
  requestUploadConflictDecision,
  resolveUploadConflict,
} from "./uploadConflictCoordinator.ts";
import type { UploadConflictDeps, UploadConflictResolver } from "./uploadConflictCoordinator.ts";
import type { FileConflict, FileConflictAction } from "../../../domain/models.ts";

function makeDeps(overrides: Partial<UploadConflictDeps> = {}) {
  let conflicts: FileConflict[] = [];
  const resolvers = new Map<string, UploadConflictResolver>();
  let nextId = 0;
  const deps: UploadConflictDeps = {
    setConflicts: (updater) => {
      conflicts = typeof updater === "function" ? updater(conflicts) : updater;
    },
    resolvers,
    newConflictId: () => `conflict-${++nextId}`,
    ...overrides,
  };
  return {
    deps,
    resolvers,
    get conflicts() { return conflicts; },
  };
}

const incoming = (overrides: Record<string, unknown> = {}) => ({
  fileName: "report.csv",
  targetPath: "/backup/report.csv",
  isDirectory: false,
  existingType: "file" as const,
  existingSize: 10,
  newSize: 20,
  existingModified: 1,
  newModified: 2,
  applyToAllCount: 3,
  ...overrides,
});

// ── requestUploadConflictDecision ───────────────────────────────────────────

test("a first conflict is surfaced to the user and waits for an answer", async () => {
  const ctx = makeDeps();
  const defaults = new Map<string, FileConflictAction>();

  const pending = requestUploadConflictDecision(ctx.deps, defaults, incoming());

  assert.equal(ctx.conflicts.length, 1, "the conflict must reach the UI");
  assert.equal(ctx.conflicts[0].fileName, "report.csv");
  assert.equal(ctx.conflicts[0].sourcePath, "local");
  assert.equal(ctx.resolvers.size, 1, "a resolver is parked until the user answers");

  resolveUploadConflict(ctx.deps, ctx.conflicts, ctx.conflicts[0].transferId, "replace");
  assert.equal(await pending, "replace");
});

test("a remembered choice answers immediately without prompting again", async () => {
  const ctx = makeDeps();
  const defaults = new Map<string, FileConflictAction>();

  const first = requestUploadConflictDecision(ctx.deps, defaults, incoming());
  resolveUploadConflict(ctx.deps, ctx.conflicts, ctx.conflicts[0].transferId, "skip", true);
  assert.equal(await first, "skip");

  const second = await requestUploadConflictDecision(ctx.deps, defaults, incoming({ fileName: "other.csv" }));

  assert.equal(second, "skip", "the remembered action applies");
  assert.equal(ctx.conflicts.length, 0, "no second prompt");
  assert.equal(ctx.resolvers.size, 0, "and nothing left parked");
});

test("a choice is only remembered when applyToAll was set", async () => {
  const ctx = makeDeps();
  const defaults = new Map<string, FileConflictAction>();

  const first = requestUploadConflictDecision(ctx.deps, defaults, incoming());
  resolveUploadConflict(ctx.deps, ctx.conflicts, ctx.conflicts[0].transferId, "skip", false);
  await first;

  requestUploadConflictDecision(ctx.deps, defaults, incoming({ fileName: "other.csv" }));
  assert.equal(ctx.conflicts.length, 1, "a one-off choice must not silence later prompts");
});

test("a remembered choice does not leak to a different conflict kind", async () => {
  const ctx = makeDeps();
  const defaults = new Map<string, FileConflictAction>();

  const first = requestUploadConflictDecision(ctx.deps, defaults, incoming());
  resolveUploadConflict(ctx.deps, ctx.conflicts, ctx.conflicts[0].transferId, "skip", true);
  await first;

  // A directory landing on a directory is a different decision than a file
  // landing on a file, so it has to ask again.
  requestUploadConflictDecision(
    ctx.deps, defaults, incoming({ isDirectory: true, existingType: "directory" }),
  );
  assert.equal(ctx.conflicts.length, 1);
});

test("the surfaced conflict carries the sizes and timestamps used to compare", () => {
  const ctx = makeDeps();
  requestUploadConflictDecision(ctx.deps, new Map(), incoming());

  const surfaced = ctx.conflicts[0];
  assert.equal(surfaced.existingSize, 10);
  assert.equal(surfaced.newSize, 20);
  assert.equal(surfaced.existingModified, 1);
  assert.equal(surfaced.newModified, 2);
  assert.equal(surfaced.applyToAllCount, 3);
});

// ── resolveUploadConflict ───────────────────────────────────────────────────

test("resolving removes the conflict from the UI and unparks its resolver", async () => {
  const ctx = makeDeps();
  const pending = requestUploadConflictDecision(ctx.deps, new Map(), incoming());
  const id = ctx.conflicts[0].transferId;

  resolveUploadConflict(ctx.deps, ctx.conflicts, id, "overwrite" as FileConflictAction);

  assert.equal(await pending, "overwrite");
  assert.equal(ctx.conflicts.length, 0);
  assert.equal(ctx.resolvers.size, 0, "a resolved conflict must not be resolvable twice");
});

test("resolving an unknown id is a no-op rather than a crash", () => {
  const ctx = makeDeps();
  assert.doesNotThrow(() => resolveUploadConflict(ctx.deps, ctx.conflicts, "nope", "skip"));
});

test("resolving twice does not reject the second time", async () => {
  const ctx = makeDeps();
  const pending = requestUploadConflictDecision(ctx.deps, new Map(), incoming());
  const id = ctx.conflicts[0].transferId;

  resolveUploadConflict(ctx.deps, ctx.conflicts, id, "skip");
  await pending;
  assert.doesNotThrow(() => resolveUploadConflict(ctx.deps, ctx.conflicts, id, "replace"));
});

// applyToAll is only honoured when the conflict is still in the list handed in.
// Pinned because it makes "apply to all" silently a one-off if the list is stale.
test("applyToAll is ignored when the conflict is absent from the supplied list", async () => {
  const ctx = makeDeps();
  const defaults = new Map<string, FileConflictAction>();
  const pending = requestUploadConflictDecision(ctx.deps, defaults, incoming());
  const id = ctx.conflicts[0].transferId;

  resolveUploadConflict(ctx.deps, [], id, "skip", true);
  await pending;

  assert.equal(defaults.size, 0, "nothing was remembered");
});

// ── cancelPendingUploadConflicts ────────────────────────────────────────────

test("cancelling answers every pending conflict with stop", async () => {
  const ctx = makeDeps();
  const a = requestUploadConflictDecision(ctx.deps, new Map(), incoming({ fileName: "a" }));
  const b = requestUploadConflictDecision(ctx.deps, new Map(), incoming({ fileName: "b" }));

  cancelPendingUploadConflicts(ctx.deps);

  assert.equal(await a, "stop");
  assert.equal(await b, "stop");
  assert.equal(ctx.conflicts.length, 0);
  assert.equal(ctx.resolvers.size, 0);
});

test("cancelling with nothing pending leaves the list untouched", () => {
  const ctx = makeDeps();
  let cleared = false;
  const deps = { ...ctx.deps, setConflicts: () => { cleared = true; } };

  cancelPendingUploadConflicts(deps);

  assert.equal(cleared, false, "an empty cancel must not trigger a state write");
});

test("an upload awaiting an answer cannot hang after cancellation", async () => {
  // Every parked promise must settle, or the upload loop waits forever.
  const ctx = makeDeps();
  const pending = requestUploadConflictDecision(ctx.deps, new Map(), incoming());

  cancelPendingUploadConflicts(ctx.deps);

  const settled = await Promise.race([
    pending,
    new Promise((resolve) => setTimeout(() => resolve("TIMED_OUT"), 50)),
  ]);
  assert.equal(settled, "stop");
});
