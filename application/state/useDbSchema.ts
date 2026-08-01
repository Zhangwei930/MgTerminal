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
  const {
    listTables, listColumns, listIndexes, listForeignKeys, listRoutines, listTriggers,
  } = useDbClientBackend();
  const [tables, setTables] = useState<DbSchemaTable[] | null>(null);
  const [routines, setRoutines] = useState<DbSchemaRoutine[]>([]);
  const [triggers, setTriggers] = useState<DbSchemaTrigger[]>([]);
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
      // Routines and triggers are fetched alongside the tables rather than
      // lazily: they are one query each for the whole database, and a tree
      // section that fills in later reads as a bug.
      const [tableResult, routineResult, triggerResult] = await Promise.all([
        listTables(connectionId),
        listRoutines(connectionId),
        listTriggers(connectionId),
      ]);

      if (tableResult?.success) setTables(tableResult.tables ?? []);
      else setError(tableResult?.error || "Failed to read schema");

      // A server that refuses these — no privilege on the catalog, or a
      // version without them — still gets a usable table tree.
      setRoutines(routineResult?.success ? routineResult.routines ?? [] : []);
      setTriggers(triggerResult?.success ? triggerResult.triggers ?? [] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, listRoutines, listTables, listTriggers]);

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

  /**
   * Everything shown when a table is expanded, in one call. Indexes and foreign
   * keys are fetched together with the columns so the expanded row does not
   * grow in stages under the user's eye.
   *
   * Only the columns decide success: a server that will not report indexes —
   * no privilege on the catalog — should still show the columns.
   */
  const getTableDetail = useCallback(
    async (table: string) => {
      const [columns, indexResult, fkResult] = await Promise.all([
        getColumns(table),
        listIndexes(connectionId, table),
        listForeignKeys(connectionId, table),
      ]);
      if (!columns) return null;
      return {
        columns,
        indexes: indexResult?.success ? indexResult.indexes ?? [] : [],
        foreignKeys: fkResult?.success ? fkResult.foreignKeys ?? [] : [],
      };
    },
    [connectionId, getColumns, listForeignKeys, listIndexes],
  );

  /** Synchronous peek for callers that cannot await — returns null if unseen. */
  const peekColumns = useCallback((table: string) => columnCache.current.get(table) ?? null, []);

  return {
    tables, routines, triggers, loading, error, reload,
    getColumns, getTableDetail, peekColumns,
  };
};
