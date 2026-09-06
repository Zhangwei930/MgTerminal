import type { DbEngine } from '../models';
import { formatQualifiedTable, type QualifiedTable } from './identifiers';

/**
 * Assembles a whole-database dump: every table's DDL followed by its rows.
 *
 * The pieces come from elsewhere — the DDL from the schema tree's existing
 * read, the INSERTs from sqlDump — so this only orders them, labels them and
 * puts a header on top. That keeps the SQL generation in one place and this
 * file free of engine dialect beyond the one thing it has to know: how to turn
 * foreign key enforcement off while the file replays.
 *
 * That switch matters. A dump lists tables in whatever order the catalog
 * returned, so a restore routinely inserts a child row before its parent
 * exists. Sorting the tables would need the full dependency graph and still
 * fails on a cycle; turning the checks off for the duration is what the
 * engines' own dump tools do.
 */

export interface DumpTable {
  table: QualifiedTable;
  /** The CREATE TABLE, or null when it could not be read. */
  ddl: string | null;
  /** Why the DDL is missing, when it is. */
  error?: string;
  /** INSERT statements for the table's rows, already batched. */
  inserts: string[];
}

/** How each engine spells "stop enforcing foreign keys for a moment". */
const FK_GUARD: Partial<Record<DbEngine, { off: string; on: string }>> = {
  mysql: { off: 'SET FOREIGN_KEY_CHECKS = 0;', on: 'SET FOREIGN_KEY_CHECKS = 1;' },
  mariadb: { off: 'SET FOREIGN_KEY_CHECKS = 0;', on: 'SET FOREIGN_KEY_CHECKS = 1;' },
  sqlite: { off: 'PRAGMA foreign_keys = OFF;', on: 'PRAGMA foreign_keys = ON;' },
  // Postgres and SQL Server have no portable equivalent — Postgres needs
  // per-table ALTER ... DISABLE TRIGGER and superuser rights, SQL Server needs
  // one ALTER per constraint. Emitting a guess would put a statement the
  // server rejects at the top of every dump.
};

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

function stamp(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
    + ` ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

export function assembleDatabaseDump({
  engine,
  database,
  generatedAt,
  tables,
}: {
  engine: DbEngine;
  database: string;
  generatedAt: Date;
  tables: DumpTable[];
}): string {
  const guard = FK_GUARD[engine];

  const header = [
    '-- MagiesTerminal database dump',
    `-- Engine: ${engine}`,
    `-- Database: ${database || '(unnamed)'}`,
    `-- Generated: ${stamp(generatedAt)}`,
    '',
  ];

  if (!tables.length) {
    return [...header, '-- This database has no tables.', ''].join('\n');
  }

  const body: string[] = [];
  for (const entry of tables) {
    const name = formatQualifiedTable(entry.table);
    body.push(`-- Table: ${name}`);
    if (entry.ddl) {
      body.push(entry.ddl.trim().replace(/;?$/, ';'));
    } else {
      // Recorded rather than skipped: a dump that quietly omits a table looks
      // complete and restores an incomplete database.
      body.push(`-- Could not read this table's definition: ${entry.error ?? 'unknown error'}`);
    }
    if (entry.inserts.length) {
      body.push('');
      body.push(...entry.inserts.map((statement) => statement.trim()));
    }
    body.push('');
  }

  return [
    ...header,
    ...(guard ? [guard.off, ''] : []),
    ...body,
    ...(guard ? [guard.on, ''] : []),
  ].join('\n');
}

/** `shop-2026-01-02-030405.sql` — sorts chronologically in a directory. */
export function dumpFileName(database: string, generatedAt: Date): string {
  const safe = (database || 'database').replace(/[^\w.-]/g, '_') || 'database';
  const at = generatedAt;
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `${safe}-${date}-${time}.sql`;
}
