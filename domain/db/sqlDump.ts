import type { DbEngine } from '../models';
import { type QualifiedTable, quoteQualifiedTable, quoteSqlIdentifier } from './identifiers';
import { formatSqlValue } from './rowEditSql';

/**
 * Turns a result set into INSERT statements — the data half of a backup, to go
 * with the CREATE TABLE the schema tree can already produce.
 *
 * Rows are batched into multi-row INSERTs rather than one statement per row,
 * which keeps the file readable and the restore fast. The batch is capped
 * because a single statement holding a hundred thousand rows is rejected by
 * most servers (MySQL's max_allowed_packet, SQL Server's 1000-row VALUES limit)
 * and unreadable in an editor regardless.
 */

const DEFAULT_BATCH_SIZE = 500;

interface DumpColumn {
  name: string;
}

/**
 * The statements as a list, for callers that run them one at a time.
 *
 * The joined form below is for writing a file. Recovering the individual
 * statements from it by splitting on the blank line between them does not
 * work: a cell holding a blank line — a notes or description column,
 * routinely — contains that exact delimiter, and the split then cuts through
 * the middle of a string literal.
 */
export function buildInsertStatementList({
  engine,
  table,
  columns,
  rows,
  batchSize = DEFAULT_BATCH_SIZE,
}: {
  engine: DbEngine;
  table: QualifiedTable | string;
  columns: DumpColumn[];
  rows: unknown[][];
  batchSize?: number;
}): string[] {
  if (!columns?.length) {
    throw new Error('Cannot build INSERT statements without column names.');
  }
  // An INSERT with an empty VALUES list is a syntax error, so no rows means no
  // statements rather than an empty one.
  if (!rows?.length) return [];

  const q = (name: string) => quoteSqlIdentifier(engine, name);
  const target = `INSERT INTO ${quoteQualifiedTable(engine, table)}`
    + ` (${columns.map((c) => q(c.name)).join(', ')}) VALUES`;

  const tuples = rows.map((row, index) => {
    if (row.length !== columns.length) {
      // Emitting it would put a statement the server rejects somewhere in the
      // middle of the file, where it is found only on restore.
      throw new Error(
        `Row ${index} has ${row.length} values but the result has ${columns.length} columns.`,
      );
    }
    return `  (${row.map((cell) => formatSqlValue(cell, engine)).join(', ')})`;
  });

  const size = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE;
  const statements: string[] = [];
  for (let i = 0; i < tuples.length; i += size) {
    statements.push(`${target}\n${tuples.slice(i, i + size).join(',\n')};`);
  }
  return statements;
}

/** The same statements as one document, for writing to a file. */
export function buildInsertStatements(args: Parameters<typeof buildInsertStatementList>[0]): string {
  return buildInsertStatementList(args).join('\n\n');
}
