/**
 * Serialises a result set for export.
 *
 * CSV follows RFC 4180 — quote only when needed, double embedded quotes, CRLF
 * between rows — because the destination is almost always Excel, which is
 * unforgiving about all three.
 */

/** Prepended when writing a file so Excel reads UTF-8; never for the clipboard. */
export const UTF8_BOM = '﻿';

interface ExportColumn {
  name: string;
}

const NEEDS_QUOTING = /[",\r\n]/;
/** Excel treats a leading =, +, - or @ as the start of a formula. */
const FORMULA_LEAD = /^[=+\-@]/;

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function csvField(value: unknown): string {
  const text = stringify(value);
  // An empty field, not "NULL" — that would round-trip as a four-character
  // string rather than as an absent value.
  if (text === null) return '';

  // Excel executes a cell beginning with a formula character. Prefixing with an
  // apostrophe is the standard defence and leaves the value readable.
  const guarded = FORMULA_LEAD.test(text) ? `'${text}` : text;
  if (!NEEDS_QUOTING.test(guarded) && guarded === text) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function toCsv(columns: ExportColumn[], rows: unknown[][]): string {
  const header = columns.map((column) => csvField(column.name)).join(',');
  const body = rows.map((row) => row.map(csvField).join(','));
  return [header, ...body].join('\r\n');
}

export function toJson(columns: ExportColumn[], rows: unknown[][]): string {
  const names = columns.map((column) => column.name);
  const objects = rows.map((row) => {
    const out: Record<string, unknown> = {};
    names.forEach((name, i) => {
      const value = row[i];
      out[name] = value instanceof Date ? value.toISOString() : value ?? null;
    });
    return out;
  });
  return JSON.stringify(objects, null, 2);
}
