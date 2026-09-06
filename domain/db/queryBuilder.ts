import type { DbEngine } from '../models';
import { type QualifiedTable, quoteQualifiedTable, quoteSqlIdentifier } from './identifiers';

/**
 * Builds a SELECT from what the query builder's form holds.
 *
 * Deliberately one table and no joins. A builder that tries to cover joins,
 * grouping and subqueries ends up a worse SQL editor than the SQL editor next
 * to it; this covers the case the editor is tedious for — pick some columns,
 * filter, sort — and hands the result to that editor to take further.
 *
 * The operator is the only structural part a user chooses, and it is matched
 * against a fixed list rather than interpolated: a free-text operator is a way
 * to write arbitrary SQL into the WHERE clause.
 */

export const COMPARISON_OPERATORS = [
  '=', '<>', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL',
] as const;

export type ComparisonOperator = typeof COMPARISON_OPERATORS[number];

export interface QueryFilter {
  column: string;
  operator: ComparisonOperator;
  /** Ignored by IS NULL / IS NOT NULL. */
  value: string;
}

export interface QuerySort {
  column: string;
  direction: 'asc' | 'desc';
}

/** Operators whose right-hand side is part of the operator, not a value. */
const VALUELESS = new Set<ComparisonOperator>(['IS NULL', 'IS NOT NULL']);
const LIKE_OPERATORS = new Set<ComparisonOperator>(['LIKE', 'NOT LIKE']);

/** A bare integer or decimal, written unquoted so numeric columns compare. */
const NUMERIC = /^-?\d+(\.\d+)?$/;

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function formatFilterValue(operator: ComparisonOperator, value: string): string {
  if (LIKE_OPERATORS.has(operator)) {
    // Someone who typed their own wildcards meant them; someone who did not
    // meant "contains", which is what a filter box is for.
    const pattern = /[%_]/.test(value) ? value : `%${value}%`;
    return quoteLiteral(pattern);
  }
  return NUMERIC.test(value.trim()) ? value.trim() : quoteLiteral(value);
}

export function buildSelectFromSpec({
  engine,
  table,
  columns,
  filters,
  sorts,
  limit,
}: {
  engine: DbEngine;
  table: QualifiedTable | string;
  /** Empty means every column. */
  columns: string[];
  filters: QueryFilter[];
  sorts: QuerySort[];
  limit?: number;
}): string {
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    // Interpolated into SQL, so anything else is both wrong and an injection.
    throw new Error(`Row limit must be a positive integer, received ${String(limit)}`);
  }

  const projection = columns.length
    ? columns.map((column) => quoteSqlIdentifier(engine, column)).join(', ')
    : '*';

  // SQL Server puts its row cap before the column list rather than after the
  // query, so the SELECT line has to know about the limit.
  const head = engine === 'mssql' && limit !== undefined
    ? `SELECT TOP ${limit} ${projection}`
    : `SELECT ${projection}`;

  const lines = [head, `FROM ${quoteQualifiedTable(engine, table)}`];

  if (filters.length) {
    const conditions = filters.map((filter) => {
      if (!COMPARISON_OPERATORS.includes(filter.operator)) {
        throw new Error(`Unsupported comparison operator: ${String(filter.operator)}`);
      }
      const column = quoteSqlIdentifier(engine, filter.column);
      if (VALUELESS.has(filter.operator)) return `${column} ${filter.operator}`;
      return `${column} ${filter.operator} ${formatFilterValue(filter.operator, filter.value)}`;
    });
    lines.push(`WHERE ${conditions.join(' AND ')}`);
  }

  if (sorts.length) {
    const ordering = sorts
      .map((sort) => `${quoteSqlIdentifier(engine, sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`)
      .join(', ');
    lines.push(`ORDER BY ${ordering}`);
  }

  if (limit !== undefined && engine !== 'mssql') {
    lines.push(engine === 'oracle' ? `FETCH FIRST ${limit} ROWS ONLY` : `LIMIT ${limit}`);
  }

  return lines.join('\n');
}
