"use strict";

const { getFreeLocalPort } = require("./freePortPicker.cjs");
const {
  buildTableListQuery,
  buildColumnListQuery,
  buildPrimaryKeyQuery,
  buildRoutineListQuery,
  buildTriggerListQuery,
} = require("./dbClient/schemaQueries.cjs");

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
let dialog = null;
let fsPromises = null;
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

/**
 * Opens a database connection, tunnelling through SSH only when a saved host
 * is given. An empty `hostId` means the database is reachable from this
 * machine directly — local, on the LAN, or a cloud endpoint — and no SSH leg
 * is involved at all.
 */
async function connect(event, payload) {
  const {
    connectionId, engine, sshOptions = {}, remoteHost, remotePort, database, dbUsername, dbPassword,
    hostId,
  } = payload;

  const useTunnel = Boolean(hostId);
  let tunnelId = null;
  let dialHost = remoteHost;
  let dialPort = remotePort;

  if (useTunnel) {
    tunnelId = `db-${connectionId}`;
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
    // The driver dials the local end of the tunnel, not the database directly.
    dialHost = "127.0.0.1";
    dialPort = localPort;
  }

  const adapter = createAdapter(engine);
  try {
    const { serverVersion } = await adapter.connect({
      host: dialHost,
      port: dialPort,
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
    if (tunnelId) await portForwardingBridge.stopPortForward(event, { tunnelId }).catch(() => {});
    throw err;
  }
}

async function closeConnection(event, { connectionId }) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { connectionId, success: false, error: "Connection not found" };

  dbConnections.delete(connectionId);
  await entry.adapter.close().catch(() => {});
  if (entry.tunnelId) {
    await portForwardingBridge.stopPortForward(event, { tunnelId: entry.tunnelId }).catch(() => {});
  }
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


/**
 * Schema introspection. The queries live in dbClient/schemaQueries.cjs, one per
 * engine; this layer runs them through the ordinary query path and normalises
 * the four catalogs' vocabularies into one shape.
 */

/** Maps a result row array onto the column names the query aliased. */
function rowsToObjects(columns, rows) {
  const names = (columns || []).map((c) => String(c?.name ?? "").toLowerCase());
  return (rows || []).map((row) => {
    const out = {};
    names.forEach((name, i) => { out[name] = row[i]; });
    return out;
  });
}

/**
 * Normalises nullability across catalogs: MySQL/Postgres/SQL Server say
 * 'YES'/'NO', Oracle says 'Y'/'N'. Anything not recognised as nullable is
 * treated as NOT NULL — the conservative reading for a schema display.
 */
function parseNullable(value) {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "YES" || v === "Y";
}

async function runSchemaQuery(connectionId, sql) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { success: false, error: "Connection not found" };

  const result = await queryOnce({ connectionId, sql, maxRows: QUERY_ONCE_MAX_ROWS });
  if (!result.success) return { success: false, error: result.error };
  return { success: true, rows: rowsToObjects(result.columns, result.rows) };
}

/** Tables and views in the connected database, each tagged 'table' | 'view'. */
async function listTables({ connectionId } = {}) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { success: false, error: "Connection not found" };

  const sql = buildTableListQuery(entry.engine, entry.database ?? "");
  const out = await runSchemaQuery(connectionId, sql);
  if (!out.success) return out;

  return {
    success: true,
    tables: out.rows.map((r) => ({
      name: String(r.name ?? ""),
      kind: String(r.kind ?? "table").toLowerCase() === "view" ? "view" : "table",
    })),
  };
}

/** Columns of one table, in declaration order. */
async function listColumns({ connectionId, table } = {}) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { success: false, error: "Connection not found" };
  if (!table) return { success: false, error: "table is required" };

  const sql = buildColumnListQuery(entry.engine, entry.database ?? "", table);
  const out = await runSchemaQuery(connectionId, sql);
  if (!out.success) return out;

  return {
    success: true,
    columns: out.rows.map((r) => ({
      name: String(r.name ?? ""),
      dataType: String(r.data_type ?? ""),
      nullable: parseNullable(r.is_nullable),
      position: Number(r.position ?? 0),
    })),
  };
}

/**
 * The primary key columns of one table, in key order. An empty list means the
 * table has no primary key — the grid uses that to decide whether a row can be
 * edited at all, since without one there is no WHERE that hits exactly one row.
 */
async function listPrimaryKey({ connectionId, table } = {}) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { success: false, error: "Connection not found" };
  if (!table) return { success: false, error: "table is required" };

  const sql = buildPrimaryKeyQuery(entry.engine, entry.database ?? "", table);
  const out = await runSchemaQuery(connectionId, sql);
  if (!out.success) return out;

  return {
    success: true,
    columns: out.rows.map((r) => String(r.name ?? "")).filter(Boolean),
  };
}

/** Stored procedures and functions, each tagged 'procedure' | 'function'. */
async function listRoutines({ connectionId } = {}) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { success: false, error: "Connection not found" };

  const sql = buildRoutineListQuery(entry.engine, entry.database ?? "");
  const out = await runSchemaQuery(connectionId, sql);
  if (!out.success) return out;

  return {
    success: true,
    routines: out.rows.map((r) => ({
      name: String(r.name ?? ""),
      // Anything callable that is not a procedure is shown as a function —
      // catalogs carry kinds like 'aggregate' that the tree has no node for.
      kind: String(r.kind ?? "").toLowerCase() === "procedure" ? "procedure" : "function",
    })),
  };
}

/** Triggers, with the table each one is attached to. */
async function listTriggers({ connectionId } = {}) {
  const entry = dbConnections.get(connectionId);
  if (!entry) return { success: false, error: "Connection not found" };

  const sql = buildTriggerListQuery(entry.engine, entry.database ?? "");
  const out = await runSchemaQuery(connectionId, sql);
  if (!out.success) return out;

  return {
    success: true,
    triggers: out.rows.map((r) => ({
      name: String(r.name ?? ""),
      table: String(r.table_name ?? ""),
    })),
  };
}

const EXPORT_FILTERS = {
  csv: [{ name: "CSV", extensions: ["csv"] }],
  json: [{ name: "JSON", extensions: ["json"] }],
};

/**
 * Writes an already-serialised result set to a file the user picks.
 *
 * Serialisation stays in the renderer (domain/db/resultExport) — this only owns
 * the dialog and the write, which are the parts that need main-process access.
 */
async function exportResult(_event, { content, defaultFileName, format } = {}) {
  const chooser = dialog ?? require("electron").dialog;
  const fs = fsPromises ?? require("node:fs/promises");

  const choice = await chooser.showSaveDialog({
    defaultPath: defaultFileName,
    filters: [
      ...(EXPORT_FILTERS[format] ?? []),
      { name: "All Files", extensions: ["*"] },
    ],
  });
  // Cancelling is a choice, not a failure — reporting an error here would put
  // a red banner in front of someone who simply changed their mind.
  if (choice.canceled || !choice.filePath) return { success: false, canceled: true };

  try {
    await fs.writeFile(choice.filePath, content);
    return { success: true, filePath: choice.filePath };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
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
      if (entry.tunnelId) {
        await portForwardingBridge.stopPortForward(fakeEvent, { tunnelId: entry.tunnelId }).catch(() => {});
      }
    }),
  );
}

function registerHandlers(ipcMain, deps = {}) {
  portForwardingBridge = deps.portForwardingBridge ?? portForwardingBridge;
  createAdapter = deps.createAdapter ?? createAdapter;
  dialog = deps.dialog ?? dialog;
  fsPromises = deps.fs ?? fsPromises;

  ipcMain.handle("magiesTerminal:db:connect", connect);
  ipcMain.handle("magiesTerminal:db:close", closeConnection);
  ipcMain.handle("magiesTerminal:db:query", query);
  ipcMain.handle("magiesTerminal:db:cancel", cancelQuery);
  // Unlike queryOnce, these are for the renderer's schema tree, so they need a
  // channel. Both take a payload only — the event is dropped deliberately.
  ipcMain.handle("magiesTerminal:db:listTables", (_event, payload) => listTables(payload));
  ipcMain.handle("magiesTerminal:db:listColumns", (_event, payload) => listColumns(payload));
  ipcMain.handle("magiesTerminal:db:listPrimaryKey", (_event, payload) => listPrimaryKey(payload));
  ipcMain.handle("magiesTerminal:db:listRoutines", (_event, payload) => listRoutines(payload));
  ipcMain.handle("magiesTerminal:db:listTriggers", (_event, payload) => listTriggers(payload));
  ipcMain.handle("magiesTerminal:db:exportResult", exportResult);
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
  // These two *are* registered — the schema tree lives in the renderer.
  listTables,
  listColumns,
  listPrimaryKey,
  listRoutines,
  listTriggers,
  exportResult,
  cancelQuery,
  stopAllDbConnections,
  QUERY_ONCE_DEFAULT_ROWS,
  QUERY_ONCE_MAX_ROWS,
  QUERY_ONCE_DEFAULT_TIMEOUT_MS,
};
