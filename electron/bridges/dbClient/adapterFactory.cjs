"use strict";

const { createMysqlAdapter } = require("./mysqlAdapter.cjs");
const { createPostgresAdapter } = require("./postgresAdapter.cjs");
const { createMssqlAdapter } = require("./mssqlAdapter.cjs");
const { createOracleAdapter } = require("./oracleAdapter.cjs");

function createAdapter(engine) {
  switch (engine) {
    case "mysql":
      return createMysqlAdapter();
    case "postgres":
      return createPostgresAdapter();
    case "mssql":
      return createMssqlAdapter();
    case "oracle":
      return createOracleAdapter();
    default:
      throw new Error(`Unsupported database engine: ${engine}`);
  }
}

module.exports = { createAdapter };
