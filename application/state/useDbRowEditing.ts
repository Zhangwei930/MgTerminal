import { useCallback, useEffect, useState } from "react";
import { resolveEditableTable } from "../../domain/db/editableResult";
import { buildUpdateStatement, type RowKey } from "../../domain/db/rowEditSql";
import type { DbEngine } from "../../domain/models";
import { useDbClientBackend } from "./useDbClientBackend";

/**
 * Decides whether the current result set can be edited in place, and turns a
 * cell edit into an UPDATE.
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
  const [table, setTable] = useState<string | null>(null);
  const [keyColumns, setKeyColumns] = useState<string[] | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const resolved = sql ? resolveEditableTable(sql) : null;
    setTable(resolved);
    setKeyColumns(null);
    if (!resolved) {
      setReason(sql ? "notSingleTable" : null);
      return;
    }

    let cancelled = false;
    void listPrimaryKey(connectionId, resolved).then((result) => {
      if (cancelled) return;
      const key = result?.success ? result.columns ?? [] : [];
      setKeyColumns(key);
      setReason(key.length ? null : "noPrimaryKey");
    });
    return () => { cancelled = true; };
  }, [connectionId, listPrimaryKey, sql]);

  const columnIndex = (name: string) =>
    columns.findIndex((column) => column.name.toLowerCase() === name.toLowerCase());

  const keysPresent = Boolean(keyColumns?.length) && keyColumns!.every((name) => columnIndex(name) >= 0);
  const editable = Boolean(table) && keysPresent;

  const commitEdit = useCallback(
    async ({ column, value, row }: { column: string; value: string; row: unknown[] }): Promise<string | null> => {
      if (!table || !keyColumns?.length) return "This result cannot be edited.";

      const keys: RowKey[] = keyColumns.map((name) => ({
        column: name,
        value: row[columnIndex(name)],
      }));

      let statement: string;
      try {
        statement = buildUpdateStatement({ engine, table, column, value, keys });
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }

      return new Promise<string | null>((resolve) => {
        const queryId = crypto.randomUUID();
        void runQuery(
          { connectionId, queryId, sql: statement },
          {
            onComplete: () => resolve(null),
            onError: (payload) => resolve(payload.error || "Update failed"),
          },
        ).then((started) => {
          if (!started) resolve("DB client bridge unavailable");
        });
      });
      // columnIndex closes over `columns`, which is in the dependency list.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, connectionId, engine, keyColumns, runQuery, table],
  );

  return {
    editable,
    /** One of 'notSingleTable' | 'noPrimaryKey' | 'keyNotSelected', or null. */
    reason: editable ? null : (reason ?? (table && keyColumns?.length ? "keyNotSelected" : null)),
    commitEdit,
  };
};
