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

/**
 * The remaining formats: Markdown for pasting into a ticket or a README, XML
 * and HTML for the tools that want structure.
 *
 * All three are text, which is what keeps them dependency-free. A real .xlsx
 * is a zip of XML parts and needs a library; CSV with the BOM above is what
 * Excel opens correctly, and is the export to reach for instead.
 */

/** Escapes the three characters that would otherwise be markup. */
function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function toMarkdown(columns: ExportColumn[], rows: unknown[][]): string {
  // A pipe would start a new cell and a newline a new row, so both are
  // neutralised rather than allowed to reshape the table.
  const cell = (value: unknown) => {
    const text = stringify(value);
    if (text === null) return '';
    return text.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  };

  const header = `| ${columns.map((column) => cell(column.name)).join(' | ')} |`;
  const rule = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
  return [header, rule, ...body].join('\n');
}

/**
 * A column name becomes an element name, and most of what a query can produce
 * is not a legal one — `count(*)`, `2024 total`, `a.b`. Illegal characters
 * become underscores and a leading digit gains one.
 */
function toElementName(name: string): string {
  const cleaned = (name || 'column').replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
}

export function toXml(columns: ExportColumn[], rows: unknown[][]): string {
  const names = columns.map((column) => toElementName(column.name));
  const body = rows.map((row) => {
    const fields = names.map((name, i) => {
      const text = stringify(row[i]);
      // An absent element is how XML spells a null; an empty one would read
      // back as an empty string.
      return text === null ? `    <${name}/>` : `    <${name}>${escapeXmlText(text)}</${name}>`;
    });
    return `  <row>\n${fields.join('\n')}\n  </row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rows>\n${body.join('\n')}\n</rows>`;
}

export function toHtml(columns: ExportColumn[], rows: unknown[][]): string {
  const escape = (value: unknown) => {
    const text = stringify(value);
    return text === null ? '' : escapeXmlText(text).replace(/"/g, '&quot;');
  };
  const head = `  <thead><tr>${columns.map((c) => `<th>${escape(c.name)}</th>`).join('')}</tr></thead>`;
  const body = rows
    .map((row) => `    <tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`)
    .join('\n');
  return `<table>\n${head}\n  <tbody>\n${body}\n  </tbody>\n</table>`;
}
