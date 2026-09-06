/**
 * Splits a script into the statements the editor should run, one at a time.
 *
 * `String.split(';')` cuts inside string literals, quoted identifiers,
 * comments and Postgres function bodies — all of which routinely contain a
 * semicolon — so this walks the text instead and only treats a semicolon as a
 * terminator when it is not inside one of those.
 *
 * A statement that holds nothing but comments and whitespace is dropped: it
 * would be sent to the server as an empty batch, which several engines reject.
 *
 * An unterminated literal or comment swallows the rest of the input rather
 * than splitting inside it. Handing the server one statement it rejects with a
 * clear message beats handing it fragments that each fail for their own reason.
 */

/** Closing delimiter for each identifier-quoting style. */
const IDENTIFIER_QUOTES: Record<string, string> = {
  '"': '"',
  '`': '`',
  '[': ']',
};

/** True when the text carries something the server would actually run. */
function hasStatement(text: string): boolean {
  const withoutComments = text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  return withoutComments.trim().length > 0;
}

export function splitSqlStatements(sql: string): string[] {
  if (typeof sql !== 'string' || !sql.trim()) return [];

  const statements: string[] = [];
  let start = 0;
  let i = 0;

  const push = (end: number) => {
    const text = sql.slice(start, end).trim();
    if (text && hasStatement(text)) statements.push(text);
    start = end + 1;
  };

  while (i < sql.length) {
    const char = sql[i];

    if (char === "'") {
      // A doubled quote inside is an escaped quote, not the end.
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          break;
        }
        i += 1;
      }
      i += 1;
      continue;
    }

    if (IDENTIFIER_QUOTES[char]) {
      const close = IDENTIFIER_QUOTES[char];
      i += 1;
      while (i < sql.length) {
        if (sql[i] === close) {
          if (sql[i + 1] === close) { i += 2; continue; }
          break;
        }
        i += 1;
      }
      i += 1;
      continue;
    }

    if (char === '-' && sql[i + 1] === '-') {
      const newline = sql.indexOf('\n', i);
      i = newline === -1 ? sql.length : newline;
      continue;
    }

    if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    // Postgres dollar quoting: $$ … $$ or $tag$ … $tag$. Function bodies live
    // in these, and a body is mostly semicolons.
    if (char === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (tag) {
        const marker = tag[0];
        const end = sql.indexOf(marker, i + marker.length);
        i = end === -1 ? sql.length : end + marker.length;
        continue;
      }
    }

    if (char === ';') {
      push(i);
      i += 1;
      continue;
    }

    i += 1;
  }

  push(sql.length);
  return statements;
}
