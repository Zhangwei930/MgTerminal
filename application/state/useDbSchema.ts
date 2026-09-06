import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatQualifiedTable,
  parseQualifiedTable,
  type QualifiedTable,
} from "../../domain/db/identifiers";
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
    getTableDdl,
  } = useDbClientBackend();
  const [tables, setTables] = useState<DbSchemaTable[] | null>(null);
  const [routines, setRoutines] = useState<DbSchemaRoutine[]>([]);
  const [triggers, setTriggers] = useState<DbSchemaTrigger[]>([]);
  const [relations, setRelations] = useState<DbSchemaForeignKey[] | null>(null);
  const [relationsLoading, setRelationsLoading] = useState(false);
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

  /**
   * Columns of one table, cached.
   *
   * Keyed by the qualified name throughout: two schemas can hold the same
   * table, and a cache keyed on the bare name serves one of them the other's
   * columns. A plain string is accepted for the SQL completion provider, which
   * only ever has whatever the user typed.
   */
  const getColumns = useCallback(
    async (table: DbSchemaTable | QualifiedTable | string): Promise<DbSchemaColumn[] | null> => {
      const target = typeof table === 'string' ? parseQualifiedTable(table) : table;
      const key = formatQualifiedTable(target);
      const cached = columnCache.current.get(key);
      if (cached) return cached;
      const inFlight = pending.current.get(key);
      if (inFlight) return inFlight;

      const request = (async () => {
        try {
          const result = await listColumns(connectionId, target.name, target.schema);
          if (!result?.success) return null;
          const columns = result.columns ?? [];
          columnCache.current.set(key, columns);
          return columns;
        } catch {
          // The completion provider has nowhere to show this; the tree reports
          // its own failures from the resolved shape instead.
          return null;
        } finally {
          pending.current.delete(key);
        }
      })();

      pending.current.set(key, request);
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
    async (table: DbSchemaTable | QualifiedTable) => {
      const [columns, indexResult, fkResult] = await Promise.all([
        getColumns(table),
        listIndexes(connectionId, table.name, table.schema),
        listForeignKeys(connectionId, table.name, table.schema),
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

  /**
   * Every foreign key in the database, for the ER diagram. Loaded on demand —
   * it is one more query, and most sessions never open the diagram.
   */
  const loadRelations = useCallback(async () => {
    setRelationsLoading(true);
    try {
      const result = await listForeignKeys(connectionId, undefined);
      setRelations(result?.success ? result.foreignKeys ?? [] : []);
    } finally {
      setRelationsLoading(false);
    }
  }, [connectionId, listForeignKeys]);

  /** The CREATE TABLE for one table, or its error as a comment the editor can hold. */
  const loadTableDdl = useCallback(
    async (table: DbSchemaTable | QualifiedTable): Promise<string> => {
      const result = await getTableDdl(connectionId, table.name, table.schema);
      if (result?.success && result.ddl) return result.ddl;
      return `-- ${result?.error ?? 'Could not read the DDL for this table.'}`;
    },
    [connectionId, getTableDdl],
  );

  /**
   * The whole schema — every table with its columns — for a structure
   * comparison. One query per table, so it is only ever done on demand.
   */
  const readSnapshot = useCallback(async () => {
    const result = await listTables(connectionId);
    if (!result?.success) return null;
    const onlyTables = (result.tables ?? []).filter((table) => table.kind === 'table');

    const snapshot = { tables: [] as { name: string; columns: DbSchemaColumn[] }[] };
    for (const table of onlyTables) {
      const columns = await getColumns(table);
      // The qualified name, so a diff between two servers lines up the tables
      // that actually correspond rather than every same-named one.
      snapshot.tables.push({ name: formatQualifiedTable(table), columns: columns ?? [] });
    }
    return snapshot;
  }, [connectionId, getColumns, listTables]);

  /**
   * Synchronous peek for callers that cannot await — returns null if unseen.
   *
   * Completion passes whatever the user typed, which is usually unqualified.
   * An exact hit wins; failing that a bare name resolves only when exactly one
   * schema holds it, since guessing between two is how the wrong columns get
   * offered.
   */
  const peekColumns = useCallback((table: string) => {
    const key = formatQualifiedTable(parseQualifiedTable(table));
    const exact = columnCache.current.get(key);
    if (exact) return exact;

    const suffix = `.${key.toLowerCase()}`;
    const candidates = [...columnCache.current.entries()].filter(
      ([cached]) => cached.toLowerCase().endsWith(suffix),
    );
    return candidates.length === 1 ? candidates[0][1] : null;
  }, []);

  return {
    tables, routines, triggers, loading, error, reload,
    getColumns, getTableDetail, loadTableDdl, peekColumns, readSnapshot,
    relations, relationsLoading, loadRelations,
  };
};
