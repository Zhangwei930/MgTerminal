import { useSyncExternalStore } from "react";
import {
  clearUnfavourited,
  recordQuery,
  toggleFavourite,
  type QueryHistoryEntry,
} from "../../domain/db/queryHistory";
import { STORAGE_KEY_DB_QUERY_HISTORY } from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";

/**
 * Query history, shared by every DB tab.
 *
 * A store rather than a hook because each tab would otherwise hold its own copy
 * of the list: a query recorded in one tab would be invisible in the other, and
 * both would write their own version to storage — so whichever ran last would
 * silently discard the other's history.
 *
 * Stored in plain text, like the shell history the app already keeps. The point
 * of a history is to be readable and searchable, and encrypting it would put
 * the key beside the data. It holds statements exactly as typed, so a WHERE
 * clause naming a person is stored that way — worth knowing on a shared machine.
 */

type Listener = () => void;

class DbQueryHistoryStore {
  private entries: QueryHistoryEntry[] = [];
  private listeners = new Set<Listener>();
  private hydrated = false;

  getEntries = (): readonly QueryHistoryEntry[] => {
    if (!this.hydrated) {
      const saved = localStorageAdapter.read<QueryHistoryEntry[]>(STORAGE_KEY_DB_QUERY_HISTORY);
      if (Array.isArray(saved)) this.entries = saved;
      this.hydrated = true;
    }
    return this.entries;
  };

  record = (entry: Omit<QueryHistoryEntry, "id" | "at">) => {
    this.commit(recordQuery([...this.getEntries()], {
      ...entry,
      id: crypto.randomUUID(),
      at: Date.now(),
    }));
  };

  toggleFavourite = (id: string) => {
    this.commit(toggleFavourite([...this.getEntries()], id));
  };

  /** Keeps the favourites — clearing must not be a way to lose saved queries. */
  clear = () => {
    this.commit(clearUnfavourited([...this.getEntries()]));
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private commit = (next: QueryHistoryEntry[]) => {
    if (next === this.entries) return;
    this.entries = next;
    localStorageAdapter.write(STORAGE_KEY_DB_QUERY_HISTORY, next);
    this.listeners.forEach((listener) => listener());
  };
}

export const dbQueryHistoryStore = new DbQueryHistoryStore();

const getSnapshot = () => dbQueryHistoryStore.getEntries();

export const useDbQueryHistory = (): readonly QueryHistoryEntry[] =>
  useSyncExternalStore(dbQueryHistoryStore.subscribe, getSnapshot, getSnapshot);
