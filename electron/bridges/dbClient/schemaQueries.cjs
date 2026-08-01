"use strict";

/**
 * Schema introspection queries, per engine.
 *
 * These run through the normal adapter `query()` path, which takes a SQL string
 * and offers no parameter binding — so database and table names have to be
 * interpolated here. `quoteSqlLiteral` is therefore the only thing standing
 * between a table name and injection, and every interpolation goes through it.
 *
 * Results are normalised by the caller into { name, kind } / { name, dataType,
 * nullable, position }, so the differences between catalogs stay in this file.
 */

const ENGINES_WITH_SCHEMA_SUPPORT = Object.freeze(["mysql", "postgres", "mssql", "oracle"]);

/**
 * Wraps a value as a SQL string literal, doubling embedded quotes.
 *
 * Doubling — not backslash escaping — because it is the SQL standard and works
 * identically on all four engines; backslash handling varies (and is disabled
 * outright under MySQL's NO_BACKSLASH_ESCAPES).
 */
function quoteSqlLiteral(value) {
  if (typeof value !== "string") {
    throw new TypeError(`SQL literal must be a string, received ${typeof value}`);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

function assertEngine(engine) {
  if (!ENGINES_WITH_SCHEMA_SUPPORT.includes(engine)) {
    throw new Error(`Unsupported engine for schema introspection: ${engine}`);
  }
}

/**
 * Lists tables and views. `kind` is normalised to 'table' | 'view' so the tree
 * does not need to know each catalog's vocabulary.
 */
function buildTableListQuery(engine, database) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");

  switch (engine) {
    case "mysql":
      return `SELECT TABLE_NAME AS name,
       CASE WHEN TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS kind
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = ${db}
ORDER BY TABLE_TYPE, TABLE_NAME`;

    case "postgres":
      // Excludes the catalog schemas, otherwise the tree drowns in pg_catalog.
      return `SELECT table_name AS name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS kind
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_type, table_name`;

    case "mssql":
      return `SELECT t.name AS name, 'table' AS kind
FROM sys.tables t WHERE t.is_ms_shipped = 0
UNION ALL
SELECT v.name AS name, 'view' AS kind
FROM sys.views v WHERE v.is_ms_shipped = 0
ORDER BY kind, name`;

    case "oracle":
      // ALL_OBJECTS covers both in one pass; USER_* would miss other schemas.
      return `SELECT OBJECT_NAME AS name,
       CASE WHEN OBJECT_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS kind
FROM ALL_OBJECTS
WHERE OBJECT_TYPE IN ('TABLE', 'VIEW')
  AND OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN')
ORDER BY OBJECT_TYPE, OBJECT_NAME`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}

/** Lists a table's columns in declaration order. */
function buildColumnListQuery(engine, database, table) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");
  const tbl = quoteSqlLiteral(table ?? "");

  switch (engine) {
    case "mysql":
      return `SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type,
       IS_NULLABLE AS is_nullable, ORDINAL_POSITION AS position
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = ${db} AND TABLE_NAME = ${tbl}
ORDER BY ORDINAL_POSITION`;

    case "postgres":
      return `SELECT column_name AS name, data_type AS data_type,
       is_nullable AS is_nullable, ordinal_position AS position
FROM information_schema.columns
WHERE table_name = ${tbl}
  AND table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY ordinal_position`;

    case "mssql":
      return `SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type,
       IS_NULLABLE AS is_nullable, ORDINAL_POSITION AS position
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = ${tbl}
ORDER BY ORDINAL_POSITION`;

    case "oracle":
      return `SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type,
       NULLABLE AS is_nullable, COLUMN_ID AS position
FROM ALL_TAB_COLUMNS
WHERE TABLE_NAME = ${tbl}
ORDER BY COLUMN_ID`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}


/**
 * Names the columns of a table's primary key, in key order.
 *
 * Editing a grid cell means writing an UPDATE whose WHERE hits exactly one
 * row, and without a primary key there is no such WHERE — so the grid asks
 * this before it offers to edit anything. Composite keys come back in their
 * declared order, which is part of the key rather than a display detail.
 */
function buildPrimaryKeyQuery(engine, database, table) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");
  const tbl = quoteSqlLiteral(table ?? "");

  switch (engine) {
    case "mysql":
      // MySQL names every primary key constraint 'PRIMARY'.
      return `SELECT COLUMN_NAME AS name, ORDINAL_POSITION AS position
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = ${db} AND TABLE_NAME = ${tbl} AND CONSTRAINT_NAME = 'PRIMARY'
ORDER BY ORDINAL_POSITION`;

    case "postgres":
      return `SELECT kcu.column_name AS name, kcu.ordinal_position AS position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_name = ${tbl}
  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY kcu.ordinal_position`;

    case "mssql":
      return `SELECT c.name AS name, ic.key_ordinal AS position
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1 AND OBJECT_NAME(i.object_id) = ${tbl}
ORDER BY ic.key_ordinal`;

    case "oracle":
      // 'P' is Oracle's constraint type for a primary key.
      return `SELECT acc.COLUMN_NAME AS name, acc.POSITION AS position
FROM ALL_CONSTRAINTS ac
JOIN ALL_CONS_COLUMNS acc
  ON acc.CONSTRAINT_NAME = ac.CONSTRAINT_NAME AND acc.OWNER = ac.OWNER
WHERE ac.CONSTRAINT_TYPE = 'P' AND ac.TABLE_NAME = ${tbl}
ORDER BY acc.POSITION`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}


/**
 * Lists stored procedures and functions, `kind` normalised to
 * 'procedure' | 'function'.
 */
function buildRoutineListQuery(engine, database) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");

  switch (engine) {
    case "mysql":
      return `SELECT ROUTINE_NAME AS name, LOWER(ROUTINE_TYPE) AS kind
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = ${db}
ORDER BY ROUTINE_TYPE, ROUTINE_NAME`;

    case "postgres":
      return `SELECT routine_name AS name, LOWER(routine_type) AS kind
FROM information_schema.routines
WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY routine_type, routine_name`;

    case "mssql":
      return `SELECT ROUTINE_NAME AS name, LOWER(ROUTINE_TYPE) AS kind
FROM INFORMATION_SCHEMA.ROUTINES
ORDER BY ROUTINE_TYPE, ROUTINE_NAME`;

    case "oracle":
      // ALL_OBJECTS also holds tables and views; without this filter they would
      // appear a second time under Procedures.
      return `SELECT OBJECT_NAME AS name, LOWER(OBJECT_TYPE) AS kind
FROM ALL_OBJECTS
WHERE OBJECT_TYPE IN ('PROCEDURE', 'FUNCTION')
  AND OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN')
ORDER BY OBJECT_TYPE, OBJECT_NAME`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}

/** Lists triggers with the table each one belongs to. */
function buildTriggerListQuery(engine, database) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");

  switch (engine) {
    case "mysql":
      return `SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS table_name
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = ${db}
ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`;

    case "postgres":
      // information_schema.triggers has one row per event, so an
      // INSERT OR UPDATE trigger would otherwise appear twice.
      return `SELECT DISTINCT trigger_name AS name, event_object_table AS table_name
FROM information_schema.triggers
WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY event_object_table, trigger_name`;

    case "mssql":
      return `SELECT t.name AS name, OBJECT_NAME(t.parent_id) AS table_name
FROM sys.triggers t
WHERE t.is_ms_shipped = 0
ORDER BY OBJECT_NAME(t.parent_id), t.name`;

    case "oracle":
      return `SELECT TRIGGER_NAME AS name, TABLE_NAME AS table_name
FROM ALL_TRIGGERS
WHERE OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN')
ORDER BY TABLE_NAME, TRIGGER_NAME`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}

module.exports = {
  ENGINES_WITH_SCHEMA_SUPPORT,
  quoteSqlLiteral,
  buildTableListQuery,
  buildColumnListQuery,
  buildPrimaryKeyQuery,
  buildRoutineListQuery,
  buildTriggerListQuery,
};
