import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SYMLINK_DEPTH,
  countDirectoryFiles,
  estimateDirectoryBytes,
  getEntrySize,
} from "./transferDirectoryOps.ts";
import type { DirectoryWalkDeps } from "./transferDirectoryOps.ts";
import type { SftpFileEntry } from "../../../domain/models.ts";
import { DEFAULT_SFTP_FILE_TRANSFER_CONCURRENCY } from "./transferConcurrency.ts";

const entry = (overrides: Partial<SftpFileEntry> & { name: string }): SftpFileEntry => ({
  type: "file",
  size: 0,
  sizeFormatted: "",
  lastModified: 0,
  lastModifiedFormatted: "",
  ...overrides,
});

const dir = (name: string) => entry({ name, type: "directory" });
const file = (name: string, size: number) => entry({ name, size });
const dirSymlink = (name: string) => entry({ name, type: "symlink", linkTarget: "directory" });

/**
 * Builds deps backed by a plain path -> entries map. `visited` records every
 * listing so tests can assert which paths a walk did and did not touch.
 * Listing an unmapped path throws, so an unintended recursion fails loudly.
 */
function makeDeps(
  tree: Record<string, SftpFileEntry[]>,
  options: { cancelled?: Set<string>; concurrency?: number; listDelayMs?: number } = {},
): DirectoryWalkDeps & { visited: string[]; maxConcurrentListings: number } {
  const state = { visited: [] as string[], maxConcurrentListings: 0 };
  let active = 0;
  const list = async (path: string) => {
    state.visited.push(path);
    active += 1;
    state.maxConcurrentListings = Math.max(state.maxConcurrentListings, active);
    try {
      // A delay is what lets overlapping listings actually overlap; without it
      // each call resolves before the next starts and no fan-out is observable.
      if (options.listDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.listDelayMs));
      }
      const entries = tree[path];
      if (!entries) throw new Error(`unexpected listing of ${path}`);
      return entries;
    } finally {
      active -= 1;
    }
  };
  return {
    get visited() { return state.visited; },
    get maxConcurrentListings() { return state.maxConcurrentListings; },
    listLocalFiles: list,
    listRemoteFiles: (_sftpId: string, path: string) => list(path),
    isCancelled: (taskId: string) => Boolean(options.cancelled?.has(taskId)),
    readStoredConcurrency: () => options.concurrency ?? null,
  };
}

/** A root with `count` sibling subdirectories, each holding one file. */
function wideTree(count: number): Record<string, SftpFileEntry[]> {
  const tree: Record<string, SftpFileEntry[]> = {
    "/src": Array.from({ length: count }, (_, i) => dir(`d${i}`)),
  };
  for (let i = 0; i < count; i += 1) tree[`/src/d${i}`] = [file("f.txt", 10)];
  return tree;
}

// ── getEntrySize ────────────────────────────────────────────────────────────

test("getEntrySize reads numeric sizes and rejects non-positive ones", () => {
  assert.equal(getEntrySize(entry({ name: "a", size: 42 })), 42);
  assert.equal(getEntrySize(entry({ name: "a", size: 0 })), 0);
  assert.equal(getEntrySize(entry({ name: "a", size: -1 })), 0, "negative sizes floor to 0");
});

test("getEntrySize parses string sizes some SFTP servers return", () => {
  assert.equal(getEntrySize(entry({ name: "a", size: "1024" as unknown as number })), 1024);
  assert.equal(getEntrySize(entry({ name: "a", size: "0" as unknown as number })), 0);
  assert.equal(
    getEntrySize(entry({ name: "a", size: "not-a-number" as unknown as number })),
    0,
    "unparseable sizes must not produce NaN, which would poison the running total",
  );
});

test("getEntrySize treats a missing size as zero", () => {
  assert.equal(getEntrySize(entry({ name: "a", size: undefined as unknown as number })), 0);
});

// ── estimateDirectoryBytes ──────────────────────────────────────────────────

test("estimateDirectoryBytes sums file sizes across nested directories", async () => {
  const deps = makeDeps({
    "/src": [file("a.txt", 100), dir("nested"), file("b.txt", 50)],
    "/src/nested": [file("c.txt", 7), dir("deeper")],
    "/src/nested/deeper": [file("d.txt", 3)],
  });

  const total = await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1");
  assert.equal(total, 160);
});

test("estimateDirectoryBytes skips . and .. so listings cannot recurse forever", async () => {
  const deps = makeDeps({
    "/src": [entry({ name: ".", type: "directory" }), entry({ name: "..", type: "directory" }), file("a.txt", 5)],
  });

  assert.equal(await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1"), 5);
  assert.deepEqual(deps.visited, ["/src"], "no recursion into . or ..");
});

test("estimateDirectoryBytes counts symlinks as files when not following them", async () => {
  const deps = makeDeps({
    "/src": [entry({ name: "link", type: "symlink", linkTarget: "directory", size: 12 })],
  });

  const total = await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1", 0, false);
  assert.equal(total, 12, "uploads/copies treat symlinks as regular entries");
  assert.deepEqual(deps.visited, ["/src"]);
});

test("estimateDirectoryBytes descends into symlinked directories when following them", async () => {
  const deps = makeDeps({
    "/src": [dirSymlink("link")],
    "/src/link": [file("a.txt", 9)],
  });

  const total = await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1", 0, true);
  assert.equal(total, 9);
});

test("estimateDirectoryBytes stops following symlinks at the depth ceiling", async () => {
  const deps = makeDeps({
    "/src": [dirSymlink("link")],
    "/src/link": [file("a.txt", 9)],
  });

  const total = await estimateDirectoryBytes(
    deps, "/src", null, true, "utf-8", "task-1", MAX_SYMLINK_DEPTH, true,
  );
  assert.equal(total, 0, "at the ceiling the symlink is skipped entirely, contributing nothing");
  assert.deepEqual(deps.visited, ["/src"], "no listing past the ceiling");
});

test("estimateDirectoryBytes throws when the root task is cancelled", async () => {
  const deps = makeDeps({ "/src": [file("a.txt", 5)] }, { cancelled: new Set(["task-1"]) });

  await assert.rejects(
    () => estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1"),
    /Transfer cancelled/,
  );
  assert.deepEqual(deps.visited, [], "cancellation is checked before any listing");
});

test("estimateDirectoryBytes throws when a remote walk has no sftp connection", async () => {
  const deps = makeDeps({ "/src": [] });

  await assert.rejects(
    () => estimateDirectoryBytes(deps, "/src", null, false, "utf-8", "task-1"),
    /No source connection/,
  );
});

// ── countDirectoryFiles ─────────────────────────────────────────────────────

test("countDirectoryFiles counts files, not directories, across the tree", async () => {
  const deps = makeDeps({
    "/src": [file("a.txt", 1), dir("nested"), file("b.txt", 1)],
    "/src/nested": [file("c.txt", 1), dir("empty")],
    "/src/nested/empty": [],
  });

  assert.equal(await countDirectoryFiles(deps, "/src", null, true, "utf-8", "task-1"), 3);
});

test("countDirectoryFiles skips . and ..", async () => {
  const deps = makeDeps({
    "/src": [entry({ name: "." }), entry({ name: ".." }), file("a.txt", 1)],
  });

  assert.equal(await countDirectoryFiles(deps, "/src", null, true, "utf-8", "task-1"), 1);
});

test("countDirectoryFiles stops following symlinks at the depth ceiling", async () => {
  const deps = makeDeps({
    "/src": [dirSymlink("link")],
    "/src/link": [file("a.txt", 1)],
  });

  assert.equal(
    await countDirectoryFiles(deps, "/src", null, true, "utf-8", "task-1", MAX_SYMLINK_DEPTH, true),
    0,
  );
  assert.deepEqual(deps.visited, ["/src"]);
});

// Deliberate asymmetry with estimateDirectoryBytes, which throws on the same
// input. countDirectoryFiles only feeds the progress denominator, so a
// cancelled walk degrades to 0 rather than surfacing an error the caller would
// have to special-case. Pinned here so the difference is a decision, not drift.
test("countDirectoryFiles returns 0 on cancellation rather than throwing", async () => {
  const deps = makeDeps({ "/src": [file("a.txt", 1)] }, { cancelled: new Set(["task-1"]) });

  assert.equal(await countDirectoryFiles(deps, "/src", null, true, "utf-8", "task-1"), 0);
  assert.deepEqual(deps.visited, []);
});

test("countDirectoryFiles returns 0 when a remote walk has no sftp connection", async () => {
  const deps = makeDeps({ "/src": [] });

  assert.equal(await countDirectoryFiles(deps, "/src", null, false, "utf-8", "task-1"), 0);
});

// ── pre-scan concurrency ────────────────────────────────────────────────────
//
// transferDirectory walks subdirectories sequentially on purpose:
//
//   Process subdirectories sequentially to avoid unbounded concurrent SFTP
//   requests from nested Promise.all + worker pools across the tree.
//
// These two walks run *before* the transfer, over the same tree, and used to
// fan out with an unbounded Promise.all — reintroducing exactly the flood the
// transfer phase was written to avoid, on the same SSH connection.

test("estimateDirectoryBytes bounds how many listings it runs at once", async () => {
  const deps = makeDeps(wideTree(12), { concurrency: 3, listDelayMs: 2 });

  const total = await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1");

  assert.equal(total, 120, "every file is still counted");
  assert.ok(
    deps.maxConcurrentListings <= 3,
    `expected at most 3 concurrent listings, saw ${deps.maxConcurrentListings}`,
  );
});

test("countDirectoryFiles bounds how many listings it runs at once", async () => {
  const deps = makeDeps(wideTree(12), { concurrency: 3, listDelayMs: 2 });

  const count = await countDirectoryFiles(deps, "/src", null, true, "utf-8", "task-1");

  assert.equal(count, 12, "every file is still counted");
  assert.ok(
    deps.maxConcurrentListings <= 3,
    `expected at most 3 concurrent listings, saw ${deps.maxConcurrentListings}`,
  );
});

// The bound has to span the whole recursion, not reset per directory level.
// A per-level pool would allow concurrency^depth listings in flight.
test("the pre-scan bound spans nested levels, not just siblings", async () => {
  const tree: Record<string, SftpFileEntry[]> = {
    "/src": [dir("a"), dir("b"), dir("c"), dir("d")],
  };
  for (const top of ["a", "b", "c", "d"]) {
    tree[`/src/${top}`] = [dir("x"), dir("y"), dir("z")];
    for (const leaf of ["x", "y", "z"]) tree[`/src/${top}/${leaf}`] = [file("f.txt", 1)];
  }
  const deps = makeDeps(tree, { concurrency: 2, listDelayMs: 2 });

  await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1");

  assert.ok(
    deps.maxConcurrentListings <= 2,
    `expected at most 2 concurrent listings across the whole tree, saw ${deps.maxConcurrentListings}`,
  );
});

test("pre-scan falls back to the default bound when no setting is stored", async () => {
  const deps = makeDeps(wideTree(10), { listDelayMs: 2 });

  await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1");

  assert.ok(
    deps.maxConcurrentListings <= DEFAULT_SFTP_FILE_TRANSFER_CONCURRENCY,
    `expected at most ${DEFAULT_SFTP_FILE_TRANSFER_CONCURRENCY}, saw ${deps.maxConcurrentListings}`,
  );
});

// Jittered listings across a deep, wide tree: slots are freed and reclaimed in
// an order no single hand-written case would cover.
test("the pre-scan bound holds under a deep, wide tree with jittered listings", async () => {
  const tree: Record<string, SftpFileEntry[]> = { "/src": [] };
  const build = (path: string, depth: number, breadth: number) => {
    if (depth === 0) {
      tree[path] = [file("f.txt", 1)];
      return;
    }
    tree[path] = Array.from({ length: breadth }, (_, i) => dir(`n${i}`));
    for (let i = 0; i < breadth; i += 1) build(`${path}/n${i}`, depth - 1, breadth);
  };
  build("/src", 3, 4);

  let active = 0;
  let maxActive = 0;
  const list = async (path: string) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    try {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 4));
      return tree[path] ?? [];
    } finally {
      active -= 1;
    }
  };
  const deps: DirectoryWalkDeps = {
    listLocalFiles: list,
    listRemoteFiles: (_id: string, path: string) => list(path),
    isCancelled: () => false,
    readStoredConcurrency: () => 4,
  };

  const total = await estimateDirectoryBytes(deps, "/src", null, true, "utf-8", "task-1");

  assert.equal(total, 64, "4^3 leaf files, one byte each");
  assert.ok(maxActive <= 4, `expected at most 4 concurrent listings, saw ${maxActive}`);
});
