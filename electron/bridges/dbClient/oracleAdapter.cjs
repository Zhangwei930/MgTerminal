"use strict";

// Deliberately thin-mode only (the node-oracledb default since v6) — no
// initOracleClient() call, so no Oracle Instant Client dependency and no
// native-addon packaging concerns. See electron-builder.config.cjs for the
// matching exclusion of the unused thick-mode native binaries.
const oracledb = require("oracledb");
const { emitRowBatches } = require("./rowBatching.cjs");

/** oracledb's column dbType is a DbType object; compare by reference against the DB_TYPE_* constants. */
function mapColumnType(dbType) {
  switch (dbType) {
    case oracledb.DB_TYPE_NUMBER:
    case oracledb.DB_TYPE_BINARY_INTEGER:
    case oracledb.DB_TYPE_BINARY_FLOAT:
    case oracledb.DB_TYPE_BINARY_DOUBLE:
      return "number";
    case oracledb.DB_TYPE_DATE:
    case oracledb.DB_TYPE_TIMESTAMP:
    case oracledb.DB_TYPE_TIMESTAMP_TZ:
    case oracledb.DB_TYPE_TIMESTAMP_LTZ:
      return "date";
    case oracledb.DB_TYPE_BLOB:
    case oracledb.DB_TYPE_RAW:
    case oracledb.DB_TYPE_LONG_RAW:
      return "binary";
    case oracledb.DB_TYPE_JSON:
      return "json";
    default:
      return "string";
  }
}

function createOracleAdapter() {
  let connection = null;

  return {
    async connect({ host, port, database, username, password }) {
      connection = await oracledb.getConnection({
        user: username,
        password,
        connectString: `${host}:${port}/${database ?? ""}`,
      });
      const result = await connection.execute(
        "SELECT banner AS version FROM v$version WHERE ROWNUM = 1",
      );
      return { serverVersion: result.rows?.[0]?.[0] };
    },

    async query(sqlText, { maxRows, onRowBatch }) {
      const result = await connection.execute(sqlText);
      const metaData = result.metaData;
      if (!metaData) {
        onRowBatch({ columns: [], rows: [] });
        return { rowCount: 0, truncated: false, affectedRows: result.rowsAffected ?? 0 };
      }

      const columns = metaData.map((m) => ({ name: m.name, type: mapColumnType(m.dbType) }));
      return emitRowBatches(result.rows ?? [], columns, maxRows, onRowBatch);
    },

    async cancel() {
      await connection?.break().catch(() => {});
    },

    async close() {
      if (connection) {
        await connection.close().catch(() => {});
        connection = null;
      }
    },
  };
}

module.exports = { createOracleAdapter };
