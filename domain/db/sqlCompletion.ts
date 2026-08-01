/**
 * SQL completion logic, kept out of the editor so it can be tested without
 * Monaco. The editor layer only turns these candidates into its own item shape.
 *
 * The one decision that shapes everything is whether the cursor sits after a
 * qualifier — `p.` — because that means "columns of exactly one table" rather
 * than "anything that could go here".
 */

export interface SqlCompletionCandidate {
  label: string;
  kind: 'keyword' | 'table' | 'view' | 'column';
  detail?: string;
}

interface SchemaTable {
  name: string;
  kind: 'table' | 'view';
}

interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

export const SQL_KEYWORDS: string[] = [
  'SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'INSERT', 'UPDATE', 'SET', 'DELETE',
  'VALUES', 'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
  'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS NULL', 'IS NOT NULL',
  'GROUP BY', 'HAVING', 'ORDER BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'FETCH FIRST', 'TOP',
  'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'CAST', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'WITH',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX', 'TRUNCATE',
  'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'DEFAULT', 'NULL',
  'BEGIN', 'COMMIT', 'ROLLBACK', 'EXPLAIN',
];

/** Words that can follow a table name without being an alias. */
const NON_ALIAS_WORDS = new Set([
  'where', 'join', 'inner', 'left', 'right', 'full', 'cross', 'on', 'group', 'order',
  'having', 'limit', 'offset', 'union', 'set', 'values', 'and', 'or', 'as', 'using',
  'fetch', 'for', 'into', 'select',
]);

/**
 * The identifier the cursor is qualified by, or null.
 *
 * The leading `[^\w$.]` guard is what keeps `LIMIT 1.` from resolving to a
 * table named "1" — a qualifier must start with a letter or underscore.
 */
export function resolveQualifier(lineUpToCursor: string): string | null {
  const match = /(^|[^\w$.])([A-Za-z_][\w$]*)\.\s*[\w$]*$/.exec(lineUpToCursor);
  return match ? match[2] : null;
}

/**
 * Resolves a qualifier to a real table: either it names one directly, or it is
 * an alias bound by FROM/JOIN.
 */
export function resolveQualifiedTable(
  sql: string,
  qualifier: string,
  tables: SchemaTable[],
): string | null {
  const needle = qualifier.toLowerCase();

  const direct = tables.find((table) => table.name.toLowerCase() === needle);
  if (direct) return direct.name;

  // FROM/JOIN <table> [AS] <alias>
  const aliasPattern = /\b(?:from|join)\s+([A-Za-z_][\w$]*)\s+(?:as\s+)?([A-Za-z_][\w$]*)/gi;
  for (let match = aliasPattern.exec(sql); match; match = aliasPattern.exec(sql)) {
    const [, tableName, alias] = match;
    if (NON_ALIAS_WORDS.has(alias.toLowerCase())) continue;
    if (alias.toLowerCase() !== needle) continue;
    const known = tables.find((table) => table.name.toLowerCase() === tableName.toLowerCase());
    if (known) return known.name;
  }

  return null;
}

function describeColumn(column: SchemaColumn): string {
  return `${column.dataType}${column.nullable ? '' : ' · not null'}`;
}

/**
 * `columns` is what the caller resolved for the qualifier, or null when there
 * is no qualifier — or when its table could not be resolved.
 */
export function buildSqlCompletions({
  lineUpToCursor,
  tables,
  columns,
}: {
  lineUpToCursor: string;
  tables: SchemaTable[];
  columns: SchemaColumn[] | null;
}): SqlCompletionCandidate[] {
  if (resolveQualifier(lineUpToCursor)) {
    // After a dot, keywords and other table names are pure noise. An empty list
    // is also the honest answer when the qualifier did not resolve — falling
    // back to every table would imply it did.
    if (!columns) return [];
    return columns.map((column) => ({
      label: column.name,
      kind: 'column' as const,
      detail: describeColumn(column),
    }));
  }

  return [
    ...tables.map((table) => ({
      label: table.name,
      kind: table.kind,
      detail: table.kind === 'view' ? 'view' : 'table',
    })),
    ...SQL_KEYWORDS.map((keyword) => ({ label: keyword, kind: 'keyword' as const })),
  ];
}
