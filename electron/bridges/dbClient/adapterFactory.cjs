"use strict";

const { createMysqlAdapter } = require("./mysqlAdapter.cjs");
const { createPostgresAdapter } = require("./postgresAdapter.cjs");

function createAdapter(engine) {
  switch (engine) {
    case "mysql":
      return createMysqlAdapter();
    case "postgres":
      return createPostgresAdapter();
    default:
      throw new Error(`Unsupported database engine: ${engine}`);
  }
}

module.exports = { createAdapter };
