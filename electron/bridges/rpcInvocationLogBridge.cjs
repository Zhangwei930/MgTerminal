/**
 * RPC Invocation Log Bridge — records every RPC call that arrives over the
 * local TCP bridge from the CLI (`magies-terminal-tool-cli`) or an MCP client
 * (`magies-terminal-mcp-server`, or an External MCP peer).
 *
 * Only method name, outcome, and timing are recorded — never call params,
 * matching the approval-audit precedent (no secrets, no arguments). Log files
 * are JSONL under {userData}/rpc-invocation-logs/rpc-YYYY-MM-DD.log, same
 * rotation/retention shape as crashLogBridge.
 *
 * In-process calls from the in-app AI harness (which reuses the same
 * dispatch function via `dispatchBuiltinRpc`, not the TCP socket handler)
 * are intentionally NOT captured here — those already have their own trace
 * (globalTraceStore) and approval audit.
 */

const fs = require("node:fs");
const path = require("node:path");

let logDir = null;
let electronApp = null;
let electronShell = null;

const LOG_RETENTION_DAYS = 30;

function ensureLogDir() {
  if (logDir) return logDir;

  try {
    const userDataPath = electronApp?.getPath?.("userData");
    if (!userDataPath) return null;

    logDir = path.join(userDataPath, "rpc-invocation-logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    return logDir;
  } catch {
    return null;
  }
}

function todayFileName() {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `rpc-${ymd}.log`;
}

function captureInvocation({ source, method, ok, durationMs, errorCode }) {
  try {
    const dir = ensureLogDir();
    if (!dir) return;

    const entry = {
      timestamp: new Date().toISOString(),
      source,
      method,
      ok: Boolean(ok),
      durationMs: typeof durationMs === "number" ? Math.round(durationMs) : undefined,
      errorCode: errorCode || undefined,
    };
    const filePath = path.join(dir, todayFileName());
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Never throw from the invocation logger itself.
  }
}

function pruneOldLogs() {
  try {
    const dir = ensureLogDir();
    if (!dir) return;

    const cutoff = Date.now() - LOG_RETENTION_DAYS * 86400000;
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (!file.startsWith("rpc-") || !file.endsWith(".log")) continue;
      try {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
}

async function countLines(filePath) {
  return new Promise((resolve) => {
    let count = 0;
    const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
    stream.on("data", (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === "\n") count++;
      }
    });
    stream.on("end", () => resolve(count));
    stream.on("error", () => resolve(0));
  });
}

async function listLogs() {
  const dir = ensureLogDir();
  if (!dir) return [];

  try {
    const files = await fs.promises.readdir(dir);
    const results = [];

    for (const file of files) {
      if (!file.startsWith("rpc-") || !file.endsWith(".log")) continue;
      try {
        const filePath = path.join(dir, file);
        const stat = await fs.promises.stat(filePath);
        const entryCount = await countLines(filePath);
        results.push({
          fileName: file,
          date: file.replace("rpc-", "").replace(".log", ""),
          size: stat.size,
          entryCount,
        });
      } catch {
        // skip unreadable files
      }
    }

    results.sort((a, b) => b.date.localeCompare(a.date));
    return results;
  } catch {
    return [];
  }
}

const MAX_READ_ENTRIES = 500;
const MAX_TAIL_BYTES = 256 * 1024;

async function readLog(fileName) {
  const dir = ensureLogDir();
  if (!dir) return [];

  if (!/^rpc-\d{4}-\d{2}-\d{2}\.log$/.test(fileName)) return [];

  try {
    const filePath = path.join(dir, fileName);
    const stat = await fs.promises.stat(filePath);

    let content;
    if (stat.size > MAX_TAIL_BYTES) {
      const buf = Buffer.alloc(MAX_TAIL_BYTES);
      const fd = await fs.promises.open(filePath, "r");
      try {
        await fd.read(buf, 0, MAX_TAIL_BYTES, stat.size - MAX_TAIL_BYTES);
      } finally {
        await fd.close();
      }
      const raw = buf.toString("utf-8");
      const firstNewline = raw.indexOf("\n");
      content = firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw;
    } else {
      content = await fs.promises.readFile(filePath, "utf-8");
    }

    const lines = content.split("\n").filter(Boolean);
    const tail = lines.slice(-MAX_READ_ENTRIES);
    const entries = [];
    for (const line of tail) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function clearLogs() {
  const dir = ensureLogDir();
  if (!dir) return { deletedCount: 0 };

  let deletedCount = 0;
  try {
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      if (!file.startsWith("rpc-") || !file.endsWith(".log")) continue;
      try {
        await fs.promises.unlink(path.join(dir, file));
        deletedCount++;
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  return { deletedCount };
}

async function openDir() {
  const dir = ensureLogDir();
  if (!dir || !electronShell?.openPath) return { success: false };
  try {
    const errorMessage = await electronShell.openPath(dir);
    return { success: !errorMessage };
  } catch {
    return { success: false };
  }
}

function init(deps) {
  const { electronModule } = deps || {};
  const { app, shell } = electronModule || {};
  electronApp = app;
  electronShell = shell;

  ensureLogDir();
  pruneOldLogs();
}

function registerHandlers(ipcMain) {
  ipcMain.handle("magiesTerminal:rpcInvocationLogs:list", async () => listLogs());
  ipcMain.handle("magiesTerminal:rpcInvocationLogs:read", async (_event, { fileName }) => readLog(fileName));
  ipcMain.handle("magiesTerminal:rpcInvocationLogs:clear", async () => clearLogs());
  ipcMain.handle("magiesTerminal:rpcInvocationLogs:openDir", async () => openDir());
}

function _resetForTest() {
  logDir = null;
  electronApp = null;
  electronShell = null;
}

module.exports = {
  init,
  captureInvocation,
  listLogs,
  readLog,
  clearLogs,
  openDir,
  registerHandlers,
  _resetForTest,
};
