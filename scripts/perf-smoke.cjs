"use strict";

/**
 * Terminal perf smoke: spawns many REAL local pty sessions through the
 * production terminalBridge and measures spawn latency, first-output
 * latency, aggregate output throughput, and peak main-process RSS.
 *
 * Run with the Electron binary so node-pty (built for the Electron ABI)
 * loads exactly as in production:
 *
 *   npm run perf:smoke
 *   MAGIES_PERF_SESSIONS=50 MAGIES_PERF_LINES=5000 npm run perf:smoke
 *
 * Exits 0 when all thresholds pass, 1 otherwise. Prints a JSON report on
 * stdout. This measures the main-process pty path only — xterm.js
 * rendering in the renderer is not covered.
 */

const { app } = require("electron");
const {
  DEFAULT_PERF_THRESHOLDS,
  summarizePerfSmoke,
  evaluatePerfSmoke,
} = require("./perf-smoke-metrics.cjs");

const SESSION_COUNT = intFromEnv("MAGIES_PERF_SESSIONS", 30);
const LINES_PER_SESSION = intFromEnv("MAGIES_PERF_LINES", 2000);
const TIMEOUT_MS = intFromEnv("MAGIES_PERF_TIMEOUT_MS", 120000);
const SENDER_ID = 1;
const DONE_MARKER = "PERF_SMOKE_DONE";
// 64 chars + newline per generated line.
const LINE_BODY = "PERFSMOKE-" + "x".repeat(54);

const thresholds = {
  ...DEFAULT_PERF_THRESHOLDS,
  maxPeakRssBytes: intFromEnv("MAGIES_PERF_MAX_RSS_MB", 2048) * 1024 * 1024,
  minThroughputBytesPerSec: intFromEnv("MAGIES_PERF_MIN_THROUGHPUT_KBPS", 256) * 1024,
};

function intFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildOutputCommand() {
  if (process.platform === "win32") {
    // The typed command echoes back — build the marker from two halves so
    // the echo never contains the contiguous marker string.
    return `1..${LINES_PER_SESSION} | ForEach-Object { '${LINE_BODY}' }; 'PERF_SMOKE_' + 'DONE'\r`;
  }
  return (
    `i=0; while [ $i -lt ${LINES_PER_SESSION} ]; do printf '%s\\n' '${LINE_BODY}'; i=$((i+1)); done; ` +
    `printf 'PERF_SMOKE_'; echo DONE\r`
  );
}

async function main() {
  app.dock?.hide?.();
  await app.whenReady();

  const bridge = require("../electron/bridges/terminalBridge.cjs");
  const sessions = new Map();

  /** @type {Map<string, {spawnMs: number, firstOutputMs: number|null, bytes: number, tail: string, done: boolean, spawnedAt: number}>} */
  const stats = new Map();
  let peakRssBytes = 0;

  const sender = {
    id: SENDER_ID,
    isDestroyed: () => false,
    send(channel, payload) {
      if (channel !== "magiesTerminal:data" || !payload?.sessionId) return;
      const stat = stats.get(payload.sessionId);
      if (!stat) return;
      const chunk = payload.data ?? "";
      const text = Buffer.isBuffer(chunk) ? chunk.toString("latin1") : String(chunk);
      const bytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(text);
      stat.bytes += bytes;
      if (stat.firstOutputMs === null) {
        stat.firstOutputMs = Date.now() - stat.spawnedAt;
      }
      stat.tail = (stat.tail + text).slice(-2 * DONE_MARKER.length);
      if (!stat.done && stat.tail.includes(DONE_MARKER)) {
        stat.done = true;
      }
      // Keep the producer's flow-control window open, as the renderer would.
      setImmediate(() => {
        try {
          bridge.ackSessionFlow({ sender }, { sessionId: payload.sessionId, bytes });
        } catch {
          // Session already gone.
        }
      });
    },
  };

  bridge.init({
    sessions,
    electronModule: {
      webContents: {
        fromId: (id) => (id === SENDER_ID ? sender : null),
      },
    },
  });

  const shell = process.platform === "win32" ? undefined : "/bin/sh";
  for (let i = 0; i < SESSION_COUNT; i += 1) {
    const sessionId = `perf-${i}`;
    const spawnStart = Date.now();
    stats.set(sessionId, {
      spawnMs: 0,
      firstOutputMs: null,
      bytes: 0,
      tail: "",
      done: false,
      spawnedAt: spawnStart,
    });
    bridge.startLocalSession({ sender }, { sessionId, shell, cols: 120, rows: 30 });
    stats.get(sessionId).spawnMs = Date.now() - spawnStart;
  }

  const trackRss = setInterval(() => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  }, 200);

  // Give shells a moment to reach their prompt, then fire the output load.
  await waitFor(() => [...stats.values()].every((s) => s.firstOutputMs !== null), 10000);
  const loadStart = Date.now();
  const command = buildOutputCommand();
  for (const sessionId of stats.keys()) {
    bridge.writeToSession({ sender }, { sessionId, data: command, automated: true });
  }
  await waitFor(() => [...stats.values()].every((s) => s.done), TIMEOUT_MS);
  const durationMs = Date.now() - loadStart;

  clearInterval(trackRss);
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);

  for (const sessionId of stats.keys()) {
    try {
      bridge.closeSession({ sender }, { sessionId });
    } catch {
      // Best-effort teardown.
    }
  }
  bridge.cleanupAllSessions();
  // node-pty kill callbacks land asynchronously; exiting immediately can
  // abort the process with a Napi::Error before the exit code is delivered.
  await new Promise((resolve) => setTimeout(resolve, 750));

  const summary = summarizePerfSmoke({
    sessions: [...stats.entries()].map(([sessionId, s]) => ({
      sessionId,
      spawnMs: s.spawnMs,
      firstOutputMs: s.firstOutputMs,
      bytes: s.bytes,
    })),
    durationMs,
    peakRssBytes,
  });
  const verdict = evaluatePerfSmoke(summary, thresholds);

  console.log(JSON.stringify({
    config: {
      sessionCount: SESSION_COUNT,
      linesPerSession: LINES_PER_SESSION,
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
    },
    summary,
    thresholds,
    verdict,
  }, null, 2));

  const mb = (summary.peakRssBytes / 1024 / 1024).toFixed(0);
  const mbps = (summary.throughputBytesPerSec / 1024 / 1024).toFixed(2);
  console.log(
    `perf-smoke ${verdict.pass ? "PASS" : "FAIL"}: ${summary.sessionCount} sessions, ` +
    `${mbps} MB/s aggregate, peak RSS ${mb} MB, spawn avg ${summary.spawnMsAvg.toFixed(0)} ms`,
  );

  app.exit(verdict.pass ? 0 : 1);
}

function waitFor(predicate, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (predicate() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

main().catch((err) => {
  console.error("perf-smoke crashed:", err);
  app.exit(2);
});
