import type { DbEngine } from '../models';

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
 *   single-quoted. Each engine has its own delimiter and its own escape for it.
 *   Quoting is not optional: a table named `order` is otherwise a syntax error.
 */

const DEFAULT_PREVIEW_ROWS = 100;

/** Identifier delimiters, per engine. SQL Server's pair is asymmetric. */
const DELIMITERS: Record<DbEngine, { open: string; close: string }> = {
  mysql: { open: '`', close: '`' },
  postgres: { open: '"', close: '"' },
  oracle: { open: '"', close: '"' },
  mssql: { open: '[', close: ']' },
};

function assertEngine(engine: DbEngine): void {
  if (!DELIMITERS[engine]) throw new Error(`Unsupported engine: ${engine}`);
}

/**
 * Wraps a name as a quoted identifier, doubling the engine's own closing
 * delimiter. Only that delimiter is escaped — a backtick means nothing to
 * Postgres, and escaping it there would corrupt the name.
 */
export function quoteSqlIdentifier(engine: DbEngine, name: string): string {
  assertEngine(engine);
  if (typeof name !== 'string') {
    throw new TypeError(`SQL identifier must be a string, received ${typeof name}`);
  }
  if (!name) throw new Error('SQL identifier must not be empty');

  const { open, close } = DELIMITERS[engine];
  return `${open}${name.split(close).join(close + close)}${close}`;
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
  table: string,
  limit: number = DEFAULT_PREVIEW_ROWS,
): string {
  assertEngine(engine);
  assertLimit(limit);
  const name = quoteSqlIdentifier(engine, table);

  switch (engine) {
    case 'mysql':
    case 'postgres':
      return `SELECT * FROM ${name} LIMIT ${limit}`;
    case 'mssql':
      return `SELECT TOP ${limit} * FROM ${name}`;
    case 'oracle':
      return `SELECT * FROM ${name} FETCH FIRST ${limit} ROWS ONLY`;
    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}
