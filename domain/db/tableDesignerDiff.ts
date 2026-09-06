import type { DbEngine } from '../models';
import type { QualifiedTable } from './identifiers';
import {
  buildAddColumn,
  buildAlterColumn,
  buildDropColumn,
  buildRenameColumn,
  type DesignerColumn,
} from './tableDesignerSql';

/**
 * Turns an edited column list into the ALTER statements that get there.
 *
 * Rows that came from the server carry `originalName`, which is what a row is
 * matched on — not its current name, which is exactly the thing a rename
 * changes. A row without one is new.
 *
 * Statement order is not cosmetic:
 *
 * - Renames run first, so every statement after them can name a column by what
 *   the user now calls it rather than by what it used to be called.
 * - Drops run last. Anything that discards data should happen after the
 *   statements the user may be relying on to move it somewhere else.
 */

export interface DesignerRow extends DesignerColumn {
  /** The name this column had on the server; absent for a column being added. */
  originalName?: string;
}

function assertValid(edited: DesignerRow[]): void {
  if (!edited.length) {
    throw new Error('A table needs at least one column — removing them all would empty it.');
  }

  const seen = new Set<string>();
  for (const row of edited) {
    const name = row.name?.trim();
    if (!name) throw new Error('Every column needs a name.');
    if (!row.dataType?.trim()) throw new Error(`Column "${name}" needs a type.`);

    const key = name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate column name: ${name}`);
    seen.add(key);
  }
}

/** True when anything the ALTER would carry differs. */
function columnChanged(before: DesignerColumn, after: DesignerRow): boolean {
  return before.dataType !== after.dataType
    || before.nullable !== after.nullable
    || (before.defaultValue ?? null) !== (after.defaultValue ?? null);
}

export function diffTableDesign({
  engine,
  table,
  original,
  edited,
}: {
  engine: DbEngine;
  table: QualifiedTable | string;
  original: DesignerColumn[];
  edited: DesignerRow[];
}): string[] {
  assertValid(edited);

  const byOriginalName = new Map(original.map((column) => [column.name, column]));
  const kept = new Set<string>();

  const renames: string[] = [];
  const alters: string[] = [];
  const adds: string[] = [];

  for (const row of edited) {
    const before = row.originalName ? byOriginalName.get(row.originalName) : undefined;
    if (!before) {
      adds.push(buildAddColumn({ engine, table, column: row }));
      continue;
    }
    kept.add(before.name);

    if (before.name !== row.name) {
      renames.push(buildRenameColumn({ engine, table, from: before.name, to: row.name }));
    }
    if (columnChanged(before, row)) {
      alters.push(buildAlterColumn({ engine, table, column: row }));
    }
  }

  const drops = original
    .filter((column) => !kept.has(column.name))
    .map((column) => buildDropColumn({ engine, table, column: column.name }));

  return [...renames, ...alters, ...adds, ...drops];
}
