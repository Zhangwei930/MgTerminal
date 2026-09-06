import type { DbEngine } from '../models';
import type { QualifiedTable } from './identifiers';
import { buildInsertStatementList } from './sqlDump';
import { buildCreateTable, type DesignerColumn } from './tableDesignerSql';

/**
 * Reading a delimited or JSON file into a table.
 *
 * The parser is RFC 4180 rather than a split on commas, because the files that
 * reach an import dialog come out of Excel: quoted fields holding commas,
 * doubled quotes inside those, and newlines inside those.
 *
 * Every value ends up a string. A CSV has no types, so the type of a column is
 * inferred from what is in it and shown to the user before anything runs — the
 * import dialog is where a wrong guess gets corrected, not here.
 */

export interface ParsedRows {
  headers: string[];
  rows: string[][];
}

const DEFAULT_BATCH_SIZE = 500;
/** Beyond this a run of digits is an identifier, not a number. */
const MAX_SAFE_INTEGER_DIGITS = 18;

/**
 * Guesses the delimiter from the first line: whichever candidate appears most.
 * A file with one column has no separator to find, and a comma is the reading
 * that parses it correctly anyway.
 */
export function sniffDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimited(
  text: string,
  { delimiter }: { delimiter?: string } = {},
): ParsedRows {
  if (!text || !text.trim()) return { headers: [], rows: [] };
  const sep = delimiter ?? sniffDelimiter(text);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  let i = 0;

  const endField = () => { record.push(field); field = ''; };
  const endRecord = () => { endField(); records.push(record); record = []; };

  while (i < text.length) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === '') { quoted = true; i += 1; continue; }
    if (char === sep) { endField(); i += 1; continue; }
    if (char === '\r') { i += 1; continue; }
    if (char === '\n') { endRecord(); i += 1; continue; }

    field += char;
    i += 1;
  }
  // A file that does not end in a newline still has one last record; one that
  // does must not gain an empty one.
  if (field !== '' || record.length) endRecord();

  const [headers = [], ...rows] = records;
  rows.forEach((row, index) => {
    if (row.length !== headers.length) {
      throw new Error(
        `Row ${index + 1} has ${row.length} values but the header has ${headers.length} columns.`,
      );
    }
  });
  return { headers, rows };
}

/** JSON in the shape an export produces: an array of flat objects. */
export function parseJsonRows(text: string): ParsedRows {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of objects.');
  if (!parsed.length) return { headers: [], rows: [] };
  if (parsed.some((row) => typeof row !== 'object' || row === null || Array.isArray(row))) {
    throw new Error('Every element must be a JSON object.');
  }

  // Union of keys in first-seen order, so a key only some rows carry is still
  // a column rather than being dropped with its values.
  const headers: string[] = [];
  for (const row of parsed as Record<string, unknown>[]) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }

  const rows = (parsed as Record<string, unknown>[]).map((row) =>
    headers.map((key) => {
      const value = row[key];
      if (value === null || value === undefined) return '';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }),
  );
  return { headers, rows };
}

const INTEGER = /^-?\d+$/;
const DECIMAL = /^-?\d*\.\d+$/;

/**
 * A column type wide enough for every value in the column.
 *
 * Biased towards text: a wrong "integer" rejects the import outright, or worse
 * rounds an identifier that only looked like a number.
 */
export function inferColumnType(values: string[], engine: DbEngine): string {
  const present = values.map((value) => value?.trim() ?? '').filter(Boolean);
  const textType = (length: number) => {
    // MySQL and MariaDB cap a row at 65535 bytes across every column, and
    // utf8mb4 counts four per character — so a few varchar(4000) columns
    // cannot share a table at all. Past a modest width the unbounded type is
    // the only one that composes, and it costs nothing here.
    const width = Math.min(Math.max(length * 2, 32), 1000);
    if (engine === 'postgres') return 'text';
    if (length * 2 > 1000) return engine === 'oracle' ? 'CLOB' : 'text';
    return `varchar(${width})`;
  };

  if (!present.length) return textType(32);

  if (present.every((value) => INTEGER.test(value))) {
    // Long digit strings are account numbers and IDs; an integer column would
    // round them or refuse them.
    if (present.some((value) => value.replace('-', '').length > MAX_SAFE_INTEGER_DIGITS)) {
      return textType(Math.max(...present.map((value) => value.length)));
    }
    return engine === 'oracle' ? 'NUMBER(19)' : 'bigint';
  }

  if (present.every((value) => INTEGER.test(value) || DECIMAL.test(value))) {
    return engine === 'oracle' ? 'NUMBER' : 'numeric(38,10)';
  }

  return textType(Math.max(...present.map((value) => value.length)));
}

export function buildImportStatements({
  engine,
  table,
  headers,
  rows,
  createTable,
  batchSize = DEFAULT_BATCH_SIZE,
  columnTypes,
}: {
  engine: DbEngine;
  table: QualifiedTable | string;
  headers: string[];
  rows: string[][];
  /** True emits a CREATE TABLE from the inferred types before the data. */
  createTable: boolean;
  batchSize?: number;
  /** Overrides the inferred types, one per header. */
  columnTypes?: string[];
}): string[] {
  if (!headers?.length) {
    throw new Error('The file has no columns to import.');
  }

  const statements: string[] = [];

  if (createTable) {
    const columns: DesignerColumn[] = headers.map((name, index) => ({
      name,
      dataType: columnTypes?.[index]
        ?? inferColumnType(rows.map((row) => row[index] ?? ''), engine),
      nullable: true,
    }));
    statements.push(buildCreateTable({ engine, table, columns }));
  }

  if (!rows.length) return statements;

  // A delimited file cannot distinguish an empty cell from a missing one, and
  // NULL is the reading a numeric or date column will actually accept.
  const values = rows.map((row) => row.map((cell) => (cell === '' ? null : cell)));

  statements.push(...buildInsertStatementList({
    engine,
    table,
    columns: headers.map((name) => ({ name })),
    rows: values,
    batchSize,
  }));
  return statements;
}
