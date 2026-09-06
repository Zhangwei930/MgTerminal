import type { DbEngine } from '../models';

/**
 * Builds an execution-plan request.
 *
 * The safety point here is that asking for a plan must not be a write. That is
 * not automatic: SQL Server produces a plan by running the batch under a
 * SHOWPLAN setting, and Postgres's EXPLAIN ANALYZE executes the statement for
 * real. So plans are only offered for SELECT, and the Postgres form never uses
 * ANALYZE.
 */

const SUPPORTED: DbEngine[] = ['mysql', 'mariadb', 'postgres', 'mssql', 'oracle', 'sqlite'];

function assertEngine(engine: DbEngine): void {
  if (!SUPPORTED.includes(engine)) throw new Error(`Unsupported engine: ${engine}`);
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function blankLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/** True only for a single SELECT (or a CTE feeding one). */
export function canExplain(sql: string): boolean {
  if (typeof sql !== 'string' || !sql.trim()) return false;

  const cleaned = stripComments(sql).trim();
  // Only the first statement would be planned; the rest would simply run.
  if (blankLiterals(cleaned).replace(/;\s*$/, '').includes(';')) return false;

  return /^\s*(select|with)\b/i.test(cleaned);
}

export function buildExplainQuery(engine: DbEngine, sql: string): string {
  assertEngine(engine);
  if (!canExplain(sql)) {
    throw new Error('Only a SELECT statement can be explained.');
  }
  const statement = sql.trim().replace(/;\s*$/, '');

  switch (engine) {
    case 'mysql':
    case 'mariadb':
      return `EXPLAIN ${statement}`;
    case 'sqlite':
      // SQLite's plain EXPLAIN prints VDBE opcodes, which describe the virtual
      // machine rather than the query. QUERY PLAN is the readable form.
      return `EXPLAIN QUERY PLAN ${statement}`;
    case 'postgres':
      // Deliberately no ANALYZE: that would execute the statement.
      return `EXPLAIN ${statement}`;
    case 'mssql':
      // The plan comes back as the result of the batch; the statement itself is
      // parsed and costed but not executed.
      return `SET SHOWPLAN_ALL ON; ${statement}`;
    case 'oracle':
      // Oracle writes the plan to PLAN_TABLE rather than returning it, so the
      // caller has to read it back out.
      return `EXPLAIN PLAN FOR ${statement}`;
    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}

/**
 * Oracle's EXPLAIN PLAN returns nothing; the plan has to be selected from
 * PLAN_TABLE afterwards. Every other engine returns it directly.
 */
export function explainFollowUpQuery(engine: DbEngine): string | null {
  assertEngine(engine);
  if (engine !== 'oracle') return null;
  return 'SELECT PLAN_TABLE_OUTPUT FROM TABLE(DBMS_XPLAN.DISPLAY())';
}
