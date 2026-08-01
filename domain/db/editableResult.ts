/**
 * Decides whether a result set can be written back to, and to which table.
 *
 * A grid edit turns into an UPDATE against a named table, so guessing wrong
 * writes to the wrong place. Everything here is therefore biased towards
 * refusing: it recognises one narrow, unambiguous shape — a select from a
 * single table — and answers null for everything else, including shapes that
 * might well be editable in principle. A false "not editable" costs the user a
 * hand-written UPDATE; a false "editable" corrupts data.
 */

/** Clauses that mean the rows are computed, combined, or span several tables. */
const DISQUALIFYING = [
  /\bjoin\b/,
  /\bunion\b/,
  /\bintersect\b/,
  /\bexcept\b/,
  /\bgroup\s+by\b/,
  /\bdistinct\b/,
  /\bhaving\b/,
  /\bover\s*\(/,
];

/** Aggregates make a row that does not correspond to any stored row. */
const AGGREGATES = /\b(count|sum|avg|min|max|array_agg|string_agg|group_concat)\s*\(/;

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Replaces string literals with a placeholder so their contents never parse. */
function blankLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

function hasMultipleStatements(sql: string): boolean {
  return blankLiterals(sql).replace(/;\s*$/, '').includes(';');
}

export function resolveEditableTable(sql: string): string | null {
  if (typeof sql !== 'string' || !sql.trim()) return null;

  const cleaned = stripComments(sql).trim();
  if (hasMultipleStatements(cleaned)) return null;

  const normalised = blankLiterals(cleaned).replace(/\s+/g, ' ').trim();
  const lower = normalised.toLowerCase();

  if (!lower.startsWith('select ')) return null;
  if (DISQUALIFYING.some((pattern) => pattern.test(lower))) return null;
  if (AGGREGATES.test(lower)) return null;
  // A parenthesised SELECT is a subquery or a derived table.
  if (/\(\s*select\b/.test(lower)) return null;

  // FROM <name> [AS] [alias], then only clauses that do not change the source.
  const match = /\sfrom\s+([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)?)\s*(.*)$/i.exec(normalised);
  if (!match) return null;

  const [, table, rest] = match;
  // A comma here is a second table in the FROM list.
  const tail = rest.replace(/;\s*$/, '').trim();
  if (tail.startsWith(',')) return null;

  const afterAlias = /^(?:as\s+)?[A-Za-z_][\w$]*\s*(.*)$/i.exec(tail);
  const remainder = (afterAlias && !/^(where|order|limit|offset|fetch|for)\b/i.test(tail))
    ? afterAlias[1]
    : tail;
  if (remainder.trim().startsWith(',')) return null;

  return table;
}
