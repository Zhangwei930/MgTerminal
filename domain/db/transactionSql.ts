import type { DbEngine } from '../models';

/**
 * Transaction statements, per engine.
 *
 * COMMIT and ROLLBACK are the same everywhere. Opening one is not: SQL Server
 * needs BEGIN TRANSACTION, and Oracle needs nothing at all — it starts a
 * transaction implicitly on the first DML, and a bare BEGIN there opens a
 * PL/SQL block, so sending one would be a syntax error rather than a
 * transaction.
 */

const SUPPORTED: DbEngine[] = ['mysql', 'postgres', 'mssql', 'oracle'];

function assertEngine(engine: DbEngine): void {
  if (!SUPPORTED.includes(engine)) throw new Error(`Unsupported engine: ${engine}`);
}

/** null means the engine opens transactions implicitly. */
export function beginStatementFor(engine: DbEngine): string | null {
  assertEngine(engine);
  if (engine === 'oracle') return null;
  if (engine === 'mssql') return 'BEGIN TRANSACTION';
  return 'BEGIN';
}

export function commitStatementFor(engine: DbEngine): string {
  assertEngine(engine);
  return 'COMMIT';
}

export function rollbackStatementFor(engine: DbEngine): string {
  assertEngine(engine);
  return 'ROLLBACK';
}
