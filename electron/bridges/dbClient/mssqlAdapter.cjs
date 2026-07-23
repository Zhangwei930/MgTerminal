"use strict";

const sql = require("mssql");
const { emitRowBatches } = require("./rowBatching.cjs");

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
    async connect({ host, port, database, username, password }) {
      pool = new sql.ConnectionPool({
        server: host,
        port,
        database,
        user: username,
        password,
        connectionTimeout: 15000,
        options: {
          // Traffic already runs inside the SSH tunnel — skip TLS entirely
          // rather than fight a self-signed/absent cert on a plain IP target.
          encrypt: false,
          trustServerCertificate: true,
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
