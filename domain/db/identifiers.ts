import type { DbEngine } from '../models';

/**
 * Identifier quoting, and the schema half of a table name.
 *
 * The schema tree lists tables from every schema on the server, so a bare
 * table name is ambiguous the moment two schemas hold the same one. Anything
 * that names a table in generated SQL therefore carries the schema with it and
 * quotes the two parts separately: `"public"."users"`, never `"public.users"`,
 * which is a single identifier no server has.
 */

/** Identifier delimiters, per engine. SQL Server's pair is asymmetric. */
const DELIMITERS: Record<DbEngine, { open: string; close: string }> = {
  mysql: { open: '`', close: '`' },
  mariadb: { open: '`', close: '`' },
  postgres: { open: '"', close: '"' },
  oracle: { open: '"', close: '"' },
  mssql: { open: '[', close: ']' },
  // SQLite accepts several, and the standard double quote is the one that
  // means "identifier" rather than "string that might be an identifier".
  sqlite: { open: '"', close: '"' },
};

/** Every delimiter any engine uses, for stripping quotes off a parsed name. */
const ALL_OPEN = '`"[';
const ALL_CLOSE = '`"]';

export interface QualifiedTable {
  /**
   * Schema (Postgres, SQL Server), owner (Oracle) or database (MySQL).
   * Absent means "whatever the connection resolves to" — the shape the schema
   * tree hands back only when the catalog did not report one.
   */
  schema?: string;
  name: string;
}

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

/** Removes one layer of surrounding quotes, whichever engine wrote them. */
function unquote(part: string): string {
  const trimmed = part.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (ALL_OPEN.includes(first) && ALL_CLOSE.includes(last)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Splits a table name that arrived as text — from parsing a user's SQL, or
 * from a saved query — into its schema and name.
 *
 * Splits on the first separator only. A name with more dots than that is not
 * something this app produces, and keeping the tail as the table name loses
 * less than dropping it would.
 */
export function parseQualifiedTable(raw: string): QualifiedTable {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Table name must be a non-empty string');
  }
  // Split on a dot that is not inside quotes, so `"a.b"."c"` keeps its parts.
  const match = /^\s*([`"[][^`"\]]*[`"\]]|[^.\s]+)\s*\.\s*(.+)$/.exec(raw);
  if (!match) return { name: unquote(raw) };

  const [, schemaPart, namePart] = match;
  return { schema: unquote(schemaPart), name: unquote(namePart) };
}

/** The plain-text form: what the UI shows and what keys a map of tables. */
export function formatQualifiedTable(table: QualifiedTable): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

/**
 * Quotes a table for interpolation into SQL, schema included when known.
 * Accepts the text form so callers holding a parsed-from-SQL name do not each
 * have to remember to split it first.
 */
export function quoteQualifiedTable(engine: DbEngine, table: QualifiedTable | string): string {
  assertEngine(engine);
  const resolved = typeof table === 'string' ? parseQualifiedTable(table) : table;
  const name = quoteSqlIdentifier(engine, resolved.name);
  return resolved.schema ? `${quoteSqlIdentifier(engine, resolved.schema)}.${name}` : name;
}
