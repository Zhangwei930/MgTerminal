import { useCallback, useState } from "react";
import type { DbEngine } from "../../domain/models";
import {
  beginStatementFor,
  commitStatementFor,
  rollbackStatementFor,
} from "../../domain/db/transactionSql";
import { useDbClientBackend } from "./useDbClientBackend";

/**
 * Manual transaction control for one connection.
 *
 * Turning auto-commit off opens a transaction and keeps one open: after a
 * commit or a rollback another BEGIN follows immediately, so the user is never
 * unknowingly back in auto-commit while still editing.
 *
 * Turning auto-commit back on rolls back first. Discarding uncommitted work is
 * bad, but silently committing it is worse — the safe direction is the one that
 * does not write. The UI says so on the control.
 *
 * All of this depends on every statement reaching the same server session,
 * which is why the SQL Server adapter pins its pool to a single connection.
 */
export const useDbTransaction = (connectionId: string, engine: DbEngine) => {
  const { runQuery } = useDbClientBackend();
  const [autoCommit, setAutoCommitState] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Runs one statement to completion, resolving its error rather than throwing. */
  const runStatement = useCallback(
    (sql: string) =>
      new Promise<string | null>((resolve) => {
        const queryId = crypto.randomUUID();
        void runQuery(
          { connectionId, queryId, sql },
          {
            onComplete: () => resolve(null),
            onError: (payload) => resolve(payload.error || "Statement failed"),
          },
        ).then((started) => {
          // The bridge is unavailable — nothing will ever call back.
          if (!started) resolve("DB client bridge unavailable");
        });
      }),
    [connectionId, runQuery],
  );

  /** Oracle opens transactions implicitly; there is nothing to send. */
  const begin = useCallback(async () => {
    const sql = beginStatementFor(engine);
    return sql ? runStatement(sql) : null;
  }, [engine, runStatement]);

  const finish = useCallback(
    async (sql: string) => {
      setBusy(true);
      setError(null);
      const failure = (await runStatement(sql)) ?? (await begin());
      if (failure) setError(failure);
      setBusy(false);
      return !failure;
    },
    [begin, runStatement],
  );

  const commit = useCallback(() => finish(commitStatementFor(engine)), [engine, finish]);
  const rollback = useCallback(() => finish(rollbackStatementFor(engine)), [engine, finish]);

  const setAutoCommit = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setError(null);
      // Roll back on the way back to auto-commit; open a transaction on the way
      // out of it.
      const failure = next
        ? await runStatement(rollbackStatementFor(engine))
        : await begin();
      if (failure) {
        setError(failure);
        setBusy(false);
        // Leave the switch where it was: pretending the mode changed would
        // misrepresent what the server is actually doing.
        return false;
      }
      setAutoCommitState(next);
      setBusy(false);
      return true;
    },
    [begin, engine, runStatement],
  );

  return { autoCommit, setAutoCommit, commit, rollback, busy, error };
};
