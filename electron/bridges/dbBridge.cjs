"use strict";

const { getFreeLocalPort } = require("./freePortPicker.cjs");

const DEFAULT_MAX_ROWS = 10_000;

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
    dbConnections.set(connectionId, { adapter, tunnelId });
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
  cancelQuery,
  stopAllDbConnections,
};
