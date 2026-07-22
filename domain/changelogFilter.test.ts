import assert from "node:assert/strict";
import test from "node:test";
import type { ChangelogEntry } from "./changelog";
import { countChangelogKinds, filterChangelogByKind } from "./changelogFilter";

const entries: ChangelogEntry[] = [
  {
    version: "0.5.22",
    date: "2026-07-21",
    sections: [
      { title: "安全", items: ["a1", "a2"] },
      { title: "功能", items: ["b1"] },
      { title: "修复", items: ["c1", "c2", "c3"] },
    ],
  },
  {
    version: "0.5.21",
    date: "2026-07-20",
    sections: [
      { title: "功能", items: ["d1"] },
      { title: "优化", items: ["e1"] },
    ],
  },
];

test("countChangelogKinds counts items per kind across every entry", () => {
  assert.deepEqual(countChangelogKinds(entries), {
    security: 2,
    features: 2,
    fixes: 3,
    improvements: 1,
  });
});

test("countChangelogKinds returns nothing for an empty changelog", () => {
  assert.deepEqual(countChangelogKinds([]), {});
});

test("filterChangelogByKind keeps everything when no kind is selected", () => {
  // An empty selection means "no filter", not "hide everything" — otherwise
  // deselecting the last chip would blank the dialog.
  assert.deepEqual(filterChangelogByKind(entries, new Set()), entries);
});

test("filterChangelogByKind keeps only the matching sections", () => {
  const result = filterChangelogByKind(entries, new Set(["fixes"]));
  assert.equal(result.length, 1, "an entry with no matching section is dropped");
  assert.equal(result[0]?.version, "0.5.22");
  assert.deepEqual(result[0]?.sections.map((s) => s.title), ["修复"]);
});

test("filterChangelogByKind accepts several kinds at once", () => {
  const result = filterChangelogByKind(entries, new Set(["features", "improvements"]));
  assert.deepEqual(result.map((e) => e.version), ["0.5.22", "0.5.21"]);
  assert.deepEqual(result[0]?.sections.map((s) => s.title), ["功能"]);
  assert.deepEqual(result[1]?.sections.map((s) => s.title), ["功能", "优化"]);
});

test("filterChangelogByKind never mutates the input", () => {
  const before = JSON.stringify(entries);
  filterChangelogByKind(entries, new Set(["fixes"]));
  assert.equal(JSON.stringify(entries), before);
});

test("filterChangelogByKind returns an empty list when nothing matches", () => {
  assert.deepEqual(filterChangelogByKind(entries, new Set(["breaking"])), []);
});
