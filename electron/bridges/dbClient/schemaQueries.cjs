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

const ENGINES_WITH_SCHEMA_SUPPORT = Object.freeze([
  "mysql", "mariadb", "postgres", "mssql", "oracle", "sqlite",
]);

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
    case "mariadb":
      return `SELECT TABLE_NAME AS name, TABLE_SCHEMA AS schema_name,
       CASE WHEN TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS kind
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = ${db}
ORDER BY TABLE_TYPE, TABLE_NAME`;

    case "postgres":
      // Excludes the catalog schemas, otherwise the tree drowns in pg_catalog.
      return `SELECT table_name AS name, table_schema AS schema_name,
       CASE WHEN table_type = 'VIEW' THEN 'view' ELSE 'table' END AS kind
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_type, table_name`;

    case "mssql":
      return `SELECT t.name AS name, SCHEMA_NAME(t.schema_id) AS schema_name, 'table' AS kind
FROM sys.tables t WHERE t.is_ms_shipped = 0
UNION ALL
SELECT v.name AS name, SCHEMA_NAME(v.schema_id) AS schema_name, 'view' AS kind
FROM sys.views v WHERE v.is_ms_shipped = 0
ORDER BY schema_name, kind, name`;

    case "sqlite":
      // sqlite_master is the whole catalog. The sqlite_% names are the
      // engine's own bookkeeping tables and are not the user's schema.
      return `SELECT name AS name,
       CASE WHEN type = 'view' THEN 'view' ELSE 'table' END AS kind
FROM sqlite_master
WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
ORDER BY type, name`;

    case "oracle":
      // ALL_OBJECTS covers both in one pass; USER_* would miss other schemas.
      return `SELECT OBJECT_NAME AS name, OWNER AS schema_name,
       CASE WHEN OBJECT_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS kind
FROM ALL_OBJECTS
WHERE OBJECT_TYPE IN ('TABLE', 'VIEW')
  AND OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN')
ORDER BY OWNER, OBJECT_TYPE, OBJECT_NAME`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}

/**
 * Lists a table's columns in declaration order.
 *
 * `schema` narrows the lookup to one owner. Without it these filter on the
 * table name alone, and two schemas holding the same table hand back both
 * their column lists merged into one — interleaved by ordinal position, so the
 * result is not even a valid table.
 */
function buildColumnListQuery(engine, database, table, schema) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");
  const tbl = quoteSqlLiteral(table ?? "");
  const sch = schema ? quoteSqlLiteral(schema) : null;

  switch (engine) {
    case "mysql":
    case "mariadb":
      // MySQL's schema is its database, so a given schema replaces the
      // connection's rather than narrowing within it.
      return `SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type,
       IS_NULLABLE AS is_nullable, ORDINAL_POSITION AS position
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = ${sch ?? db} AND TABLE_NAME = ${tbl}
ORDER BY ORDINAL_POSITION`;

    case "postgres":
      return `SELECT column_name AS name, data_type AS data_type,
       is_nullable AS is_nullable, ordinal_position AS position
FROM information_schema.columns
WHERE table_name = ${tbl}
  AND ${sch ? `table_schema = ${sch}` : "table_schema NOT IN ('pg_catalog', 'information_schema')"}
ORDER BY ordinal_position`;

    case "mssql":
      return `SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type,
       IS_NULLABLE AS is_nullable, ORDINAL_POSITION AS position
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = ${tbl}${sch ? `
  AND TABLE_SCHEMA = ${sch}` : ""}
ORDER BY ORDINAL_POSITION`;

    case "sqlite":
      // pragma_table_info is a table-valued function, so it joins and filters
      // like any other relation. "notnull" and "pk" are keywords, hence quoted.
      return `SELECT name AS name, type AS data_type,
       CASE WHEN "notnull" = 0 THEN 'YES' ELSE 'NO' END AS is_nullable,
       cid + 1 AS position
FROM pragma_table_info(${tbl})
ORDER BY cid`;

    case "oracle":
      return `SELECT COLUMN_NAME AS name, DATA_TYPE AS data_type,
       NULLABLE AS is_nullable, COLUMN_ID AS position
FROM ALL_TAB_COLUMNS
WHERE TABLE_NAME = ${tbl}${sch ? `
  AND OWNER = ${sch}` : ""}
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
function buildPrimaryKeyQuery(engine, database, table, schema) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");
  const tbl = quoteSqlLiteral(table ?? "");
  const sch = schema ? quoteSqlLiteral(schema) : null;

  switch (engine) {
    case "mysql":
    case "mariadb":
      // MySQL names every primary key constraint 'PRIMARY'.
      return `SELECT COLUMN_NAME AS name, ORDINAL_POSITION AS position
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = ${sch ?? db} AND TABLE_NAME = ${tbl} AND CONSTRAINT_NAME = 'PRIMARY'
ORDER BY ORDINAL_POSITION`;

    case "postgres":
      return `SELECT kcu.column_name AS name, kcu.ordinal_position AS position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_name = ${tbl}
  AND ${sch ? `tc.table_schema = ${sch}` : "tc.table_schema NOT IN ('pg_catalog', 'information_schema')"}
ORDER BY kcu.ordinal_position`;

    case "mssql":
      return `SELECT c.name AS name, ic.key_ordinal AS position
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1 AND OBJECT_NAME(i.object_id) = ${tbl}${sch ? `
  AND OBJECT_SCHEMA_NAME(i.object_id) = ${sch}` : ""}
ORDER BY ic.key_ordinal`;

    case "sqlite":
      // pk is the 1-based position within the key, and 0 for a column that is
      // not part of it — so it filters and orders in one go.
      return `SELECT name AS name, pk AS position
FROM pragma_table_info(${tbl})
WHERE pk > 0
ORDER BY pk`;

    case "oracle":
      // 'P' is Oracle's constraint type for a primary key.
      return `SELECT acc.COLUMN_NAME AS name, acc.POSITION AS position
FROM ALL_CONSTRAINTS ac
JOIN ALL_CONS_COLUMNS acc
  ON acc.CONSTRAINT_NAME = ac.CONSTRAINT_NAME AND acc.OWNER = ac.OWNER
WHERE ac.CONSTRAINT_TYPE = 'P' AND ac.TABLE_NAME = ${tbl}${sch ? `
  AND ac.OWNER = ${sch}` : ""}
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
    case "mariadb":
      return `SELECT ROUTINE_NAME AS name, ROUTINE_SCHEMA AS schema_name, LOWER(ROUTINE_TYPE) AS kind
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = ${db}
ORDER BY ROUTINE_TYPE, ROUTINE_NAME`;

    case "postgres":
      return `SELECT routine_name AS name, routine_schema AS schema_name, LOWER(routine_type) AS kind
FROM information_schema.routines
WHERE routine_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY routine_schema, routine_type, routine_name`;

    case "mssql":
      return `SELECT ROUTINE_NAME AS name, ROUTINE_SCHEMA AS schema_name, LOWER(ROUTINE_TYPE) AS kind
FROM INFORMATION_SCHEMA.ROUTINES
ORDER BY ROUTINE_SCHEMA, ROUTINE_TYPE, ROUTINE_NAME`;

    case "sqlite":
      // SQLite has no stored procedures or functions. An empty result is the
      // honest answer, and keeps the tree from having to special-case it.
      return `SELECT NULL AS name, NULL AS schema_name, NULL AS kind WHERE 0`;

    case "oracle":
      // ALL_OBJECTS also holds tables and views; without this filter they would
      // appear a second time under Procedures.
      return `SELECT OBJECT_NAME AS name, OWNER AS schema_name, LOWER(OBJECT_TYPE) AS kind
FROM ALL_OBJECTS
WHERE OBJECT_TYPE IN ('PROCEDURE', 'FUNCTION')
  AND OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN')
ORDER BY OWNER, OBJECT_TYPE, OBJECT_NAME`;

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
    case "mariadb":
      return `SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS table_name,
       TRIGGER_SCHEMA AS schema_name
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = ${db}
ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME`;

    case "postgres":
      // information_schema.triggers has one row per event, so an
      // INSERT OR UPDATE trigger would otherwise appear twice.
      return `SELECT DISTINCT trigger_name AS name, event_object_table AS table_name,
       trigger_schema AS schema_name
FROM information_schema.triggers
WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY event_object_table, trigger_name`;

    case "mssql":
      return `SELECT t.name AS name, OBJECT_NAME(t.parent_id) AS table_name,
       OBJECT_SCHEMA_NAME(t.parent_id) AS schema_name
FROM sys.triggers t
WHERE t.is_ms_shipped = 0
ORDER BY OBJECT_SCHEMA_NAME(t.parent_id), OBJECT_NAME(t.parent_id), t.name`;

    case "sqlite":
      return `SELECT name AS name, tbl_name AS table_name
FROM sqlite_master
WHERE type = 'trigger'
ORDER BY tbl_name, name`;

    case "oracle":
      return `SELECT TRIGGER_NAME AS name, TABLE_NAME AS table_name,
       TABLE_OWNER AS schema_name
FROM ALL_TRIGGERS
WHERE OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN')
ORDER BY TABLE_OWNER, TABLE_NAME, TRIGGER_NAME`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}


/**
 * Lists a table's indexes, one row per indexed column.
 *
 * The caller groups them by index name — a composite index on (a, b) is a
 * different index from one on (b, a), so column order is significant and every
 * engine is asked to preserve it.
 */
function buildIndexListQuery(engine, database, table, schema) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");
  const tbl = quoteSqlLiteral(table ?? "");
  const sch = schema ? quoteSqlLiteral(schema) : null;

  switch (engine) {
    case "mysql":
    case "mariadb":
      // STATISTICS reports NON_UNIQUE; invert it so every engine says "unique".
      return `SELECT INDEX_NAME AS name, COLUMN_NAME AS column_name,
       SEQ_IN_INDEX AS position, (NON_UNIQUE = 0) AS is_unique
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = ${sch ?? db} AND TABLE_NAME = ${tbl}
ORDER BY INDEX_NAME, SEQ_IN_INDEX`;

    case "postgres":
      return `SELECT i.relname AS name, a.attname AS column_name,
       k.ordinality AS position, ix.indisunique AS is_unique
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordinality) ON TRUE
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE t.relname = ${tbl}
  AND ${sch ? `n.nspname = ${sch}` : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
ORDER BY i.relname, k.ordinality`;

    case "mssql":
      return `SELECT i.name AS name, c.name AS column_name,
       ic.key_ordinal AS position, i.is_unique AS is_unique
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE OBJECT_NAME(i.object_id) = ${tbl} AND i.name IS NOT NULL${sch ? `
  AND OBJECT_SCHEMA_NAME(i.object_id) = ${sch}` : ""}
ORDER BY i.name, ic.key_ordinal`;

    case "sqlite":
      // pragma_index_list gives the indexes, pragma_index_info the columns of
      // one — correlated, so the join walks both in a single query. "unique"
      // is a keyword, and seqno is 0-based.
      return `SELECT il.name AS name, ii.name AS column_name,
       ii.seqno + 1 AS position, il."unique" AS is_unique
FROM pragma_index_list(${tbl}) AS il
JOIN pragma_index_info(il.name) AS ii
ORDER BY il.name, ii.seqno`;

    case "oracle":
      return `SELECT ai.INDEX_NAME AS name, aic.COLUMN_NAME AS column_name,
       aic.COLUMN_POSITION AS position,
       CASE WHEN ai.UNIQUENESS = 'UNIQUE' THEN 1 ELSE 0 END AS is_unique
FROM ALL_INDEXES ai
JOIN ALL_IND_COLUMNS aic
  ON aic.INDEX_NAME = ai.INDEX_NAME AND aic.INDEX_OWNER = ai.OWNER
WHERE ai.TABLE_NAME = ${tbl}${sch ? `
  AND ai.TABLE_OWNER = ${sch}` : ""}
ORDER BY ai.INDEX_NAME, aic.COLUMN_POSITION`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}

/**
 * Foreign keys, with the column and table each one points at.
 *
 * `table` is optional: omitting it returns every foreign key in the database,
 * which is what the ER diagram needs — one query rather than one per table.
 * The owning table is always selected, since a whole-schema result is useless
 * without knowing which table each key belongs to.
 */
function buildForeignKeyListQuery(engine, database, table, schema) {
  assertEngine(engine);
  const db = quoteSqlLiteral(database ?? "");
  const tbl = table ? quoteSqlLiteral(table) : null;
  const sch = schema ? quoteSqlLiteral(schema) : null;

  switch (engine) {
    case "mysql":
    case "mariadb":
      // KEY_COLUMN_USAGE holds primary and unique keys too; without the
      // REFERENCED_TABLE_NAME filter every primary key looks like a foreign key.
      return `SELECT CONSTRAINT_NAME AS name, TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
       REFERENCED_TABLE_NAME AS referenced_table,
       REFERENCED_COLUMN_NAME AS referenced_column
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = ${sch ?? db}${tbl ? ` AND TABLE_NAME = ${tbl}` : ""}
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION`;

    case "postgres":
      return `SELECT tc.constraint_name AS name, tc.table_name AS table_name,
       kcu.column_name AS column_name,
       ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ${sch ? `tc.table_schema = ${sch}` : "tc.table_schema NOT IN ('pg_catalog', 'information_schema')"}${tbl ? `
  AND tc.table_name = ${tbl}` : ""}
ORDER BY tc.constraint_name, kcu.ordinal_position`;

    case "mssql":
      return `SELECT fk.name AS name, OBJECT_NAME(fk.parent_object_id) AS table_name,
       pc.name AS column_name,
       OBJECT_NAME(fkc.referenced_object_id) AS referenced_table,
       rc.name AS referenced_column
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
WHERE fk.is_ms_shipped = 0${tbl ? `
  AND OBJECT_NAME(fk.parent_object_id) = ${tbl}` : ""}${sch ? `
  AND OBJECT_SCHEMA_NAME(fk.parent_object_id) = ${sch}` : ""}
ORDER BY fk.name, fkc.constraint_column_id`;

    case "sqlite":
      // SQLite does not name its foreign keys, so one is synthesised from the
      // owning table and the pragma's id — stable, and unique across the
      // database, which is what the caller groups on.
      return `SELECT 'fk_' || m.name || '_' || f.id AS name,
       m.name AS table_name, f."from" AS column_name,
       f."table" AS referenced_table, f."to" AS referenced_column
FROM sqlite_master AS m
JOIN pragma_foreign_key_list(m.name) AS f
WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\'${tbl ? `
  AND m.name = ${tbl}` : ""}
ORDER BY name, f.seq`;

    case "oracle":
      // ALL_CONSTRAINTS records R_CONSTRAINT_NAME rather than the target table,
      // so the referenced side only comes out by joining back through it.
      return `SELECT ac.CONSTRAINT_NAME AS name, ac.TABLE_NAME AS table_name,
       acc.COLUMN_NAME AS column_name,
       rcc.TABLE_NAME AS referenced_table, rcc.COLUMN_NAME AS referenced_column
FROM ALL_CONSTRAINTS ac
JOIN ALL_CONS_COLUMNS acc
  ON acc.CONSTRAINT_NAME = ac.CONSTRAINT_NAME AND acc.OWNER = ac.OWNER
JOIN ALL_CONS_COLUMNS rcc
  ON rcc.CONSTRAINT_NAME = ac.R_CONSTRAINT_NAME AND rcc.POSITION = acc.POSITION
WHERE ac.CONSTRAINT_TYPE = 'R'
  AND ac.OWNER NOT IN ('SYS', 'SYSTEM', 'XDB', 'OUTLN')${tbl ? `
  AND ac.TABLE_NAME = ${tbl}` : ""}${sch ? `
  AND ac.OWNER = ${sch}` : ""}
ORDER BY ac.CONSTRAINT_NAME, acc.POSITION`;

    default:
      throw new Error(`Unsupported engine: ${engine}`);
  }
}


/**
 * Quotes a value as an identifier for engines that need one interpolated.
 * Doubles the engine's own closing delimiter, and only that one.
 */
function quoteSqlIdentifier(engine, name) {
  if (typeof name !== "string" || !name) {
    throw new Error("SQL identifier must be a non-empty string");
  }
  const pairs = { mysql: ["`", "`"], postgres: ['"', '"'], oracle: ['"', '"'], mssql: ["[", "]"] };
  const [open, close] = pairs[engine] ?? ['"', '"'];
  return `${open}${name.split(close).join(close + close)}${close}`;
}

/**
 * Quotes a table as `schema.name`, each part its own identifier.
 *
 * `{ schema: 'public', name: 'users' }` becomes `"public"."users"` — never
 * `"public.users"`, which is a single identifier no server has. Accepts a bare
 * string for the callers that never learned a schema.
 *
 * The renderer has its own copy in domain/db/identifiers.ts; this is the main
 * process side, which cannot import TypeScript.
 */
function quoteQualifiedName(engine, table) {
  if (typeof table === "string") return quoteSqlIdentifier(engine, table);
  if (!table || typeof table.name !== "string") {
    throw new Error("Qualified table must have a name");
  }
  const name = quoteSqlIdentifier(engine, table.name);
  return table.schema ? `${quoteSqlIdentifier(engine, table.schema)}.${name}` : name;
}

/**
 * The server's own CREATE TABLE, where it can produce one.
 *
 * Always preferable to a reconstruction: it is what the server actually has,
 * including defaults, auto-increment, check constraints and collations.
 * Postgres and SQL Server have no equivalent call, so they return null and the
 * caller rebuilds the statement from the catalog instead.
 */
function buildNativeDdlQuery(engine, database, table, schema) {
  assertEngine(engine);
  switch (engine) {
    case "mysql":
    case "mariadb": {
      const name = schema
        ? `${quoteSqlIdentifier("mysql", schema)}.${quoteSqlIdentifier("mysql", table)}`
        : quoteSqlIdentifier("mysql", table);
      return `SHOW CREATE TABLE ${name}`;
    }
    case "oracle":
      // GET_DDL takes the owner as its third argument; without it the call
      // resolves against the session user and fails for anyone else's table.
      return `SELECT DBMS_METADATA.GET_DDL('TABLE', ${quoteSqlLiteral(table)}${
        schema ? `, ${quoteSqlLiteral(schema)}` : ""
      }) AS ddl FROM DUAL`;
    case "sqlite":
      // sqlite_master keeps the original CREATE TABLE text verbatim, which is
      // better than anything a reconstruction could produce.
      return `SELECT sql AS ddl FROM sqlite_master WHERE type = 'table' AND name = ${quoteSqlLiteral(table)}`;
    case "postgres":
    case "mssql":
      return null;
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
  buildIndexListQuery,
  buildForeignKeyListQuery,
  buildNativeDdlQuery,
  quoteSqlIdentifier,
  quoteQualifiedName,
};
