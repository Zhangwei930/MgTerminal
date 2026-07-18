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

/** One bullet, optionally split into bold title + body. */
export interface ChangelogItemParts {
  title?: string;
  body: string;
  /** Inline code segments preserved for rendering. */
  raw: string;
}

export type ChangelogSectionKind =
  | "features"
  | "fixes"
  | "improvements"
  | "security"
  | "breaking"
  | "platform"
  | "other";

const VERSION_RE = /^## \[([^\]]+)\](?:\s*-\s*(.*))?$/;
const SECTION_RE = /^### (.+)$/;
const ITEM_RE = /^- (.+)$/;
/** `**Title**: body` or `**Title** - body` or bare `**Title**` */
const BOLD_ITEM_RE = /^\*\*(.+?)\*\*(?:\s*[:：—–-]\s*(.*))?$/;

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

/**
 * Split a changelog bullet into optional bold title + body.
 * Leaves plain bullets as body-only.
 */
export function parseChangelogItem(raw: string): ChangelogItemParts {
  const text = String(raw || "").trim();
  const match = BOLD_ITEM_RE.exec(text);
  if (!match) {
    return { body: text, raw: text };
  }
  const title = match[1]!.trim();
  const body = (match[2] || "").trim();
  return { title, body, raw: text };
}

/** Map section titles (any UI locale) onto a stable kind for styling. */
export function classifyChangelogSection(title: string): ChangelogSectionKind {
  const s = title.trim().toLowerCase();
  // Features / 功能 / 機能 / 기능 / Funktionen / Fonctionnalités / …
  if (
    /feature|功能|機能|기능|funktion|fonction|caracter|fun[cç][aã]o|функц|windows\s*arm|platform|平台/i.test(s)
  ) {
    if (/windows|arm|platform|平台|linux|macos|win-/i.test(s)) return "platform";
    return "features";
  }
  if (/fix|bug|修复|修復|修正|수정|korrektur|correct|исправ/i.test(s)) return "fixes";
  if (/improv|optim|增强|優化|优化|改善|개선|verbesser|amélior|melhor|улучш|perf/i.test(s)) {
    return "improvements";
  }
  if (/security|安全|보안|sicherheit|sécurité|segurança|безопас/i.test(s)) return "security";
  if (/break|破坏|破壞|호환|incompat|破坏性/i.test(s)) return "breaking";
  return "other";
}

/** Count total bullet items across an entry (for UI badges). */
export function countChangelogItems(entry: ChangelogEntry): number {
  return entry.sections.reduce((n, s) => n + s.items.length, 0);
}
