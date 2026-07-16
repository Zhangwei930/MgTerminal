import test from "node:test";
import assert from "node:assert/strict";
import { filterVisibleSftpFiles } from "./utils.ts";

const entry = (name: string, hidden = false) => ({ name, hidden });

test("filterVisibleSftpFiles: hides dotfiles when showHiddenFiles is off", () => {
  const files = [entry(".."), entry("a.txt"), entry(".secret")];
  const visible = filterVisibleSftpFiles(files, false, "");
  assert.deepEqual(visible.map((f) => f.name), ["..", "a.txt"]);
});

test("filterVisibleSftpFiles: keeps dotfiles when showHiddenFiles is on", () => {
  const files = [entry("a.txt"), entry(".secret")];
  const visible = filterVisibleSftpFiles(files, true, "");
  assert.deepEqual(visible.map((f) => f.name), ["a.txt", ".secret"]);
});

test("filterVisibleSftpFiles: filter term matches case-insensitively and keeps ..", () => {
  const files = [entry(".."), entry("Notes.md"), entry("readme.txt")];
  const visible = filterVisibleSftpFiles(files, false, "NOTES");
  assert.deepEqual(visible.map((f) => f.name), ["..", "Notes.md"]);
});

test("filterVisibleSftpFiles: blank filter term is ignored", () => {
  const files = [entry("a.txt")];
  const visible = filterVisibleSftpFiles(files, false, "   ");
  assert.deepEqual(visible.map((f) => f.name), ["a.txt"]);
});
