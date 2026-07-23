"use strict";

const mysql = require("mysql2/promise");
const { emitRowBatches } = require("./rowBatching.cjs");

/** MySQL's numeric column-type codes, mapped to this app's DbColumnType union. */
function mapColumnType(fieldType) {
  // mysql2's Types map is bidirectional: Types[<numeric code>] gives the name.
  const name = mysql.Types[fieldType];
  switch (name) {
    case "TINY":
    case "SHORT":
    case "LONG":
    case "INT24":
    case "LONGLONG":
    case "DECIMAL":
    case "NEWDECIMAL":
    case "FLOAT":
    case "DOUBLE":
    case "YEAR":
      return "number";
    case "DATE":
    case "DATETIME":
    case "TIMESTAMP":
    case "NEWDATE":
      return "date";
    case "BLOB":
    case "TINY_BLOB":
    case "MEDIUM_BLOB":
    case "LONG_BLOB":
    case "GEOMETRY":
      return "binary";
    case "JSON":
      return "json";
    case "NULL":
      return "null";
    default:
      return "string";
  }
}

function createMysqlAdapter() {
  let connection = null;

  return {
    async connect({ host, port, database, username, password }) {
      connection = await mysql.createConnection({
        host,
        port,
        database,
        user: username,
        password,
        connectTimeout: 15000,
      });
      const [rows] = await connection.query("SELECT VERSION() AS version");
      return { serverVersion: rows?.[0]?.version };
    },

    async query(sql, { maxRows, onRowBatch }) {
      const [result, fields] = await connection.query(sql);
      if (!Array.isArray(result)) {
        // INSERT/UPDATE/DELETE — a ResultSetHeader, not a row set.
        onRowBatch({ columns: [], rows: [] });
        return { rowCount: 0, truncated: false, affectedRows: result.affectedRows };
      }

      const columns = (fields || []).map((f) => ({ name: f.name, type: mapColumnType(f.type) }));
      const rows = result.map((row) => columns.map((c) => row[c.name]));
      return emitRowBatches(rows, columns, maxRows, onRowBatch);
    },

    async cancel() {
      if (!connection?.threadId) return;
      // mysql2 can't run KILL QUERY on the same connection that's blocked
      // executing the query — a short-lived second connection is required.
      const killer = await mysql.createConnection({
        host: connection.config.host,
        port: connection.config.port,
        user: connection.config.user,
        password: connection.config.password,
        connectTimeout: 5000,
      });
      try {
        await killer.query(`KILL QUERY ${connection.threadId}`);
      } finally {
        await killer.end().catch(() => {});
      }
    },

    async close() {
      if (connection) {
        await connection.end().catch(() => {});
        connection = null;
      }
    },
  };
}

module.exports = { createMysqlAdapter };
