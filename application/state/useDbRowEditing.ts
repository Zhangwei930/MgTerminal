import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveEditableTable } from "../../domain/db/editableResult";
import { type QualifiedTable, parseQualifiedTable } from "../../domain/db/identifiers";
import { buildDeleteStatement, buildUpdateStatement, type RowKey } from "../../domain/db/rowEditSql";
import type { DbEngine } from "../../domain/models";
import { useDbClientBackend } from "./useDbClientBackend";

/**
 * Turns the affected-row count of a committed edit into a failure message.
 *
 * An UPDATE keyed on the primary key that matches nothing is not a database
 * error — it completes normally — so without this the grid overlays the typed
 * value and shows an edit the row never took. The usual cause is a result set
 * that has gone stale: the row was deleted or its key changed since the query
 * ran.
 *
 * Only zero is a failure. A count above one should be unreachable through a
 * primary key, and those rows are written by the time we see the count —
 * reporting a failed write would state the opposite of what happened. An
 * adapter that reports no count at all (mssql can) says nothing either way.
 */
export function rowUpdateFailure(affectedRows: number | undefined): string | null {
  if (affectedRows === 0) {
    return "No row matched — it may have been deleted or its key changed since these results loaded. Nothing was updated.";
  }
  return null;
}

/**
 * The table a result set writes back to, schema and all.
 *
 * The schema half matters twice over: the primary-key lookup has to be asked
 * about one table rather than every table of that name on the server, and the
 * UPDATE has to name the same one rather than whatever search_path resolves.
 */
export function resolveEditTarget(sql: string | null): QualifiedTable | null {
  const resolved = sql ? resolveEditableTable(sql) : null;
  return resolved ? parseQualifiedTable(resolved) : null;
}

/**
 * Decides whether the current result set can be edited in place, and turns a
 * cell edit into an UPDATE or a row into a DELETE.
 *
 * Three things all have to hold, and each is checked before the grid offers an
 * editable cell rather than after the user has typed:
 *
 * 1. The query reads from exactly one table (resolveEditableTable).
 * 2. That table has a primary key — otherwise no WHERE hits exactly one row.
 * 3. Every key column is present in the result, or the row cannot be located
 *    even though the table has a key. `SELECT name FROM patients` is the common
 *    case: editable table, keyed table, unusable result.
 */
export const useDbRowEditing = ({
  connectionId,
  engine,
  sql,
  columns,
}: {
  connectionId: string;
  engine: DbEngine;
  /** The SQL that produced the rows currently on screen. */
  sql: string | null;
  columns: { name: string }[];
}) => {
  const { listPrimaryKey, runQuery } = useDbClientBackend();
  const [table, setTable] = useState<QualifiedTable | null>(null);
  const [keyColumns, setKeyColumns] = useState<string[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const resolved = resolveEditTarget(sql);
    setTable(resolved);
    setKeyColumns(null);
    if (!resolved) {
      setReason(sql ? "notSingleTable" : null);
      return;
    }

    let cancelled = false;
    void listPrimaryKey(connectionId, resolved.name, resolved.schema).then((result) => {
      if (cancelled) return;
      const key = result?.success ? result.columns ?? [] : [];
      setKeyColumns(key);
      setReason(key.length ? null : "noPrimaryKey");
    });
    return () => { cancelled = true; };
  }, [connectionId, listPrimaryKey, sql]);

  const columnIndex = useCallback(
    (name: string) => columns.findIndex((column) => column.name.toLowerCase() === name.toLowerCase()),
    [columns],
  );

  const keysPresent = Boolean(keyColumns?.length) && keyColumns!.every((name) => columnIndex(name) >= 0);
  const editable = Boolean(table) && keysPresent;

  /** Runs one statement and resolves with a failure message, or null. */
  const runStatement = useCallback(
    (statement: string, checkAffected: boolean): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        const queryId = crypto.randomUUID();
        void runQuery(
          { connectionId, queryId, sql: statement },
          {
            onComplete: (payload) => resolve(checkAffected ? rowUpdateFailure(payload.affectedRows) : null),
            onError: (payload) => resolve(payload.error || "Statement failed"),
          },
        ).then((started) => {
          if (!started) resolve("DB client bridge unavailable");
        });
      }),
    [connectionId, runQuery],
  );

  const keysForRow = useCallback(
    (row: unknown[]): RowKey[] =>
      (keyColumns ?? []).map((name) => ({ column: name, value: row[columnIndex(name)] })),
    [columnIndex, keyColumns],
  );

  const commitEdit = useCallback(
    async ({ column, value, row }: {
      column: string;
      /** null is SQL NULL — the grid's "set null" action, not the text "NULL". */
      value: string | null;
      row: unknown[];
    }): Promise<string | null> => {
      if (!table || !keyColumns?.length) return "This result cannot be edited.";

      let statement: string;
      try {
        statement = buildUpdateStatement({ engine, table, column, value, keys: keysForRow(row) });
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
      return runStatement(statement, true);
    },
    [engine, keyColumns, keysForRow, runStatement, table],
  );

  const deleteRow = useCallback(
    async ({ row }: { row: unknown[] }): Promise<string | null> => {
      if (!table || !keyColumns?.length) return "This result cannot be edited.";

      let statement: string;
      try {
        statement = buildDeleteStatement({ engine, table, keys: keysForRow(row) });
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
      return runStatement(statement, true);
    },
    [engine, keyColumns, keysForRow, runStatement, table],
  );

  return useMemo(
    () => ({
      editable,
      /** One of 'notSingleTable' | 'noPrimaryKey' | 'keyNotSelected', or null. */
      reason: editable ? null : (reason ?? (table && keyColumns?.length ? "keyNotSelected" : null)),
      commitEdit,
      deleteRow,
    }),
    [commitEdit, deleteRow, editable, keyColumns, reason, table],
  );
};
