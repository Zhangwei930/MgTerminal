"use strict";

const { createMysqlAdapter } = require("./mysqlAdapter.cjs");
const { createPostgresAdapter } = require("./postgresAdapter.cjs");
const { createMssqlAdapter } = require("./mssqlAdapter.cjs");
const { createOracleAdapter } = require("./oracleAdapter.cjs");
const { createSqliteAdapter } = require("./sqliteAdapter.cjs");

function createAdapter(engine) {
  switch (engine) {
    case "mysql":
    // MariaDB speaks MySQL's wire protocol; mysql2 drives both.
    case "mariadb":
      return createMysqlAdapter();
    case "postgres":
      return createPostgresAdapter();
    case "mssql":
      return createMssqlAdapter();
    case "oracle":
      return createOracleAdapter();
    case "sqlite":
      return createSqliteAdapter();
    default:
      throw new Error(`Unsupported database engine: ${engine}`);
  }
}

module.exports = { createAdapter };
