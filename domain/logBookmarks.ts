/**
 * Connection-log bookmarks: jump points with optional notes inside replay views.
 */

export type LogBookmark = {
  id: string;
  logId: string;
  /** Approximate 0-based line index used by xterm.scrollToLine. */
  line: number;
  /** Byte offset into terminalData for label extraction / stability. */
  offset: number;
  label: string;
  note?: string;
  createdAt: number;
};

export type LogBookmarkStore = Record<string, LogBookmark[]>;

export const createLogBookmarkId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `lb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export function normalizeLogBookmark(value: unknown, fallbackLogId?: string): LogBookmark | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" && record.id ? record.id : null;
  const logId = typeof record.logId === "string" && record.logId
    ? record.logId
    : (fallbackLogId || null);
  if (!id || !logId) return null;

  const line = Number(record.line);
  const offset = Number(record.offset);
  const createdAt = Number(record.createdAt);
  const label = typeof record.label === "string" && record.label.trim()
    ? record.label.trim().slice(0, 120)
    : `Line ${Number.isFinite(line) ? Math.max(0, Math.floor(line)) + 1 : 1}`;

  return {
    id,
    logId,
    line: Number.isFinite(line) ? Math.max(0, Math.floor(line)) : 0,
    offset: Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0,
    label,
    note: typeof record.note === "string" && record.note.trim()
      ? record.note.trim().slice(0, 2000)
      : undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

export function normalizeLogBookmarkStore(value: unknown): LogBookmarkStore {
  if (!value || typeof value !== "object") return {};
  const out: LogBookmarkStore = {};
  for (const [logId, list] of Object.entries(value as Record<string, unknown>)) {
    if (!logId || !Array.isArray(list)) continue;
    const bookmarks = list
      .map((item) => normalizeLogBookmark(item, logId))
      .filter((item): item is LogBookmark => Boolean(item))
      .sort((a, b) => a.line - b.line || a.createdAt - b.createdAt);
    if (bookmarks.length > 0) out[logId] = bookmarks;
  }
  return out;
}

export function listBookmarksForLog(
  store: LogBookmarkStore,
  logId: string,
): LogBookmark[] {
  return store[logId] ? [...store[logId]] : [];
}

export function addLogBookmark(
  store: LogBookmarkStore,
  input: {
    logId: string;
    line: number;
    offset?: number;
    label?: string;
    note?: string;
    id?: string;
    createdAt?: number;
  },
): { store: LogBookmarkStore; bookmark: LogBookmark } {
  const bookmark: LogBookmark = {
    id: input.id || createLogBookmarkId(),
    logId: input.logId,
    line: Math.max(0, Math.floor(input.line)),
    offset: Math.max(0, Math.floor(input.offset ?? 0)),
    label: (input.label?.trim() || `Line ${Math.max(0, Math.floor(input.line)) + 1}`).slice(0, 120),
    note: input.note?.trim() ? input.note.trim().slice(0, 2000) : undefined,
    createdAt: input.createdAt ?? Date.now(),
  };
  const existing = listBookmarksForLog(store, input.logId);
  const nextList = [...existing, bookmark].sort(
    (a, b) => a.line - b.line || a.createdAt - b.createdAt,
  );
  return {
    store: { ...store, [input.logId]: nextList },
    bookmark,
  };
}

export function updateLogBookmark(
  store: LogBookmarkStore,
  logId: string,
  bookmarkId: string,
  patch: Partial<Pick<LogBookmark, "label" | "note" | "line" | "offset">>,
): LogBookmarkStore {
  const list = listBookmarksForLog(store, logId);
  if (list.length === 0) return store;
  const nextList = list.map((item) => {
    if (item.id !== bookmarkId) return item;
    return {
      ...item,
      label: patch.label !== undefined
        ? (patch.label.trim() || item.label).slice(0, 120)
        : item.label,
      note: patch.note !== undefined
        ? (patch.note.trim() ? patch.note.trim().slice(0, 2000) : undefined)
        : item.note,
      line: patch.line !== undefined ? Math.max(0, Math.floor(patch.line)) : item.line,
      offset: patch.offset !== undefined ? Math.max(0, Math.floor(patch.offset)) : item.offset,
    };
  });
  return { ...store, [logId]: nextList };
}

export function removeLogBookmark(
  store: LogBookmarkStore,
  logId: string,
  bookmarkId: string,
): LogBookmarkStore {
  const list = listBookmarksForLog(store, logId);
  if (list.length === 0) return store;
  const nextList = list.filter((item) => item.id !== bookmarkId);
  if (nextList.length === 0) {
    const { [logId]: _removed, ...rest } = store;
    return rest;
  }
  return { ...store, [logId]: nextList };
}

/** Drop bookmarks whose logId is no longer present. */
export function pruneLogBookmarks(
  store: LogBookmarkStore,
  validLogIds: ReadonlySet<string> | readonly string[],
): LogBookmarkStore {
  const valid = validLogIds instanceof Set ? validLogIds : new Set(validLogIds);
  let changed = false;
  const next: LogBookmarkStore = {};
  for (const [logId, list] of Object.entries(store)) {
    if (!valid.has(logId)) {
      changed = true;
      continue;
    }
    next[logId] = list;
  }
  return changed ? next : store;
}

export function searchLogBookmarks(
  store: LogBookmarkStore,
  query: string,
  options?: { logId?: string },
): LogBookmark[] {
  const q = query.trim().toLowerCase();
  const source = options?.logId
    ? listBookmarksForLog(store, options.logId)
    : Object.values(store).flat();
  if (!q) {
    return source.sort((a, b) => b.createdAt - a.createdAt);
  }
  return source
    .filter((item) => {
      const hay = `${item.label}\n${item.note || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Count newlines before offset to estimate a line number in terminalData. */
export function terminalDataOffsetToLine(terminalData: string, offset: number): number {
  if (!terminalData || offset <= 0) return 0;
  const end = Math.min(offset, terminalData.length);
  let lines = 0;
  for (let i = 0; i < end; i += 1) {
    if (terminalData[i] === "\n") lines += 1;
  }
  return lines;
}

/** Extract a short label around a line in terminalData (strips CSI roughly). */
export function labelFromTerminalDataLine(terminalData: string, line: number): string {
  if (!terminalData) return `Line ${line + 1}`;
  const lines = terminalData.split(/\r\n|\n|\r/);
  const raw = lines[Math.max(0, Math.min(line, lines.length - 1))] || "";
  const stripped = raw
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .trim();
  if (!stripped) return `Line ${line + 1}`;
  return stripped.slice(0, 80);
}

/** Estimate byte offset for a line index (first char of that line). */
export function terminalDataLineToOffset(terminalData: string, line: number): number {
  if (!terminalData || line <= 0) return 0;
  let currentLine = 0;
  for (let i = 0; i < terminalData.length; i += 1) {
    if (currentLine === line) return i;
    if (terminalData[i] === "\n") currentLine += 1;
  }
  return terminalData.length;
}
