import type { DbEngine } from '../models';
import { type QualifiedTable, quoteQualifiedTable, quoteSqlIdentifier } from './identifiers';

/**
 * Builds the "show me this table" query the schema tree runs on double-click.
 *
 * Two things stop this from being one template string:
 *
 * - Row limiting is spelled differently everywhere. MySQL and Postgres take a
 *   trailing LIMIT, SQL Server wants TOP *before* the column list, and Oracle
 *   uses the SQL:2008 FETCH FIRST clause.
 *
 * - The table name is an identifier, not a literal, so it cannot be
 *   single-quoted, and it carries its schema — see ./identifiers.
 */

// Re-exported because callers that only quote a column still reach for it here.
export { quoteSqlIdentifier };

const DEFAULT_PREVIEW_ROWS = 100;

const ENGINES: DbEngine[] = ['mysql', 'mariadb', 'postgres', 'mssql', 'oracle', 'sqlite'];

function assertEngine(engine: DbEngine): void {
  if (!ENGINES.includes(engine)) throw new Error(`Unsupported engine: ${engine}`);
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    // Interpolated straight into SQL, so anything but a positive integer is a
    // second injection point.
    throw new Error(`Preview limit must be a positive integer, received ${String(limit)}`);
  }
}

export function buildPreviewSelect(
  engine: DbEngine,
  table: QualifiedTable | string,
  limit: number = DEFAULT_PREVIEW_ROWS,
): string {
  assertEngine(engine);
  assertLimit(limit);
  const name = quoteQualifiedTable(engine, table);

  switch (engine) {
    case 'mysql':
    case 'mariadb':
    case 'postgres':
    case 'sqlite':
      return `SELECT * FROM ${name} LIMIT ${limit}`;
    case 'mssql':
      return `SELECT TOP ${limit} * FROM ${name}`;
    case 'oracle':
      return `SELECT * FROM ${name} FETCH FIRST ${limit} ROWS ONLY`;
    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}
