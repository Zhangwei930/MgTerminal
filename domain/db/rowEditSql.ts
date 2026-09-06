import type { DbEngine } from '../models';
import { type QualifiedTable, quoteQualifiedTable, quoteSqlIdentifier } from './identifiers';

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

function quoteText(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * The local wall-clock time, as `YYYY-MM-DD HH:MM:SS.mmm`.
 *
 * Not toISOString(): the drivers build these Dates from the server's own wall
 * clock for the types that carry no zone, so converting to UTC on the way back
 * stores a different instant than the grid displayed — and the trailing `Z`
 * is rejected outright by MySQL's DATETIME.
 */
function localTimestamp(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1, 2)}-${pad(value.getDate(), 2)}`
    + ` ${pad(value.getHours(), 2)}:${pad(value.getMinutes(), 2)}:${pad(value.getSeconds(), 2)}`
    + `.${pad(value.getMilliseconds(), 3)}`;
}

function formatDate(value: Date, engine: DbEngine): string {
  if (Number.isNaN(value.getTime())) {
    throw new Error('SQL value must be a valid date');
  }
  const stamp = localTimestamp(value);
  switch (engine) {
    case 'mssql':
      // The ISO 8601 `T` form is the one literal SQL Server reads the same way
      // under every DATEFORMAT and language setting.
      return quoteText(stamp.replace(' ', 'T'));
    case 'oracle':
      // Oracle would otherwise parse the string with NLS_DATE_FORMAT, which is
      // a session setting and routinely is not this shape.
      return `TO_TIMESTAMP(${quoteText(stamp)},'YYYY-MM-DD HH24:MI:SS.FF3')`;
    case 'sqlite':
      // SQLite has no date type: its date functions read exactly this text
      // layout, so the literal is both the storage and the format.
      return quoteText(stamp);
    default:
      return quoteText(stamp);
  }
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * A BLOB / bytea / varbinary value, in the byte literal each engine reads.
 *
 * These arrive as a Buffer and cross IPC as a Uint8Array. Falling through to
 * the object branch would JSON-stringify them into {"0":170,...} — which the
 * column accepts, so the corruption is silent, and which matches no row when
 * it lands in a WHERE.
 */
function formatBinary(bytes: Uint8Array, engine: DbEngine): string {
  const hex = toHex(bytes);
  switch (engine) {
    // SQLite spells a blob literal the same way MySQL does.
    case 'mysql':
    case 'mariadb':
    case 'sqlite':
      return `X'${hex.toUpperCase()}'`;
    case 'postgres':
      return `'\\x${hex}'::bytea`;
    case 'mssql':
      return `0x${hex.toUpperCase()}`;
    case 'oracle':
      return `HEXTORAW('${hex.toUpperCase()}')`;
    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}

function isBinary(value: object): value is Uint8Array {
  return value instanceof Uint8Array || ArrayBuffer.isView(value as ArrayBufferView);
}

export function formatSqlValue(value: unknown, engine: DbEngine): string {
  if (value === null || value === undefined) return 'NULL';

  if (typeof value === 'boolean') {
    // SQL Server has no TRUE/FALSE keyword, Oracle had no boolean column type
    // at all before 23c, and SQLite stores booleans as integers — all three
    // spell it as a bit.
    if (engine === 'mssql' || engine === 'oracle' || engine === 'sqlite') return value ? '1' : '0';
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`SQL value must be a finite number, received ${String(value)}`);
    }
    return String(value);
  }

  if (typeof value === 'bigint') return String(value);
  if (value instanceof Date) return formatDate(value, engine);

  if (typeof value === 'object') {
    if (isBinary(value)) {
      const view = value as ArrayBufferView;
      return formatBinary(
        value instanceof Uint8Array
          ? value
          : new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
        engine,
      );
    }
    // A json/jsonb column arrives as a parsed object, and String() would write
    // it out as '[object Object]' — a value the column would accept and that
    // destroys the data.
    return quoteText(JSON.stringify(value));
  }

  return quoteText(String(value));
}

function buildWhere(engine: DbEngine, keys: RowKey[]): string {
  return keys
    .map((key) => {
      const column = quoteSqlIdentifier(engine, key.column);
      // `= NULL` matches nothing, so an edit keyed on a null column would
      // silently affect no rows at all.
      if (key.value === null || key.value === undefined) return `${column} IS NULL`;
      return `${column} = ${formatSqlValue(key.value, engine)}`;
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
  table: QualifiedTable | string;
  column: string;
  value: unknown;
  keys: RowKey[];
}): string {
  assertKeys(keys);
  return [
    `UPDATE ${quoteQualifiedTable(engine, table)}`,
    `SET ${quoteSqlIdentifier(engine, column)} = ${formatSqlValue(value, engine)}`,
    `WHERE ${buildWhere(engine, keys)}`,
  ].join(' ');
}

export function buildDeleteStatement({
  engine,
  table,
  keys,
}: {
  engine: DbEngine;
  table: QualifiedTable | string;
  keys: RowKey[];
}): string {
  assertKeys(keys);
  return `DELETE FROM ${quoteQualifiedTable(engine, table)} WHERE ${buildWhere(engine, keys)}`;
}
