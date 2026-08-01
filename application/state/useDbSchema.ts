import { useCallback, useEffect, useRef, useState } from "react";
import { useDbClientBackend } from "./useDbClientBackend";

/**
 * One schema per connection, shared by the tree and the editor's completion
 * provider. Both need the same table list, and the completion provider needs
 * columns for whichever table the user just typed a dot after — which is rarely
 * one the tree happens to have expanded.
 *
 * Columns are fetched on demand and cached: pre-loading every table's columns
 * on connect would be a query per table against a catalog that may have
 * thousands of them.
 */
export const useDbSchema = (connectionId: string, ready: boolean) => {
  const { listTables, listColumns } = useDbClientBackend();
  const [tables, setTables] = useState<DbSchemaTable[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columnCache = useRef(new Map<string, DbSchemaColumn[]>());
  /** In-flight fetches, so a burst of keystrokes issues one query per table. */
  const pending = useRef(new Map<string, Promise<DbSchemaColumn[] | null>>());

  const reload = useCallback(async () => {
    columnCache.current.clear();
    pending.current.clear();
    setLoading(true);
    setError(null);
    try {
      const result = await listTables(connectionId);
      if (result?.success) setTables(result.tables ?? []);
      else setError(result?.error || "Failed to read schema");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, listTables]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  const getColumns = useCallback(
    async (table: string): Promise<DbSchemaColumn[] | null> => {
      const cached = columnCache.current.get(table);
      if (cached) return cached;
      const inFlight = pending.current.get(table);
      if (inFlight) return inFlight;

      const request = (async () => {
        try {
          const result = await listColumns(connectionId, table);
          if (!result?.success) return null;
          const columns = result.columns ?? [];
          columnCache.current.set(table, columns);
          return columns;
        } catch {
          // The completion provider has nowhere to show this; the tree reports
          // its own failures from the resolved shape instead.
          return null;
        } finally {
          pending.current.delete(table);
        }
      })();

      pending.current.set(table, request);
      return request;
    },
    [connectionId, listColumns],
  );

  /** Synchronous peek for callers that cannot await — returns null if unseen. */
  const peekColumns = useCallback((table: string) => columnCache.current.get(table) ?? null, []);

  return { tables, loading, error, reload, getColumns, peekColumns };
};
