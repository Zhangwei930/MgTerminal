import type { DbEngine } from '../models';
import { quoteSqlIdentifier } from './previewQuery';

/**
 * Statements for editing a single row from the results grid.
 *
 * The adapters take a SQL string with no parameter binding, so every value here
 * is interpolated. That makes formatSqlValue the boundary, and it doubles
 * quotes rather than escaping with backslashes — the SQL standard form, and the
 * only one that survives MySQL's NO_BACKSLASH_ESCAPES.
 *
 * Neither builder will produce a statement without a WHERE. An UPDATE without
 * one rewrites the whole table and a DELETE without one empties it, and a grid
 * edit is not where that should be possible.
 */

export interface RowKey {
  column: string;
  value: unknown;
}

function assertKeys(keys: RowKey[]): void {
  if (!keys.length) {
    throw new Error(
      'Cannot edit a row without a primary key — the statement would have no WHERE clause and would affect every row.',
    );
  }
}

export function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`SQL value must be a finite number, received ${String(value)}`);
    }
    return String(value);
  }
  if (value instanceof Date) return `'${value.toISOString()}'`;

  // A json/jsonb column arrives as a parsed object, and String() would write
  // it out as '[object Object]' — a value the column would accept and that
  // destroys the data.
  const text = typeof value === 'object'
    ? JSON.stringify(value)
    : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

function buildWhere(engine: DbEngine, keys: RowKey[]): string {
  return keys
    .map((key) => {
      const column = quoteSqlIdentifier(engine, key.column);
      // `= NULL` matches nothing, so an edit keyed on a null column would
      // silently affect no rows at all.
      if (key.value === null || key.value === undefined) return `${column} IS NULL`;
      return `${column} = ${formatSqlValue(key.value)}`;
    })
    .join(' AND ');
}

export function buildUpdateStatement({
  engine,
  table,
  column,
  value,
  keys,
}: {
  engine: DbEngine;
  table: string;
  column: string;
  value: unknown;
  keys: RowKey[];
}): string {
  assertKeys(keys);
  return [
    `UPDATE ${quoteSqlIdentifier(engine, table)}`,
    `SET ${quoteSqlIdentifier(engine, column)} = ${formatSqlValue(value)}`,
    `WHERE ${buildWhere(engine, keys)}`,
  ].join(' ');
}

export function buildDeleteStatement({
  engine,
  table,
  keys,
}: {
  engine: DbEngine;
  table: string;
  keys: RowKey[];
}): string {
  assertKeys(keys);
  return `DELETE FROM ${quoteSqlIdentifier(engine, table)} WHERE ${buildWhere(engine, keys)}`;
}
