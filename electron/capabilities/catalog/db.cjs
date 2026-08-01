"use strict";

const { CAPABILITY_STATUS } = require("../constants.cjs");

/**
 * Database access over connections the user already opened.
 *
 * The read/write split is deliberate and load-bearing:
 *   - db.query.readonly is policy.write = false, so it never prompts. The
 *     service refuses any statement that is not provably read-only, which is
 *     what stops that unprompted path from carrying a write.
 *   - db.query.write is policy.write = true, so confirm mode requires approval
 *     (with the SQL visible in the prompt) and observer mode blocks it outright.
 *
 * @type {import("../types.cjs").CapabilityDefinition[]}
 */
const DB_CAPABILITIES = [
  {
    id: "db.connections.list",
    domain: "db",
    status: CAPABILITY_STATUS.IMPLEMENTED,
    description:
      "List open database connections (engine, database, host, port). Returns no credentials. " +
      "Connections are opened by the user in the app; this cannot open one.",
    policy: {
      write: false,
      sensitiveRead: false,
      longRunning: false,
      requiresChatSession: false,
      bypassesObserverBlock: false,
      bypassesApproval: true,
      bypassesChatCancel: true,
    },
    surfaces: {
      public: { rpcMethod: "public/db/connections/list", mcpTool: "db_connections_list" },
      global: { rpcMethod: "db/connections/list" },
      cli: { command: ["db", "connections", "list"] },
    },
  },
  {
    id: "db.query.readonly",
    domain: "db",
    status: CAPABILITY_STATUS.IMPLEMENTED,
    description:
      "Run a read-only SQL statement (SELECT/SHOW/EXPLAIN/DESCRIBE) on an open connection. " +
      "Statements that modify data or schema are refused — use db_query_write for those. " +
      "Results are capped and may be truncated.",
    policy: {
      write: false,
      // Query results can contain real records, so this is a sensitive read
      // even though it changes nothing.
      sensitiveRead: true,
      longRunning: false,
      requiresChatSession: false,
      bypassesObserverBlock: false,
      bypassesApproval: true,
      bypassesChatCancel: false,
    },
    surfaces: {
      public: { rpcMethod: "public/db/query/readonly", mcpTool: "db_query_readonly" },
      global: { rpcMethod: "db/query/readonly" },
      cli: { command: ["db", "query", "readonly"] },
    },
  },
  {
    id: "db.query.write",
    domain: "db",
    status: CAPABILITY_STATUS.IMPLEMENTED,
    description:
      "Run a data- or schema-modifying SQL statement (INSERT/UPDATE/DELETE/DDL) on an open " +
      "connection. Always requires user approval, which shows the full statement.",
    policy: {
      // Drives the whole guarantee: confirm mode prompts with the SQL in view,
      // observer mode refuses, and the dispatcher writes an approval audit
      // entry either way.
      write: true,
      sensitiveRead: false,
      longRunning: false,
      requiresChatSession: true,
      bypassesObserverBlock: false,
      bypassesApproval: false,
      bypassesChatCancel: false,
    },
    surfaces: {
      public: { rpcMethod: "public/db/query/write", mcpTool: "db_query_write" },
      global: { rpcMethod: "db/query/write" },
      cli: { command: ["db", "query", "write"] },
    },
  },
];

module.exports = {
  DB_CAPABILITIES,
};
