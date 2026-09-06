import { useCallback } from "react";
import type { DbResultColumn } from "../../domain/models";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

// Thin backend hook for the lightweight DB client bridge (SSH-tunneled MySQL/PostgreSQL).
/**
 * How a failed statement in a multi-statement run is reported.
 * Exported for its own test; the sequencing around it needs a live bridge.
 */
export function describeStatementFailure(index: number, total: number, error: string): string {
  if (total <= 1) return error;
  const where = `Statement ${index + 1} of ${total} failed: ${error}`;
  return index === 0
    ? where
    : `${where} The ${index} statement(s) before it have already been applied.`;
}

export const useDbClientBackend = () => {
  const connect = useCallback(async (options: DbConnectOptions): Promise<DbConnectResult> => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.startDbConnection) return { connectionId: options.connectionId, success: false, error: "DB client bridge unavailable" };
    return bridge.startDbConnection(options);
  }, []);

  const close = useCallback(async (connectionId: string): Promise<void> => {
    await magiesTerminalBridge.get()?.closeDbConnection?.(connectionId);
  }, []);

  /**
   * Schema introspection for the tree. Both resolve a {success} shape rather
   * than throwing, so the tree can render the reason inline.
   */
  const listTables = useCallback(async (connectionId: string): Promise<DbListTablesResult> => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.listDbTables) return { success: false, error: "DB client bridge unavailable" };
    return bridge.listDbTables(connectionId);
  }, []);

  const listColumns = useCallback(
    async (connectionId: string, table: string, schema?: string): Promise<DbListColumnsResult> => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.listDbColumns) return { success: false, error: "DB client bridge unavailable" };
      return bridge.listDbColumns(connectionId, table, schema);
    },
    [],
  );

  /** Key columns in key order; an empty list means the table has no key. */
  const listPrimaryKey = useCallback(
    async (connectionId: string, table: string, schema?: string): Promise<DbListPrimaryKeyResult> => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.listDbPrimaryKey) return { success: false, error: "DB client bridge unavailable" };
      return bridge.listDbPrimaryKey(connectionId, table, schema);
    },
    [],
  );

  const getTableDdl = useCallback(
    async (connectionId: string, table: string, schema?: string): Promise<DbTableDdlResult> => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.getDbTableDdl) return { success: false, error: "DB client bridge unavailable" };
      return bridge.getDbTableDdl(connectionId, table, schema);
    },
    [],
  );

  const listIndexes = useCallback(
    async (connectionId: string, table: string, schema?: string): Promise<DbListIndexesResult> => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.listDbIndexes) return { success: false, error: "DB client bridge unavailable" };
      return bridge.listDbIndexes(connectionId, table, schema);
    },
    [],
  );

  const listForeignKeys = useCallback(
    // `table` omitted means every foreign key in the database — what the ER
    // diagram needs, in one query rather than one per table.
    async (connectionId: string, table?: string, schema?: string): Promise<DbListForeignKeysResult> => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.listDbForeignKeys) return { success: false, error: "DB client bridge unavailable" };
      return bridge.listDbForeignKeys(connectionId, table, schema);
    },
    [],
  );

  const listRoutines = useCallback(async (connectionId: string): Promise<DbListRoutinesResult> => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.listDbRoutines) return { success: false, error: "DB client bridge unavailable" };
    return bridge.listDbRoutines(connectionId);
  }, []);

  const listTriggers = useCallback(async (connectionId: string): Promise<DbListTriggersResult> => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.listDbTriggers) return { success: false, error: "DB client bridge unavailable" };
    return bridge.listDbTriggers(connectionId);
  }, []);

  const exportResult = useCallback(async (payload: DbExportPayload): Promise<DbExportResult> => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.exportDbResult) return { success: false, error: "DB client bridge unavailable" };
    return bridge.exportDbResult(payload);
  }, []);

  const cancelQuery = useCallback(async (connectionId: string): Promise<void> => {
    await magiesTerminalBridge.get()?.cancelDbQuery?.(connectionId);
  }, []);

  /**
   * Fires a query and wires up its (one-shot) rows/complete/error listeners,
   * unsubscribing them all once the query settles either way.
   */
  const runQuery = useCallback(
    async (
      options: DbRunQueryOptions,
      callbacks: {
        onRows?: (payload: DbQueryRowsPayload) => void;
        onComplete?: (payload: DbQueryCompletePayload) => void;
        onError?: (payload: DbQueryErrorPayload) => void;
      },
    ): Promise<{ queryId: string } | null> => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.runDbQuery) return null;

      const unsubscribers: Array<() => void> = [];
      const cleanup = () => unsubscribers.forEach((unsub) => unsub());

      const rowsUnsub = bridge.onDbQueryRows?.(options.queryId, (payload) => callbacks.onRows?.(payload));
      if (rowsUnsub) unsubscribers.push(rowsUnsub);

      const completeUnsub = bridge.onDbQueryComplete?.(options.queryId, (payload) => {
        callbacks.onComplete?.(payload);
        cleanup();
      });
      if (completeUnsub) unsubscribers.push(completeUnsub);

      const errorUnsub = bridge.onDbQueryError?.(options.queryId, (payload) => {
        callbacks.onError?.(payload);
        cleanup();
      });
      if (errorUnsub) unsubscribers.push(errorUnsub);

      return bridge.runDbQuery(options);
    },
    [],
  );

  /**
   * Runs statements in order, stopping at the first failure.
   *
   * MySQL and Oracle commit each DDL statement as it runs, and SQL Server does
   * unless the caller opened a transaction — so a failure partway through
   * leaves the earlier statements applied. The message says so, because
   * "failed" otherwise reads as "nothing happened".
   */
  /**
   * Runs one query and resolves with everything it returned.
   *
   * The streaming path is what the grid uses, because a result arrives in
   * batches and should render as it does. A dump needs the whole thing before
   * it can write a file, so this collects the batches instead — over the same
   * IPC channel, rather than opening a second one.
   */
  const collectQuery = useCallback(
    (connectionId: string, sql: string): Promise<{
      success: boolean;
      columns: DbResultColumn[];
      rows: unknown[][];
      error?: string;
    }> =>
      new Promise((resolve) => {
        const queryId = crypto.randomUUID();
        let columns: DbResultColumn[] = [];
        let rows: unknown[][] = [];
        void runQuery(
          { connectionId, queryId, sql },
          {
            onRows: (payload) => {
              if (payload.columns) columns = payload.columns;
              rows = [...rows, ...payload.rows];
            },
            onComplete: () => resolve({ success: true, columns, rows }),
            onError: (payload) => resolve({ success: false, columns: [], rows: [], error: payload.error }),
          },
        ).then((started) => {
          if (!started) resolve({ success: false, columns: [], rows: [], error: "DB client bridge unavailable" });
        });
      }),
    [runQuery],
  );

  const runStatements = useCallback(
    async (connectionId: string, statements: string[]): Promise<string | null> => {
      for (let index = 0; index < statements.length; index += 1) {
        const sql = statements[index];
        const failure = await new Promise<string | null>((resolve) => {
          const queryId = crypto.randomUUID();
          void runQuery(
            { connectionId, queryId, sql },
            {
              onComplete: () => resolve(null),
              onError: (payload) => resolve(payload.error || "Statement failed"),
            },
          ).then((started) => {
            if (!started) resolve("DB client bridge unavailable");
          });
        });
        if (failure) return describeStatementFailure(index, statements.length, failure);
      }
      return null;
    },
    [runQuery],
  );

  return {
    connect, close, cancelQuery, runQuery, runStatements, collectQuery,
    listTables, listColumns, listPrimaryKey, listIndexes, listForeignKeys, getTableDdl,
    listRoutines, listTriggers, exportResult,
  };
};
