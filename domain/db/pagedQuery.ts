import type { DbEngine } from '../models';
import { splitSqlStatements } from './splitStatements';

/**
 * Turns the query in the editor into one page of it.
 *
 * Most engines take a wrapper: `SELECT * FROM (<query>) AS alias LIMIT n
 * OFFSET m`. SQL Server cannot — a subquery carrying its own ORDER BY is a
 * syntax error there, and stripping that ORDER BY would change which rows land
 * on which page. So its clause is appended to the original statement instead,
 * with an ordering supplied when the query has none, because OFFSET is only
 * legal after ORDER BY.
 *
 * Only a SELECT is ever paged. Wrapping an UPDATE or a DELETE would change
 * what it writes rather than how much of it you see.
 */

/** Distinctive enough not to collide with a table the query already names. */
const PAGE_ALIAS = 'magies_page';

/** Strips comments and string literals so keywords can be found by position. */
function maskLiteralsAndComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    if (char === "'") {
      const start = i;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue; }
          break;
        }
        i += 1;
      }
      i += 1;
      out += ' '.repeat(i - start);
      continue;
    }
    if (char === '-' && sql[i + 1] === '-') {
      const newline = sql.indexOf('\n', i);
      const end = newline === -1 ? sql.length : newline;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (char === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      const end = close === -1 ? sql.length : close + 2;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

function stripTrailingSemicolon(sql: string): string {
  return sql.trim().replace(/;\s*$/, '');
}

/** True when the statement is a single SELECT (a leading CTE counts). */
export function canPaginate(sql: string): boolean {
  if (typeof sql !== 'string' || !sql.trim()) return false;
  const statements = splitSqlStatements(sql);
  if (statements.length !== 1) return false;

  const masked = maskLiteralsAndComments(statements[0]).trim().toLowerCase();
  return masked.startsWith('select') || masked.startsWith('with');
}

/**
 * The index of the outermost ORDER BY, or -1.
 *
 * Depth-tracked, so an ORDER BY belonging to a subquery is not mistaken for
 * the statement's own — paging on the wrong one reorders the pages.
 */
function findTopLevelKeyword(sql: string, keyword: RegExp): number {
  const masked = maskLiteralsAndComments(sql);
  let depth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const char = masked[i];
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth -= 1; continue; }
    if (depth !== 0) continue;
    const match = keyword.exec(masked.slice(i));
    if (match && match.index === 0) return i;
  }
  return -1;
}

const ORDER_BY = /^order\s+by\b/i;
const ALREADY_PAGED = /^(offset\b|fetch\s+(first|next)\b)/i;

function assertBounds(limit: number, offset: number): void {
  if (!Number.isInteger(limit) || limit <= 0) {
    // Interpolated into SQL, so anything else is both wrong and an injection.
    throw new Error(`Page limit must be a positive integer, received ${String(limit)}`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error(`Page offset must be a non-negative integer, received ${String(offset)}`);
  }
}

export function buildPagedQuery(
  engine: DbEngine,
  sql: string,
  { limit, offset }: { limit: number; offset: number },
): string {
  assertBounds(limit, offset);
  if (!canPaginate(sql)) {
    throw new Error('Only a single SELECT statement can be paged.');
  }
  const inner = stripTrailingSemicolon(sql);

  if (engine === 'mssql') {
    if (findTopLevelKeyword(inner, ALREADY_PAGED) !== -1) {
      throw new Error('This query already pages itself — remove its OFFSET/FETCH first.');
    }
    const ordered = findTopLevelKeyword(inner, ORDER_BY) !== -1
      ? inner
      // OFFSET is only legal after ORDER BY; (SELECT NULL) is the no-op form
      // that adds a clause without imposing an order the user did not ask for.
      : `${inner} ORDER BY (SELECT NULL)`;
    return `${ordered} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
  }

  if (engine === 'oracle') {
    // Oracle rejects AS before a table alias.
    return `SELECT * FROM (${inner}) ${PAGE_ALIAS} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
  }

  return `SELECT * FROM (${inner}) AS ${PAGE_ALIAS} LIMIT ${limit} OFFSET ${offset}`;
}
