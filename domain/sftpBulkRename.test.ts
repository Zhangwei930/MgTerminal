import assert from "node:assert/strict";
import test from "node:test";
import { buildBulkRenamePlan, splitFileName } from "./sftpBulkRename";

test("splitFileName keeps dotfiles and multi-dot names intact", () => {
  assert.deepEqual(splitFileName("photo.jpg"), { base: "photo", ext: ".jpg" });
  assert.deepEqual(splitFileName("archive.tar.gz"), { base: "archive.tar", ext: ".gz" });
  assert.deepEqual(splitFileName("README"), { base: "README", ext: "" });
  // A leading dot is part of the name, not an extension — ".bashrc" must not
  // become base "" ext ".bashrc", or every dotfile would collapse together.
  assert.deepEqual(splitFileName(".bashrc"), { base: ".bashrc", ext: "" });
  assert.deepEqual(splitFileName(".config.json"), { base: ".config", ext: ".json" });
});

test("buildBulkRenamePlan substitutes name, ext and a padded counter", () => {
  const plan = buildBulkRenamePlan({
    names: ["b.jpg", "a.jpg", "c.png"],
    pattern: "trip_{n}{ext}",
    startAt: 1,
    padding: 3,
  });
  assert.equal(plan.error, undefined);
  // Order is the caller's order — the list the user sees is the list they get.
  assert.deepEqual(plan.entries, [
    { from: "b.jpg", to: "trip_001.jpg" },
    { from: "a.jpg", to: "trip_002.jpg" },
    { from: "c.png", to: "trip_003.png" },
  ]);
});

test("buildBulkRenamePlan can wrap the original name", () => {
  const plan = buildBulkRenamePlan({
    names: ["notes.txt", "todo.txt"],
    pattern: "2026-{name}{ext}",
  });
  assert.deepEqual(plan.entries.map((e) => e.to), ["2026-notes.txt", "2026-todo.txt"]);
});

test("buildBulkRenamePlan drops entries whose name would not change", () => {
  const plan = buildBulkRenamePlan({
    names: ["keep.txt", "move.txt"],
    pattern: "{name}{ext}",
  });
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.entries, [], "a no-op rename must not be sent to the server");
});

test("buildBulkRenamePlan refuses to map two files onto one name", () => {
  const plan = buildBulkRenamePlan({
    names: ["a.txt", "b.txt"],
    pattern: "same{ext}",
  });
  assert.equal(plan.error, "duplicate_target");
  assert.deepEqual(plan.entries, [], "nothing may run when the plan is unsafe");
});

test("buildBulkRenamePlan refuses to overwrite a file that is not being renamed", () => {
  const plan = buildBulkRenamePlan({
    names: ["a.txt"],
    pattern: "occupied{ext}",
    existingNames: ["a.txt", "occupied.txt"],
  });
  assert.equal(plan.error, "collides_with_existing");
  assert.deepEqual(plan.entries, []);
});

test("buildBulkRenamePlan allows a rename onto a name freed by the same batch", () => {
  // a.txt -> b.txt and b.txt -> c.txt: b.txt is occupied now but not after.
  const plan = buildBulkRenamePlan({
    names: ["a.txt", "b.txt"],
    pattern: "{n}.txt",
    startAt: 2,
    existingNames: ["a.txt", "b.txt"],
  });
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.entries, [
    { from: "a.txt", to: "2.txt" },
    { from: "b.txt", to: "3.txt" },
  ]);
});

test("buildBulkRenamePlan rejects patterns that produce unusable names", () => {
  assert.equal(buildBulkRenamePlan({ names: ["a.txt"], pattern: "" }).error, "empty_pattern");
  assert.equal(buildBulkRenamePlan({ names: ["a.txt"], pattern: "   " }).error, "empty_pattern");
  // A separator would move the file somewhere else entirely.
  assert.equal(buildBulkRenamePlan({ names: ["a.txt"], pattern: "../{name}" }).error, "invalid_name");
  assert.equal(buildBulkRenamePlan({ names: ["a.txt"], pattern: "sub/{name}" }).error, "invalid_name");
  assert.equal(buildBulkRenamePlan({ names: ["a.txt"], pattern: "." }).error, "invalid_name");
  assert.equal(buildBulkRenamePlan({ names: ["a.txt"], pattern: ".." }).error, "invalid_name");
});

test("buildBulkRenamePlan handles an empty selection", () => {
  const plan = buildBulkRenamePlan({ names: [], pattern: "x_{n}" });
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.entries, []);
});

test("buildBulkRenamePlan counter defaults are usable without configuration", () => {
  const plan = buildBulkRenamePlan({ names: ["a", "b"], pattern: "f{n}" });
  assert.deepEqual(plan.entries.map((e) => e.to), ["f1", "f2"]);
});
