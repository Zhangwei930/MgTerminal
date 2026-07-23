import { useCallback } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

// Thin backend hook for the lightweight DB client bridge (SSH-tunneled MySQL/PostgreSQL).
export const useDbClientBackend = () => {
  const connect = useCallback(async (options: DbConnectOptions): Promise<DbConnectResult> => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.startDbConnection) return { connectionId: options.connectionId, success: false, error: "DB client bridge unavailable" };
    return bridge.startDbConnection(options);
  }, []);

  const close = useCallback(async (connectionId: string): Promise<void> => {
    await magiesTerminalBridge.get()?.closeDbConnection?.(connectionId);
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

  return { connect, close, cancelQuery, runQuery };
};
