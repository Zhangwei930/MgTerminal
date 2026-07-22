// Host Health Bridge — user-triggered batch health snapshot across saved
// hosts: reachability + latency, auth validity, and a lightweight CPU/mem/
// disk snapshot. Opens short-lived probe connections (no shell, no session
// registration) with limited concurrency.

const dns = require("node:dns");
const net = require("node:net");
const { randomUUID } = require("node:crypto");

const { runHealthChecksWithDeps } = require("./hostHealth/runHealthChecks.cjs");
const {
  HEALTH_SNAPSHOT_SCRIPT,
  parseHealthSnapshot,
  summarizeHealthStatus,
  describeFailedProbe,
} = require("./hostHealth/healthCore.cjs");
const { resolveProbeTarget } = require("./connectionDiagnostics/diagnosticsCore.cjs");
const {
  connectTargetProbe,
  probeTcpForRun,
  cancelRun,
} = require("./connectionDiagnosticsBridge.cjs");

const HEALTH_EXEC_TIMEOUT_MS = 15000;
const HEALTH_CONCURRENCY = 3;

// runId -> cancellation flag (socket/conn teardown reuses the diagnostics
// bridge's per-run cleanup registry via the shared probe helpers).
const cancelledRuns = new Set();

const execSnapshot = (conn) => new Promise((resolve) => {
  const timeoutId = setTimeout(() => resolve(""), HEALTH_EXEC_TIMEOUT_MS);
  try {
    conn.exec(HEALTH_SNAPSHOT_SCRIPT, (err, stream) => {
      if (err) {
        clearTimeout(timeoutId);
        resolve("");
        return;
      }
      let stdout = "";
      stream.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
      stream.stderr?.on?.("data", () => {});
      stream.on("close", () => {
        clearTimeout(timeoutId);
        resolve(stdout);
      });
      stream.on("error", () => {
        clearTimeout(timeoutId);
        resolve(stdout);
      });
    });
  } catch {
    clearTimeout(timeoutId);
    resolve("");
  }
});

const createHostProber = (event, runId, sshBridge) => async (hostRequest) => {
  const options = hostRequest.options;
  const target = resolveProbeTarget(options);
  const checkedAt = Date.now();

  // Reachability + latency (skipped for command proxies).
  let latencyMs;
  if (target.kind !== "proxy-command") {
    try {
      const address = net.isIP(target.hostname) !== 0
        ? target.hostname
        : (await dns.promises.lookup(target.hostname)).address;
      latencyMs = await probeTcpForRun(runId)(address, target.port);
    } catch (err) {
      return {
        status: summarizeHealthStatus({ tcpOk: false, authOk: false }),
        error: err?.message,
        checkedAt,
      };
    }
  }

  // Optional jump chain, then auth probe on the target.
  let sock;
  let chainConnections = [];
  const jumpHosts = options.jumpHosts || [];
  if (jumpHosts.length > 0) {
    try {
      const chain = await sshBridge.connectThroughChain(
        event,
        options,
        jumpHosts,
        options.hostname,
        options.port || 22,
        runId,
      );
      sock = chain.socket;
      chainConnections = chain.connections || [];
    } catch (err) {
      return {
        status: "unreachable",
        latencyMs,
        error: err?.message,
        checkedAt,
      };
    }
  }

  const closeAll = (conn) => {
    try {
      conn?.end();
    } catch { /* best-effort */ }
    // Jump-chain stream is not always listed in connections; tear it down too.
    if (sock && sock !== conn) {
      try {
        if (typeof sock.end === "function") sock.end();
        else if (typeof sock.destroy === "function") sock.destroy();
      } catch { /* best-effort */ }
    }
    for (const chainConn of [...chainConnections].reverse()) {
      try {
        chainConn.end();
      } catch { /* best-effort */ }
    }
  };

  let probe;
  try {
    probe = await connectTargetProbe(runId, sshBridge.buildAlgorithms)({
      options,
      sock,
      onHostKey: () => {},
      onAuthAttempt: () => {},
    });
  } catch (err) {
    closeAll(null);
    return { status: "auth-failed", latencyMs, error: err?.message, checkedAt };
  }

  if (!probe.ok) {
    closeAll(null);
    // Prefer a human-readable reason over the generic ssh2 failure string.
    const failure = describeFailedProbe(probe);
    return {
      status: failure.status,
      latencyMs,
      error: failure.error,
      hostKeyStatus: failure.hostKeyStatus,
      needsInteractive: probe.needsInteractive,
      checkedAt,
    };
  }

  const snapshot = parseHealthSnapshot(await execSnapshot(probe.conn));
  closeAll(probe.conn);
  return {
    status: summarizeHealthStatus({ tcpOk: true, authOk: true, snapshot }),
    latencyMs,
    authMethod: probe.method,
    ...snapshot,
    checkedAt,
  };
};

async function runHealthCheck(event, payload) {
  const runId = payload?.runId || `health-${randomUUID()}`;
  const hosts = Array.isArray(payload?.hosts) ? payload.hosts : [];
  const sender = event.sender;
  const sshBridge = require("./sshBridge.cjs");

  const emitProgress = (entry) => {
    if (!sender.isDestroyed()) {
      sender.send("magiesTerminal:health:progress", { runId, ...entry });
    }
  };

  try {
    const results = await runHealthChecksWithDeps(
      hosts,
      createHostProber(event, runId, sshBridge),
      {
        concurrency: payload?.concurrency || HEALTH_CONCURRENCY,
        onProgress: emitProgress,
        isCancelled: () => cancelledRuns.has(runId),
      },
    );
    return { runId, results };
  } finally {
    cancelledRuns.delete(runId);
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("magiesTerminal:health:check", (event, payload) =>
    runHealthCheck(event, payload || {}));
  ipcMain.handle("magiesTerminal:health:cancel", (_event, payload) => {
    const runId = payload?.runId;
    if (runId) {
      cancelledRuns.add(runId);
      cancelRun(runId);
    }
    return { cancelled: Boolean(runId) };
  });
}

module.exports = {
  registerHandlers,
  _createHostProber: createHostProber,
};
