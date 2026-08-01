import type { DbEngine } from '../models';
import { quoteSqlIdentifier } from './previewQuery';

/**
 * Compares two schemas and writes a script to bring the target in line.
 *
 * The rule that shapes the whole thing: only additive statements come out
 * runnable. Anything that can lose data — dropping a table or column, changing
 * a type, tightening nullability — is emitted commented out, so applying the
 * script cannot destroy something by accident. The differences are all shown
 * either way; what differs is whether running the file acts on them.
 *
 * This is deliberately more conservative than a sync tool that just does what
 * it is told. A schema comparison is usually run against an environment holding
 * real data, and the cost of a wrong DROP is not symmetric with the cost of
 * pasting one line by hand.
 */

export interface SchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
}

export interface SchemaSnapshot {
  tables: { name: string; columns: SchemaColumn[] }[];
}

export type SchemaDifference =
  | { kind: 'table-missing'; table: string }
  | { kind: 'table-extra'; table: string }
  | { kind: 'column-missing'; table: string; column: string }
  | { kind: 'column-extra'; table: string; column: string }
  | { kind: 'column-type'; table: string; column: string; source: string; target: string }
  | { kind: 'column-nullable'; table: string; column: string; sourceNullable: boolean };

/**
 * Postgres folds unquoted identifiers to lower case and Oracle to upper, so the
 * same table read from each would otherwise look like two different tables.
 */
const key = (name: string) => name.trim().toLowerCase();

export function diffSchemas(source: SchemaSnapshot, target: SchemaSnapshot): SchemaDifference[] {
  const sourceTables = new Map(source.tables.map((t) => [key(t.name), t]));
  const targetTables = new Map(target.tables.map((t) => [key(t.name), t]));

  const differences: SchemaDifference[] = [];

  // Sorted so re-reading either schema in a different order does not reshuffle
  // the script under the user.
  const sourceNames = [...sourceTables.keys()].sort();
  const targetNames = [...targetTables.keys()].sort();

  for (const name of sourceNames) {
    const sourceTable = sourceTables.get(name)!;
    const targetTable = targetTables.get(name);
    if (!targetTable) {
      differences.push({ kind: 'table-missing', table: sourceTable.name });
      continue;
    }

    const targetColumns = new Map(targetTable.columns.map((c) => [key(c.name), c]));
    const sourceColumns = new Map(sourceTable.columns.map((c) => [key(c.name), c]));

    for (const column of sourceTable.columns) {
      const other = targetColumns.get(key(column.name));
      if (!other) {
        differences.push({ kind: 'column-missing', table: sourceTable.name, column: column.name });
        continue;
      }
      if (key(column.dataType) !== key(other.dataType)) {
        differences.push({
          kind: 'column-type',
          table: sourceTable.name,
          column: column.name,
          source: column.dataType,
          target: other.dataType,
        });
      }
      if (column.nullable !== other.nullable) {
        differences.push({
          kind: 'column-nullable',
          table: sourceTable.name,
          column: column.name,
          sourceNullable: column.nullable,
        });
      }
    }

    for (const column of targetTable.columns) {
      if (!sourceColumns.has(key(column.name))) {
        differences.push({ kind: 'column-extra', table: sourceTable.name, column: column.name });
      }
    }
  }

  for (const name of targetNames) {
    if (!sourceTables.has(name)) {
      differences.push({ kind: 'table-extra', table: targetTables.get(name)!.name });
    }
  }

  return differences;
}

const HEADER = [
  '-- Schema comparison.',
  '--',
  '-- Statements that only add things are runnable as written. Anything that can',
  '-- lose data is commented out — dropping a table or column, changing a type,',
  '-- tightening nullability, or adding a NOT NULL column to a table that already',
  '-- has rows. Read those, decide, and uncomment the ones you want.',
  '',
].join('\n');

export function buildSyncScript(
  engine: DbEngine,
  differences: SchemaDifference[],
  source: SchemaSnapshot,
): string {
  const q = (name: string) => quoteSqlIdentifier(engine, name);
  const byName = new Map(source.tables.map((t) => [key(t.name), t]));
  const out: string[] = [HEADER];

  if (!differences.length) {
    out.push('-- The two schemas match.');
    return out.join('\n');
  }

  for (const diff of differences) {
    switch (diff.kind) {
      case 'table-missing': {
        const table = byName.get(key(diff.table));
        const columns = (table?.columns ?? []).map(
          (c) => `  ${q(c.name)} ${c.dataType}${c.nullable ? '' : ' NOT NULL'}`,
        );
        out.push(`CREATE TABLE ${q(diff.table)} (\n${columns.join(',\n')}\n);`, '');
        break;
      }
      case 'column-missing': {
        const column = byName.get(key(diff.table))?.columns
          .find((c) => key(c.name) === key(diff.column));
        const statement =
          `ALTER TABLE ${q(diff.table)} ADD COLUMN ${q(diff.column)} ${column?.dataType ?? ''}`;
        if (column && !column.nullable) {
          // The rows already there have no value for it, so this fails — or
          // succeeds against an empty test table and fails in production.
          out.push(
            `-- Adding a NOT NULL column to a table with rows fails; give it a default first.`,
            `-- ${statement} NOT NULL;`,
            '',
          );
        } else {
          out.push(`${statement};`, '');
        }
        break;
      }
      case 'table-extra':
        out.push(
          `-- Only in the target. Dropping it destroys its data:`,
          `-- DROP TABLE ${q(diff.table)};`,
          '',
        );
        break;
      case 'column-extra':
        out.push(
          `-- Only in the target. Dropping it destroys its data:`,
          `-- ALTER TABLE ${q(diff.table)} DROP COLUMN ${q(diff.column)};`,
          '',
        );
        break;
      case 'column-type':
        out.push(
          `-- ${diff.table}.${diff.column}: ${diff.target} here, ${diff.source} in the source.`,
          `-- Narrowing a type truncates; there is no safe automatic answer:`,
          `-- ALTER TABLE ${q(diff.table)} ALTER COLUMN ${q(diff.column)} TYPE ${diff.source};`,
          '',
        );
        break;
      case 'column-nullable':
        out.push(
          diff.sourceNullable
            ? `-- ${diff.table}.${diff.column} is nullable in the source:`
            : `-- ${diff.table}.${diff.column} is NOT NULL in the source. SET NOT NULL fails if any row holds a null:`,
          `-- ALTER TABLE ${q(diff.table)} ALTER COLUMN ${q(diff.column)} `
            + `${diff.sourceNullable ? 'DROP NOT NULL' : 'SET NOT NULL'};`,
          '',
        );
        break;
    }
  }

  return out.join('\n');
}
