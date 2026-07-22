import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_KEY_BINDINGS } from "./models";
import { groupShortcutsForHelp, searchShortcutsForHelp } from "./shortcutHelp";

const label = (binding: { id: string; label: string }) => binding.label;

test("F1 opens the shortcut reference and is remappable like any other binding", () => {
  const help = DEFAULT_KEY_BINDINGS.find((binding) => binding.action === "showShortcuts");
  assert.ok(help, "a showShortcuts binding must exist");
  assert.equal(help.mac, "F1");
  assert.equal(help.pc, "F1");
  assert.equal(help.category, "app");
});

test("searchShortcutsForHelp matches the translated label and the key combo", () => {
  const bindings = [
    { id: "copy", action: "copy", label: "Copy from Terminal", mac: "⌘ + C", pc: "Ctrl + Shift + C", category: "terminal" as const },
    { id: "new-tab", action: "newTab", label: "New Local Tab", mac: "⌘ + T", pc: "Ctrl + T", category: "tabs" as const },
  ];

  assert.deepEqual(searchShortcutsForHelp(bindings, "copy", "mac", label).map((b) => b.id), ["copy"]);
  // Searching by the keys you pressed is the whole point of a shortcut sheet.
  assert.deepEqual(searchShortcutsForHelp(bindings, "⌘ + T", "mac", label).map((b) => b.id), ["new-tab"]);
  assert.deepEqual(searchShortcutsForHelp(bindings, "ctrl + t", "pc", label).map((b) => b.id), ["new-tab"]);
  // The inactive scheme must not match, or a Mac user finds PC-only entries.
  assert.deepEqual(searchShortcutsForHelp(bindings, "shift", "mac", label).map((b) => b.id), []);
  assert.deepEqual(searchShortcutsForHelp(bindings, "", "mac", label).length, 2);
});

test("searchShortcutsForHelp uses the resolved label, not the built-in English one", () => {
  const bindings = [
    { id: "copy", action: "copy", label: "Copy from Terminal", mac: "⌘ + C", pc: "Ctrl + C", category: "terminal" as const },
  ];
  const translated = () => "从终端复制";
  assert.deepEqual(searchShortcutsForHelp(bindings, "复制", "mac", translated).map((b) => b.id), ["copy"]);
  assert.deepEqual(searchShortcutsForHelp(bindings, "Copy", "mac", translated).map((b) => b.id), []);
});

test("groupShortcutsForHelp keeps category order stable and drops empty groups", () => {
  const bindings = [
    { id: "a", action: "a", label: "A", mac: "1", pc: "1", category: "app" as const },
    { id: "b", action: "b", label: "B", mac: "2", pc: "2", category: "tabs" as const },
    { id: "c", action: "c", label: "C", mac: "3", pc: "3", category: "app" as const },
  ];
  const groups = groupShortcutsForHelp(bindings);
  assert.deepEqual(groups.map((g) => g.category), ["tabs", "app"]);
  assert.deepEqual(groups.map((g) => g.bindings.map((b) => b.id)), [["b"], ["a", "c"]]);
});

test("groupShortcutsForHelp returns nothing for an empty list", () => {
  assert.deepEqual(groupShortcutsForHelp([]), []);
});

test("every default binding has a category the help screen can group", () => {
  const grouped = groupShortcutsForHelp(DEFAULT_KEY_BINDINGS);
  const total = grouped.reduce((sum, group) => sum + group.bindings.length, 0);
  assert.equal(total, DEFAULT_KEY_BINDINGS.length, "no binding may be dropped from the sheet");
});
