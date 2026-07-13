/**
 * Parser for the repo CHANGELOG.md ("## [x.y.z] - date" / "### section" /
 * "- item" structure) so release notes can be rendered in-app instead of
 * linking out to GitHub.
 */

export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

const VERSION_RE = /^## \[([^\]]+)\](?:\s*-\s*(.*))?$/;
const SECTION_RE = /^### (.+)$/;
const ITEM_RE = /^- (.+)$/;

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;

  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();

    const versionMatch = VERSION_RE.exec(trimmed);
    if (versionMatch) {
      entry = { version: versionMatch[1], date: versionMatch[2]?.trim() ?? "", sections: [] };
      section = null;
      entries.push(entry);
      continue;
    }
    if (!entry) continue;

    const sectionMatch = SECTION_RE.exec(trimmed);
    if (sectionMatch) {
      section = { title: sectionMatch[1].trim(), items: [] };
      entry.sections.push(section);
      continue;
    }

    const itemMatch = ITEM_RE.exec(trimmed);
    if (itemMatch && section) {
      section.items.push(itemMatch[1].trim());
    }
  }

  return entries;
}
