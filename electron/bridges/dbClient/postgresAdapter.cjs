"use strict";

const { Client, types } = require("pg");
const { emitRowBatches } = require("./rowBatching.cjs");

const NUMBER_OIDS = new Set([
  types.builtins.INT2, types.builtins.INT4, types.builtins.INT8,
  types.builtins.FLOAT4, types.builtins.FLOAT8, types.builtins.NUMERIC,
  types.builtins.OID,
]);
const DATE_OIDS = new Set([
  types.builtins.DATE, types.builtins.TIME, types.builtins.TIMETZ,
  types.builtins.TIMESTAMP, types.builtins.TIMESTAMPTZ,
]);
const BINARY_OIDS = new Set([types.builtins.BYTEA]);
const JSON_OIDS = new Set([types.builtins.JSON, types.builtins.JSONB]);
const BOOL_OIDS = new Set([types.builtins.BOOL]);

/** Postgres' OID column-type codes, mapped to this app's DbColumnType union. */
function mapColumnType(dataTypeId) {
  if (BOOL_OIDS.has(dataTypeId)) return "boolean";
  if (NUMBER_OIDS.has(dataTypeId)) return "number";
  if (DATE_OIDS.has(dataTypeId)) return "date";
  if (BINARY_OIDS.has(dataTypeId)) return "binary";
  if (JSON_OIDS.has(dataTypeId)) return "json";
  return "string";
}

function createPostgresAdapter() {
  let client = null;

  return {
    async connect({ host, port, database, username, password }) {
      client = new Client({
        host,
        port,
        database,
        user: username,
        password,
        connectionTimeoutMillis: 15000,
      });
      await client.connect();
      const result = await client.query("SELECT version() AS version");
      return { serverVersion: result.rows?.[0]?.version };
    },

    async query(sql, { maxRows, onRowBatch }) {
      const result = await client.query(sql);
      const isSelectLike = Array.isArray(result.fields) && result.fields.length > 0;
      if (!isSelectLike) {
        onRowBatch({ columns: [], rows: [] });
        return { rowCount: 0, truncated: false, affectedRows: result.rowCount ?? 0 };
      }

      const columns = result.fields.map((f) => ({ name: f.name, type: mapColumnType(f.dataTypeID) }));
      const rows = result.rows.map((row) => columns.map((c) => row[c.name]));
      return emitRowBatches(rows, columns, maxRows, onRowBatch);
    },

    async cancel() {
      // pg's Client has no first-class query-cancel API; ending the connection
      // is a blunt but reliable way to make Postgres abort the in-flight query.
      await this.close();
    },

    async close() {
      if (client) {
        await client.end().catch(() => {});
        client = null;
      }
    },
  };
}

module.exports = { createPostgresAdapter };
