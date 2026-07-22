/**
 * Planning for renaming several files in one go.
 *
 * The plan is computed and validated before anything is sent, because a bulk
 * rename that is half-applied is far harder to undo than one that never ran:
 * any collision anywhere rejects the whole batch.
 */

export interface BulkRenameEntry {
  from: string;
  to: string;
}

export type BulkRenameError =
  | "empty_pattern"
  | "invalid_name"
  | "duplicate_target"
  | "collides_with_existing";

export interface BulkRenamePlan {
  /** Renames to perform, in the caller's order. Empty when `error` is set. */
  entries: BulkRenameEntry[];
  error?: BulkRenameError;
}

export interface BuildBulkRenamePlanOptions {
  names: string[];
  /** Supports the {name}, {ext} and {n} tokens. */
  pattern: string;
  startAt?: number;
  padding?: number;
  /** Everything in the directory, so collisions with untouched files are caught. */
  existingNames?: string[];
}

/**
 * Split into the part {name} refers to and the extension {ext} refers to.
 * A leading dot belongs to the name: `.bashrc` is a dotfile, not an extension.
 */
export function splitFileName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

function isUsableFileName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  return !/[/\\\0]/.test(name);
}

export function buildBulkRenamePlan({
  names,
  pattern,
  startAt = 1,
  padding = 0,
  existingNames = [],
}: BuildBulkRenamePlanOptions): BulkRenamePlan {
  if (!pattern.trim()) return { entries: [], error: "empty_pattern" };
  if (names.length === 0) return { entries: [] };

  const entries: BulkRenameEntry[] = [];
  const targets = new Set<string>();
  const renamed = new Set(names);

  let counter = Math.trunc(startAt);
  for (const from of names) {
    const { base, ext } = splitFileName(from);
    const to = pattern
      .replace(/\{name\}/g, base)
      .replace(/\{ext\}/g, ext)
      .replace(/\{n\}/g, String(counter).padStart(Math.max(0, padding), "0"));
    counter += 1;

    if (!isUsableFileName(to)) return { entries: [], error: "invalid_name" };
    if (targets.has(to)) return { entries: [], error: "duplicate_target" };
    targets.add(to);
    // Landing on a name this batch is itself freeing is fine; landing on a
    // bystander would silently destroy it.
    if (!renamed.has(to) && existingNames.includes(to)) {
      return { entries: [], error: "collides_with_existing" };
    }
    if (to === from) continue;
    entries.push({ from, to });
  }

  return { entries };
}
