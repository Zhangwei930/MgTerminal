/**
 * The list of statements the user has run, most recent first.
 *
 * Two rules shape it. Re-running the same statement moves its record up rather
 * than adding another, because iterating on one query would otherwise bury
 * everything else within a minute. And a favourite is never evicted by the cap
 * — a saved query that vanishes because the user ran a hundred others is data
 * loss, not cache eviction.
 */

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  connectionId: string;
  /** Epoch milliseconds. */
  at: number;
  ok: boolean;
  rowCount?: number;
  durationMs?: number;
  favourite?: boolean;
}

export const HISTORY_LIMIT = 200;

/**
 * Two entries are the same query when the statement and the connection match.
 * Only surrounding whitespace is ignored — differing inner whitespace is a
 * different statement as far as the user is concerned, and collapsing it would
 * hide edits they made deliberately.
 */
function isSameQuery(a: QueryHistoryEntry, b: QueryHistoryEntry): boolean {
  return a.connectionId === b.connectionId && a.sql.trim() === b.sql.trim();
}

export function recordQuery(
  history: QueryHistoryEntry[],
  incoming: QueryHistoryEntry,
): QueryHistoryEntry[] {
  if (!incoming.sql?.trim()) return history;

  const previous = history.find((e) => isSameQuery(e, incoming));
  const rest = history.filter((e) => !isSameQuery(e, incoming));
  // The user favourited that SQL, not that particular execution of it.
  const entry = previous?.favourite ? { ...incoming, favourite: true } : incoming;

  const next = [entry, ...rest];
  if (next.length <= HISTORY_LIMIT) return next;

  // Drop the oldest plain entries only, and never below the favourites.
  let excess = next.length - HISTORY_LIMIT;
  const trimmed: QueryHistoryEntry[] = [];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const candidate = next[i];
    if (excess > 0 && !candidate.favourite && i !== 0) {
      excess -= 1;
      continue;
    }
    trimmed.unshift(candidate);
  }
  return trimmed;
}

export function toggleFavourite(
  history: QueryHistoryEntry[],
  id: string,
): QueryHistoryEntry[] {
  if (!history.some((entry) => entry.id === id)) return history;
  return history.map((entry) =>
    entry.id === id ? { ...entry, favourite: !entry.favourite } : entry);
}

export function clearUnfavourited(history: QueryHistoryEntry[]): QueryHistoryEntry[] {
  return history.filter((entry) => entry.favourite);
}
