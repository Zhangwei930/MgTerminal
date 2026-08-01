"use strict";

const { getFreeLocalPort } = require("./freePortPicker.cjs");

const DEFAULT_MAX_ROWS = 10_000;

/**
 * Ceilings for the non-streaming queryOnce path. The streaming query() feeds a
 * virtualised grid, so 10k rows is fine there. queryOnce buffers everything in
 * memory and hands it to a capability caller — typically an AI agent, where the
 * rows also become context — so it gets much tighter limits that a caller
 * cannot raise.
 */
const QUERY_ONCE_DEFAULT_ROWS = 200;
const QUERY_ONCE_MAX_ROWS = 1_000;
const QUERY_ONCE_DEFAULT_TIMEOUT_MS = 30_000;

let portForwardingBridge = require("./portForwardingBridge.cjs");
let createAdapter = require("./dbClient/adapterFactory.cjs").createAdapter;

/** connectionId -> { adapter, tunnelId } */
const dbConnections = new Map();

function withTrustedSender(event) {
  const sender = event.sender;
  return {
    send(channel, payload) {
      if (!sender.isDestroyed()) sender.send(channel, payload);
    },
  };
}

async function connect(event, payload) {
  const {
    connectionId, engine, sshOptions = {}, remoteHost, remotePort, database, dbUsername, dbPassword,
  } = payload;

  const tunnelId = `db-${connectionId}`;
  const localPort = await getFreeLocalPort();

  const forwardResult = await portForwardingBridge.startPortForward(event, {
    ...sshOptions,
    type: "local",
    tunnelId,
    ruleId: tunnelId,
    localPort,
    bindAddress: "127.0.0.1",
    remoteHost,
    remotePort,
  });
  if (!forwardResult?.success) {
    throw new Error(forwardResult?.error || "Failed to establish SSH tunnel");
  }

  const adapter = createAdapter(engine);
  try {
    const { serverVersion } = await adapter.connect({
      host: "127.0.0.1",
      port: localPort,
      database,
      username: dbUsername,
      password: dbPassword,
    });
    // Descriptive fields only — never dbUsername/dbPassword/sshOptions, since
    // listConnections() exposes this record to capability callers.
    dbConnections.set(connectionId, {
      adapter,
      tunnelId,
      engine,
      database,
      remoteHost,
      remotePort,
      serverVersion,
      connectedAt: Date.now(),
    });
    return { connectionId, success: true, serverVersion };
  } catch (err) {
    await portForwardingBridge.stopPortForward(event, { tunnelId }).catch(() => {});
    throw err;
  }
}

async function closeConnection(event, { connectionId }) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { connectionId, success: false, error: "Connection not found" };

  dbConnections.delete(connectionId);
  await entry.adapter.close().catch(() => {});
  await portForwardingBridge.stopPortForward(event, { tunnelId: entry.tunnelId }).catch(() => {});
  return { connectionId, success: true };
}

/** Returns {queryId} immediately; rows/completion/error stream via IPC events. */
function query(event, payload) {
  const { connectionId, queryId, sql, maxRows = DEFAULT_MAX_ROWS } = payload;
  const entry = dbConnections.get(connectionId);
  const sender = withTrustedSender(event);

  if (!entry) {
    sender.send("magiesTerminal:db:query:error", { queryId, error: "Connection not found" });
    return { queryId };
  }

  const startedAt = Date.now();
  entry.adapter
    .query(sql, {
      maxRows,
      onRowBatch: (batch) => sender.send("magiesTerminal:db:query:rows", { queryId, ...batch }),
    })
    .then((result) => {
      sender.send("magiesTerminal:db:query:complete", {
        queryId,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    })
    .catch((err) => {
      sender.send("magiesTerminal:db:query:error", { queryId, error: err?.message || String(err) });
    });

  return { queryId };
}

/**
 * Request/response counterpart to query(). Buffers every row batch and resolves
 * with the complete result, so callers without a BrowserWindow sender — MCP
 * over TCP, the CLI over RPC — can use the DB client at all.
 *
 * Takes no `event`: depending on a sender is exactly what makes query()
 * unusable from those surfaces.
 */
async function queryOnce({ connectionId, sql, maxRows, timeoutMs } = {}) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { connectionId, success: false, error: "Connection not found" };

  const effectiveMaxRows = Math.min(
    Number.isFinite(maxRows) && maxRows > 0 ? Math.floor(maxRows) : QUERY_ONCE_DEFAULT_ROWS,
    QUERY_ONCE_MAX_ROWS,
  );
  const effectiveTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : QUERY_ONCE_DEFAULT_TIMEOUT_MS;

  const startedAt = Date.now();
  const rows = [];
  let columns = null;

  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      // Cancel rather than just abandoning it — an orphaned long query keeps
      // holding server-side resources after the caller has given up.
      entry.adapter.cancel().catch(() => {});
      reject(new Error(`Query timed out after ${effectiveTimeout}ms`));
    }, effectiveTimeout);
  });

  try {
    const result = await Promise.race([
      entry.adapter.query(sql, {
        maxRows: effectiveMaxRows,
        onRowBatch: (batch) => {
          if (batch?.columns && !columns) columns = batch.columns;
          if (Array.isArray(batch?.rows)) rows.push(...batch.rows);
        },
      }),
      timeout,
    ]);

    return {
      connectionId,
      success: true,
      columns: columns || [],
      rows,
      rowCount: result?.rowCount ?? rows.length,
      truncated: Boolean(result?.truncated),
      affectedRows: result?.affectedRows,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      connectionId,
      success: false,
      error: err?.message || String(err),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Live connections, described without any credential material. */
function listConnections() {
  return Array.from(dbConnections.entries()).map(([connectionId, entry]) => ({
    connectionId,
    engine: entry.engine,
    database: entry.database,
    remoteHost: entry.remoteHost,
    remotePort: entry.remotePort,
    serverVersion: entry.serverVersion,
    connectedAt: entry.connectedAt,
  }));
}

async function cancelQuery(_event, { connectionId }) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { connectionId, success: false, error: "Connection not found" };
  await entry.adapter.cancel().catch(() => {});
  return { connectionId, success: true };
}

async function stopAllDbConnections() {
  const entries = Array.from(dbConnections.entries());
  dbConnections.clear();
  const fakeEvent = { sender: { isDestroyed: () => true, id: -1 } };
  await Promise.all(
    entries.map(async ([, entry]) => {
      await entry.adapter.close().catch(() => {});
      await portForwardingBridge.stopPortForward(fakeEvent, { tunnelId: entry.tunnelId }).catch(() => {});
    }),
  );
}

function registerHandlers(ipcMain, deps = {}) {
  portForwardingBridge = deps.portForwardingBridge ?? portForwardingBridge;
  createAdapter = deps.createAdapter ?? createAdapter;

  ipcMain.handle("magiesTerminal:db:connect", connect);
  ipcMain.handle("magiesTerminal:db:close", closeConnection);
  ipcMain.handle("magiesTerminal:db:query", query);
  ipcMain.handle("magiesTerminal:db:cancel", cancelQuery);
  ipcMain.handle("magiesTerminal:db:stopAll", () => stopAllDbConnections());
}

module.exports = {
  registerHandlers,
  connect,
  closeConnection,
  query,
  // Not registered as an IPC handler: the renderer already has the streaming
  // query(). These exist for in-process capability services, so exposing them
  // over IPC would only widen the surface.
  queryOnce,
  listConnections,
  cancelQuery,
  stopAllDbConnections,
  QUERY_ONCE_DEFAULT_ROWS,
  QUERY_ONCE_MAX_ROWS,
  QUERY_ONCE_DEFAULT_TIMEOUT_MS,
};
