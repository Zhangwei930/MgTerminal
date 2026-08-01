"use strict";

const { quoteSqlIdentifier } = require("./schemaQueries.cjs");

/**
 * Rebuilds a CREATE TABLE statement from catalog information.
 *
 * MySQL and Oracle can hand back their own DDL (SHOW CREATE TABLE,
 * DBMS_METADATA.GET_DDL) and that is always preferable — it is what the server
 * actually has. Postgres and SQL Server have no such call, so for them the
 * statement is reconstructed from the columns, primary key and foreign keys the
 * schema queries already read.
 *
 * A reconstruction is necessarily incomplete: defaults, identity and
 * auto-increment, check constraints, collations, generated columns and
 * partitioning are not among the things we read. Handing this to someone as a
 * faithful CREATE TABLE would silently drop all of it, so every reconstructed
 * statement carries a comment saying what it is.
 *
 * Lives in the main process because that is where the catalog reads happen;
 * the renderer receives the finished statement over IPC.
 */

const DDL_IS_RECONSTRUCTED =
  "-- Reconstructed from the catalog: defaults, auto-increment/identity, check\n"
  + "-- constraints, collations and partitioning are not included.";

function buildCreateTableDdl({ engine, table, columns, primaryKey, foreignKeys }) {
  if (!columns || !columns.length) {
    throw new Error("Cannot build CREATE TABLE for a table with no columns.");
  }

  const q = (name) => quoteSqlIdentifier(engine, name);
  const ordered = [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const lines = ordered.map(
    (column) => `  ${q(column.name)} ${column.dataType}${column.nullable ? "" : " NOT NULL"}`,
  );

  if (primaryKey && primaryKey.length) {
    // A constraint rather than a per-column flag: a composite key cannot be
    // expressed one column at a time.
    lines.push(`  PRIMARY KEY (${primaryKey.map(q).join(", ")})`);
  }

  // Several rows of one constraint are one foreign key over several columns,
  // not several constraints.
  const byConstraint = new Map();
  for (const fk of foreignKeys ?? []) {
    const group = byConstraint.get(fk.name);
    if (group) group.push(fk);
    else byConstraint.set(fk.name, [fk]);
  }
  for (const [name, group] of byConstraint) {
    const local = group.map((fk) => q(fk.column)).join(", ");
    const target = q(group[0].referencedTable);
    const targetColumns = group.map((fk) => q(fk.referencedColumn)).join(", ");
    lines.push(
      `  CONSTRAINT ${q(name)} FOREIGN KEY (${local}) REFERENCES ${target} (${targetColumns})`,
    );
  }

  return `${DDL_IS_RECONSTRUCTED}\nCREATE TABLE ${q(table)} (\n${lines.join(",\n")}\n);`;
}

module.exports = { DDL_IS_RECONSTRUCTED, buildCreateTableDdl };
