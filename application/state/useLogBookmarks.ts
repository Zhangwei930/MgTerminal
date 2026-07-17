import { useCallback, useEffect, useState } from "react";
import {
  addLogBookmark,
  listBookmarksForLog,
  normalizeLogBookmarkStore,
  pruneLogBookmarks,
  removeLogBookmark,
  searchLogBookmarks,
  updateLogBookmark,
  type LogBookmark,
  type LogBookmarkStore,
} from "../../domain/logBookmarks";
import { STORAGE_KEY_LOG_BOOKMARKS } from "../../infrastructure/config/storageKeys";
import {
  LOCAL_STORAGE_ADAPTER_CHANGED_EVENT,
  localStorageAdapter,
} from "../../infrastructure/persistence/localStorageAdapter";

const readStore = (): LogBookmarkStore =>
  normalizeLogBookmarkStore(
    localStorageAdapter.read<LogBookmarkStore>(STORAGE_KEY_LOG_BOOKMARKS) ?? {},
  );

const writeStore = (store: LogBookmarkStore): void => {
  localStorageAdapter.write(STORAGE_KEY_LOG_BOOKMARKS, store);
};

export function useLogBookmarks(logId?: string): {
  bookmarks: LogBookmark[];
  allBookmarks: LogBookmark[];
  addBookmark: (input: {
    line: number;
    offset?: number;
    label?: string;
    note?: string;
  }) => LogBookmark | null;
  updateBookmark: (
    bookmarkId: string,
    patch: Partial<Pick<LogBookmark, "label" | "note">>,
  ) => void;
  removeBookmark: (bookmarkId: string) => void;
  search: (query: string) => LogBookmark[];
  pruneToLogIds: (validLogIds: readonly string[]) => void;
} {
  const [store, setStore] = useState<LogBookmarkStore>(() => readStore());

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key && detail.key !== STORAGE_KEY_LOG_BOOKMARKS) return;
      setStore(readStore());
    };
    window.addEventListener(LOCAL_STORAGE_ADAPTER_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LOCAL_STORAGE_ADAPTER_CHANGED_EVENT, onChange);
  }, []);

  const commit = useCallback((next: LogBookmarkStore) => {
    writeStore(next);
    setStore(next);
  }, []);

  const bookmarks = logId ? listBookmarksForLog(store, logId) : [];
  const allBookmarks = searchLogBookmarks(store, "");

  const addBookmark = useCallback((input: {
    line: number;
    offset?: number;
    label?: string;
    note?: string;
  }) => {
    if (!logId) return null;
    const result = addLogBookmark(store, { ...input, logId });
    commit(result.store);
    return result.bookmark;
  }, [commit, logId, store]);

  const updateBookmark = useCallback((
    bookmarkId: string,
    patch: Partial<Pick<LogBookmark, "label" | "note">>,
  ) => {
    if (!logId) return;
    commit(updateLogBookmark(store, logId, bookmarkId, patch));
  }, [commit, logId, store]);

  const removeBookmarkFn = useCallback((bookmarkId: string) => {
    if (!logId) return;
    commit(removeLogBookmark(store, logId, bookmarkId));
  }, [commit, logId, store]);

  const search = useCallback((query: string) => {
    return searchLogBookmarks(store, query, logId ? { logId } : undefined);
  }, [logId, store]);

  const pruneToLogIds = useCallback((validLogIds: readonly string[]) => {
    const next = pruneLogBookmarks(store, validLogIds);
    if (next !== store) commit(next);
  }, [commit, store]);

  return {
    bookmarks,
    allBookmarks,
    addBookmark,
    updateBookmark,
    removeBookmark: removeBookmarkFn,
    search,
    pruneToLogIds,
  };
}

/** Module helper for non-hook callers (e.g. vault delete). */
export function pruneStoredLogBookmarks(validLogIds: readonly string[]): void {
  const store = readStore();
  const next = pruneLogBookmarks(store, validLogIds);
  if (next !== store) writeStore(next);
}
