"use strict";

const sql = require("mssql");
const { emitRowBatches } = require("./rowBatching.cjs");
const { resolveSslOptions } = require("./sslOptions.cjs");

/** mssql's column type is a constructor (sql.Int, sql.VarChar, ...); .name gives the type name. */
function mapColumnType(columnType) {
  const name = columnType?.name;
  switch (name) {
    case "TinyInt":
    case "SmallInt":
    case "Int":
    case "BigInt":
    case "Float":
    case "Real":
    case "Numeric":
    case "Decimal":
    case "SmallMoney":
    case "Money":
      return "number";
    case "Bit":
      return "boolean";
    case "Date":
    case "DateTime":
    case "DateTime2":
    case "DateTimeOffset":
    case "SmallDateTime":
    case "Time":
      return "date";
    case "Binary":
    case "VarBinary":
    case "Image":
      return "binary";
    default:
      return "string";
  }
}

function createMssqlAdapter() {
  let pool = null;
  let activeRequest = null;

  return {
    async connect({ host, port, database, username, password, ssl }) {
      pool = new sql.ConnectionPool({
        server: host,
        port,
        database,
        user: username,
        password,
        connectionTimeout: 15000,
        // Every other engine's adapter is a single session, and this one has to
        // behave the same way. With a larger pool a transaction breaks
        // silently: BEGIN TRANSACTION and the statements after it land on
        // different connections, so the work never joins the transaction and
        // COMMIT has nothing to commit. min pins the session open — a pool that
        // shrinks to zero may drop a connection holding an open transaction
        // while the user is still typing the next statement.
        pool: { max: 1, min: 1 },
        options: {
          // Default off: inside an SSH tunnel the transport is already
          // encrypted. A direct connection has no such tunnel, so the profile
          // can ask for TLS and resolveSslOptions overrides both settings —
          // hard-coding encrypt:false is what made a direct dial clear text.
          encrypt: false,
          trustServerCertificate: true,
          ...(resolveSslOptions("mssql", ssl).options ?? {}),
        },
      });
      await pool.connect();
      const result = await pool.request().query("SELECT @@VERSION AS version");
      return { serverVersion: result.recordset?.[0]?.version };
    },

    async query(sql_, { maxRows, onRowBatch }) {
      const request = pool.request();
      activeRequest = request;
      let result;
      try {
        result = await request.query(sql_);
      } finally {
        activeRequest = null;
      }

      const columns = Object.values(result.recordset?.columns ?? {});
      if (columns.length === 0) {
        onRowBatch({ columns: [], rows: [] });
        const affected = Array.isArray(result.rowsAffected) ? result.rowsAffected[0] : undefined;
        return { rowCount: 0, truncated: false, affectedRows: affected };
      }

      const columnDefs = columns.map((c) => ({ name: c.name, type: mapColumnType(c.type) }));
      const rows = result.recordset.map((row) => columnDefs.map((c) => row[c.name]));
      return emitRowBatches(rows, columnDefs, maxRows, onRowBatch);
    },

    async cancel() {
      activeRequest?.cancel();
    },

    async close() {
      if (pool) {
        await pool.close().catch(() => {});
        pool = null;
      }
    },
  };
}

module.exports = { createMssqlAdapter };
