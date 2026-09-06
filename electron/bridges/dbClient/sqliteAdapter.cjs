"use strict";

const { emitRowBatches } = require("./rowBatching.cjs");

/**
 * SQLite, through Node's built-in `node:sqlite`.
 *
 * No new dependency and nothing to compile: Electron's Node has the module
 * (verified on Electron 42 / Node 24). It is still marked experimental
 * upstream, so the require is guarded and reports what is missing rather than
 * crashing the bridge on a build that does not carry it.
 *
 * This adapter differs from the others in one structural way: SQLite is a file
 * on this machine, not a server. There is no host, port, user or password, and
 * nothing to tunnel — `host` carries the file path.
 */

function loadSqlite() {
  try {
    // eslint-disable-next-line global-require
    return require("node:sqlite");
  } catch (err) {
    throw new Error(
      `SQLite support is not available in this build (${err?.message || err}).`,
    );
  }
}

/** SQLite's declared types are free text; this maps the usual ones. */
function mapColumnType(declared) {
  const type = String(declared || "").toUpperCase();
  if (type.includes("INT")) return "number";
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) return "number";
  if (type.includes("NUM") || type.includes("DEC")) return "number";
  if (type.includes("BLOB")) return "binary";
  if (type.includes("BOOL")) return "boolean";
  if (type.includes("DATE") || type.includes("TIME")) return "date";
  if (type.includes("JSON")) return "json";
  return "string";
}

function createSqliteAdapter() {
  let db = null;

  return {
    async connect({ host }) {
      const { DatabaseSync } = loadSqlite();
      const file = String(host || "").trim();
      if (!file) throw new Error("SQLite needs a database file path.");

      // Not created on connect: a typo in the path would otherwise silently
      // produce an empty database rather than saying the file is not there.
      db = new DatabaseSync(file, { open: true, readOnly: false });
      const [{ version } = {}] = db.prepare("SELECT sqlite_version() AS version").all();
      return { serverVersion: version ? `SQLite ${version}` : "SQLite" };
    },

    async query(sql, { maxRows, onRowBatch }) {
      const statement = db.prepare(sql);

      // node:sqlite decides by statement: .all() on one that returns no rows
      // throws, and .run() on a SELECT discards them. `returns` is how it says
      // which this is.
      const isSelect = typeof statement.columns === "function" && statement.columns().length > 0;

      if (!isSelect) {
        const info = statement.run();
        onRowBatch({ columns: [], rows: [] });
        return { rowCount: 0, truncated: false, affectedRows: Number(info?.changes ?? 0) };
      }

      const columns = statement.columns().map((column) => ({
        name: column.name,
        type: mapColumnType(column.type ?? column.declaredType),
      }));
      // Rows come back as objects keyed by column name; the grid is row-major.
      statement.setReadBigInts(false);
      const rows = statement.all().map((row) => columns.map((column) => row[column.name]));
      return emitRowBatches(rows, columns, maxRows, onRowBatch);
    },

    async cancel() {
      // node:sqlite is synchronous: by the time anything could cancel, the
      // statement has already finished. Nothing to interrupt.
    },

    async close() {
      try { db?.close(); } finally { db = null; }
    },
  };
}

module.exports = { createSqliteAdapter, mapColumnType };
