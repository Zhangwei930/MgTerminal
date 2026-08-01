"use strict";

/**
 * Database domain service for MCP / public RPC.
 *
 * Runs statements against connections the *user* already opened — connect()
 * needs SSH and DB credentials that live in the renderer, so an agent can use a
 * connection but never open one.
 *
 * The read/write split is the whole point of this file. db.query.readonly has
 * policy.write = false and therefore never raises an approval, so it must
 * refuse anything that is not provably read-only; otherwise an agent could push
 * a DELETE through the unprompted path. db.query.write carries policy.write =
 * true, which makes the dispatcher require confirm-mode approval and record an
 * audit entry before the statement ever reaches this service.
 */

const { isReadOnlyStatement } = require("../../../lib/sqlStatementKind.cjs");

const WRITE_TOOL_NAME = "db_query_write";

function createDbService(ctx = {}) {
  const dbBridge = ctx.dbBridge || require("../../bridges/dbBridge.cjs");

  function requireQueryParams(params) {
    const connectionId = typeof params?.connectionId === "string" ? params.connectionId.trim() : "";
    if (!connectionId) {
      return { ok: false, error: "connectionId is required (use db_connections_list to find one)." };
    }
    const sql = typeof params?.sql === "string" ? params.sql.trim() : "";
    if (!sql) {
      return { ok: false, error: "sql is required." };
    }
    return { ok: true, connectionId, sql };
  }

  async function run({ connectionId, sql, maxRows }) {
    const result = await dbBridge.queryOnce({ connectionId, sql, maxRows });
    if (!result || result.success === false) {
      return { ok: false, error: result?.error || "Query failed" };
    }
    return {
      ok: true,
      columns: result.columns || [],
      rows: result.rows || [],
      rowCount: result.rowCount,
      truncated: Boolean(result.truncated),
      affectedRows: result.affectedRows,
      durationMs: result.durationMs,
    };
  }

  return {
    async listConnections() {
      return { ok: true, connections: dbBridge.listConnections() };
    },

    async queryReadonly(params = {}) {
      const parsed = requireQueryParams(params);
      if (!parsed.ok) return parsed;

      if (!isReadOnlyStatement(parsed.sql)) {
        // Refuse before touching the database: this path is unprompted, so a
        // write reaching it would bypass approval entirely.
        return {
          ok: false,
          error:
            "This statement is not read-only. Use " + WRITE_TOOL_NAME +
            " instead — it asks the user for approval before running.",
        };
      }

      return run({ ...parsed, maxRows: params.maxRows });
    },

    async queryWrite(params = {}) {
      const parsed = requireQueryParams(params);
      if (!parsed.ok) return parsed;
      // No classification here on purpose: reaching this method means the
      // dispatcher already obtained approval, and reads are harmless.
      return run({ ...parsed, maxRows: params.maxRows });
    },
  };
}

module.exports = {
  createDbService,
  WRITE_TOOL_NAME,
};
