import test from "node:test";
import assert from "node:assert/strict";

import {
  filterPaneFiles,
  isDescendantPath,
  selectMovableSources,
} from "./useSftpPaneActions.ts";
import type { SftpFileEntry } from "../../../domain/models.ts";
import type { SftpPane } from "./types.ts";

// ── isDescendantPath ────────────────────────────────────────────────────────
// Gates whether a move is allowed. Getting this wrong lets a directory be
// moved inside itself, which on SFTP means a recursive move or lost data.

test("a nested path is a descendant", () => {
  assert.equal(isDescendantPath("/srv/data/logs", "/srv/data"), true);
  assert.equal(isDescendantPath("/srv/data/logs/app.log", "/srv/data"), true);
});

test("a path is not its own descendant", () => {
  assert.equal(isDescendantPath("/srv/data", "/srv/data"), false);
  assert.equal(isDescendantPath("/srv/data/", "/srv/data"), false, "a trailing slash is the same path");
});

test("a sibling sharing a name prefix is not a descendant", () => {
  // The check must not be a bare startsWith: "/srv/data-old" begins with
  // "/srv/data" but lives beside it, and refusing to move it would be wrong.
  assert.equal(isDescendantPath("/srv/data-old", "/srv/data"), false);
  assert.equal(isDescendantPath("/srv/database", "/srv/data"), false);
});

test("a parent is not a descendant of its child", () => {
  assert.equal(isDescendantPath("/srv", "/srv/data"), false);
});

test("everything is a descendant of the posix root", () => {
  assert.equal(isDescendantPath("/srv", "/"), true);
  assert.equal(isDescendantPath("/", "/"), false, "root is not its own descendant");
});

test("windows drive roots treat any path on the drive as a descendant", () => {
  assert.equal(isDescendantPath("C:\\Users\\wei", "C:\\"), true);
  assert.equal(isDescendantPath("C:\\", "C:\\"), false);
});

test("windows paths compare case-insensitively and across separators", () => {
  assert.equal(isDescendantPath("C:\\Users\\wei\\docs", "c:\\users\\wei"), true);
  assert.equal(isDescendantPath("C:/Users/wei/docs", "C:\\Users\\wei"), true);
});

test("a windows sibling sharing a prefix is not a descendant", () => {
  assert.equal(isDescendantPath("C:\\Users\\weizhang", "C:\\Users\\wei"), false);
});

// ── selectMovableSources ────────────────────────────────────────────────────
// The safety filter in front of a move. Every rejection here prevents a
// destructive no-op or an impossible move.

test("plain sources into an unrelated directory all move", () => {
  assert.deepEqual(
    selectMovableSources(["/srv/a.txt", "/srv/b.txt"], "/backup"),
    ["/srv/a.txt", "/srv/b.txt"],
  );
});

test("a directory cannot be moved inside itself", () => {
  assert.deepEqual(selectMovableSources(["/srv/data"], "/srv/data/sub"), []);
  assert.deepEqual(selectMovableSources(["/srv/data"], "/srv/data/a/b/c"), []);
});

test("a source cannot be moved onto itself", () => {
  assert.deepEqual(selectMovableSources(["/srv/data"], "/srv/data"), []);
});

test("moving into the directory a source already sits in is a no-op", () => {
  // /srv/a.txt into /srv would land at /srv/a.txt — where it already is.
  assert.deepEqual(selectMovableSources(["/srv/a.txt"], "/srv"), []);
});

test("a child is dropped when its parent is also selected", () => {
  // Moving the parent already carries the child; moving both would try to move
  // a path that no longer exists by the time its turn comes.
  assert.deepEqual(
    selectMovableSources(["/srv/data", "/srv/data/logs"], "/backup"),
    ["/srv/data"],
  );
});

test("a deeply nested child is dropped, not just a direct one", () => {
  assert.deepEqual(
    selectMovableSources(["/srv/data", "/srv/data/a/b/c.txt"], "/backup"),
    ["/srv/data"],
  );
});

test("duplicate and empty source paths are discarded", () => {
  assert.deepEqual(
    selectMovableSources(["/srv/a.txt", "/srv/a.txt", "", "/srv/b.txt"], "/backup"),
    ["/srv/a.txt", "/srv/b.txt"],
  );
});

test("siblings are all kept — only real ancestors absorb their children", () => {
  assert.deepEqual(
    selectMovableSources(["/srv/data", "/srv/data-old"], "/backup"),
    ["/srv/data", "/srv/data-old"],
  );
});

test("a mix of movable and unmovable keeps only the movable ones", () => {
  assert.deepEqual(
    selectMovableSources(["/srv/data", "/srv/other.txt"], "/srv/data/sub"),
    ["/srv/other.txt"],
    "the directory cannot go inside itself, but its sibling file can",
  );
});

test("an empty selection yields nothing", () => {
  assert.deepEqual(selectMovableSources([], "/backup"), []);
});

test("windows sources are filtered with the same rules", () => {
  assert.deepEqual(selectMovableSources(["C:\\data"], "C:\\data\\sub"), []);
  assert.deepEqual(
    selectMovableSources(["C:\\data", "C:\\data\\logs"], "D:\\backup"),
    ["C:\\data"],
  );
});

// ── filterPaneFiles ─────────────────────────────────────────────────────────

const entry = (name: string): SftpFileEntry =>
  ({ name, type: "file", size: 0, sizeFormatted: "", lastModified: 0, lastModifiedFormatted: "" }) as SftpFileEntry;

const paneWith = (filter: string, names: string[]): SftpPane =>
  ({ filter, files: names.map(entry) }) as unknown as SftpPane;

test("an empty filter returns the original array", () => {
  const pane = paneWith("", ["a.txt", "b.txt"]);
  assert.equal(filterPaneFiles(pane), pane.files, "no filter must not copy the array");
});

test("a whitespace-only filter counts as no filter", () => {
  const pane = paneWith("   ", ["a.txt"]);
  assert.equal(filterPaneFiles(pane), pane.files);
});

test("filtering is case-insensitive and matches anywhere in the name", () => {
  const pane = paneWith("LOG", ["app.log", "Logs", "readme.md", "catalog.txt"]);
  assert.deepEqual(filterPaneFiles(pane).map((f) => f.name), ["app.log", "Logs", "catalog.txt"]);
});

test("the parent entry survives any filter so navigation up stays possible", () => {
  const pane = paneWith("zzz", ["..", "a.txt"]);
  assert.deepEqual(filterPaneFiles(pane).map((f) => f.name), [".."]);
});
