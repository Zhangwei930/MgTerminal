import test from "node:test";
import assert from "node:assert/strict";

import {
  addLogBookmark,
  labelFromTerminalDataLine,
  pruneLogBookmarks,
  removeLogBookmark,
  searchLogBookmarks,
  terminalDataLineToOffset,
  terminalDataOffsetToLine,
  updateLogBookmark,
} from "./logBookmarks.ts";

test("add/update/remove bookmarks per log", () => {
  let store = {};
  const added = addLogBookmark(store, { logId: "log-1", line: 10, label: "error" });
  store = added.store;
  assert.equal(store["log-1"]?.length, 1);

  store = updateLogBookmark(store, "log-1", added.bookmark.id, { note: "check this" });
  assert.equal(store["log-1"]?.[0]?.note, "check this");

  store = removeLogBookmark(store, "log-1", added.bookmark.id);
  assert.equal(store["log-1"], undefined);
});

test("pruneLogBookmarks drops orphan log ids", () => {
  const store = addLogBookmark({}, { logId: "keep", line: 1 }).store;
  const withOrphan = addLogBookmark(store, { logId: "gone", line: 2 }).store;
  const pruned = pruneLogBookmarks(withOrphan, ["keep"]);
  assert.deepEqual(Object.keys(pruned), ["keep"]);
});

test("searchLogBookmarks filters by label and note", () => {
  let store = addLogBookmark({}, { logId: "a", line: 1, label: "panic dump" }).store;
  store = addLogBookmark(store, { logId: "a", line: 2, label: "ok", note: "retry later" }).store;
  assert.equal(searchLogBookmarks(store, "panic").length, 1);
  assert.equal(searchLogBookmarks(store, "retry").length, 1);
  assert.equal(searchLogBookmarks(store, "", { logId: "a" }).length, 2);
});

test("line/offset helpers round-trip roughly", () => {
  const data = "one\ntwo\nthree\n";
  assert.equal(terminalDataOffsetToLine(data, 0), 0);
  assert.equal(terminalDataOffsetToLine(data, 4), 1);
  assert.equal(terminalDataLineToOffset(data, 2), 8);
  assert.equal(labelFromTerminalDataLine(data, 1), "two");
  assert.equal(labelFromTerminalDataLine("\x1b[31merr\x1b[0m boom", 0).includes("err"), true);
});
