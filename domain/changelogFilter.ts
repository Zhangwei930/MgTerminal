/**
 * Filtering release notes by section kind.
 *
 * classifyChangelogSection already existed and was already used for colouring;
 * this reuses it so the chips and the colours can never disagree about what a
 * section is.
 */

import {
  classifyChangelogSection,
  type ChangelogEntry,
  type ChangelogSectionKind,
} from "./changelog";

export type ChangelogKindCounts = Partial<Record<ChangelogSectionKind, number>>;

/** Item totals per kind, so a chip can show how much it would reveal. */
export function countChangelogKinds(entries: ChangelogEntry[]): ChangelogKindCounts {
  const counts: ChangelogKindCounts = {};
  for (const entry of entries) {
    for (const section of entry.sections) {
      const kind = classifyChangelogSection(section.title);
      counts[kind] = (counts[kind] ?? 0) + section.items.length;
    }
  }
  return counts;
}

export function filterChangelogByKind(
  entries: ChangelogEntry[],
  kinds: ReadonlySet<ChangelogSectionKind>,
): ChangelogEntry[] {
  // No selection means no filter. Treating it as "hide everything" would blank
  // the dialog the moment someone deselects the last chip.
  if (kinds.size === 0) return entries;

  const filtered: ChangelogEntry[] = [];
  for (const entry of entries) {
    const sections = entry.sections.filter(
      (section) => kinds.has(classifyChangelogSection(section.title)),
    );
    if (sections.length > 0) filtered.push({ ...entry, sections });
  }
  return filtered;
}
