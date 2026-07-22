/**
 * Shaping the key bindings for the F1 reference sheet.
 *
 * The sheet renders whatever the user currently has bound, so it reads from
 * the same KeyBinding list the settings tab edits rather than a second copy
 * that could drift out of date.
 */

import type { HotkeyScheme, KeyBinding } from "./models/keyBindings";

/** Display order of the sheet; also the settings tab's order. */
const CATEGORY_ORDER: KeyBinding["category"][] = [
  "tabs",
  "terminal",
  "navigation",
  "app",
  "sftp",
];

export interface ShortcutHelpGroup {
  category: KeyBinding["category"];
  bindings: KeyBinding[];
}

/** Resolves a binding to the label the user should read (usually translated). */
export type ShortcutLabelResolver = (binding: KeyBinding) => string;

function comboForScheme(binding: KeyBinding, scheme: HotkeyScheme): string {
  return scheme === "mac" ? binding.mac : binding.pc;
}

export function searchShortcutsForHelp(
  bindings: KeyBinding[],
  query: string,
  scheme: HotkeyScheme,
  resolveLabel: ShortcutLabelResolver,
): KeyBinding[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return bindings;
  return bindings.filter((binding) => {
    if (resolveLabel(binding).toLowerCase().includes(needle)) return true;
    // Only the active scheme's combo: matching the other one would surface
    // shortcuts the user cannot actually press.
    return comboForScheme(binding, scheme).toLowerCase().includes(needle);
  });
}

export function groupShortcutsForHelp(bindings: KeyBinding[]): ShortcutHelpGroup[] {
  return CATEGORY_ORDER
    .map((category) => ({
      category,
      bindings: bindings.filter((binding) => binding.category === category),
    }))
    .filter((group) => group.bindings.length > 0);
}
