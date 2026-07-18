"use strict";

/**
 * Pure aggregation and threshold evaluation for the terminal perf smoke run
 * (scripts/perf-smoke.cjs). Kept free of Electron so it can be unit tested
 * with the regular Node test runner.
 */

/**
 * Generous defaults: the smoke exists to catch order-of-magnitude
 * regressions (a session that never spawns, RSS blowing up, output
 * stalling), not to benchmark absolute machine speed. Override per-run via
 * MAGIES_PERF_* env vars in scripts/perf-smoke.cjs.
 */
const DEFAULT_PERF_THRESHOLDS = {
  maxSpawnMsAvg: 2000,
  maxSpawnMsMax: 5000,
  maxFirstOutputMsMax: 15000,
  maxPeakRssBytes: 2 * 1024 * 1024 * 1024,
  minThroughputBytesPerSec: 256 * 1024,
  maxSessionsWithoutOutput: 0,
};

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function summarizePerfSmoke({ sessions, durationMs, peakRssBytes }) {
  const spawnTimes = sessions.map((s) => s.spawnMs);
  const firstOutputTimes = sessions
    .map((s) => s.firstOutputMs)
    .filter((ms) => Number.isFinite(ms));
  const bytesPerSession = sessions.map((s) => s.bytes);
  const totalBytes = bytesPerSession.reduce((sum, b) => sum + b, 0);

  return {
    sessionCount: sessions.length,
    totalBytes,
    throughputBytesPerSec: durationMs > 0 ? (totalBytes / durationMs) * 1000 : 0,
    spawnMsAvg: average(spawnTimes),
    spawnMsMax: spawnTimes.length > 0 ? Math.max(...spawnTimes) : 0,
    firstOutputMsAvg: average(firstOutputTimes),
    firstOutputMsMax: firstOutputTimes.length > 0 ? Math.max(...firstOutputTimes) : 0,
    minSessionBytes: bytesPerSession.length > 0 ? Math.min(...bytesPerSession) : 0,
    sessionsWithoutOutput: sessions.length - firstOutputTimes.length,
    peakRssBytes,
    durationMs,
  };
}

function evaluatePerfSmoke(summary, thresholds = DEFAULT_PERF_THRESHOLDS) {
  const failures = [];
  const fail = (metric, actual, limit) => failures.push({ metric, actual, limit });

  if (summary.sessionCount < 1) {
    fail("sessionCount", summary.sessionCount, 1);
  }
  if (summary.sessionsWithoutOutput > thresholds.maxSessionsWithoutOutput) {
    fail("sessionsWithoutOutput", summary.sessionsWithoutOutput, thresholds.maxSessionsWithoutOutput);
  }
  if (summary.spawnMsAvg > thresholds.maxSpawnMsAvg) {
    fail("spawnMsAvg", summary.spawnMsAvg, thresholds.maxSpawnMsAvg);
  }
  if (summary.spawnMsMax > thresholds.maxSpawnMsMax) {
    fail("spawnMsMax", summary.spawnMsMax, thresholds.maxSpawnMsMax);
  }
  if (summary.firstOutputMsMax > thresholds.maxFirstOutputMsMax) {
    fail("firstOutputMsMax", summary.firstOutputMsMax, thresholds.maxFirstOutputMsMax);
  }
  if (summary.peakRssBytes > thresholds.maxPeakRssBytes) {
    fail("peakRssBytes", summary.peakRssBytes, thresholds.maxPeakRssBytes);
  }
  if (summary.sessionCount > 0 && summary.throughputBytesPerSec < thresholds.minThroughputBytesPerSec) {
    fail("throughputBytesPerSec", summary.throughputBytesPerSec, thresholds.minThroughputBytesPerSec);
  }

  return { pass: failures.length === 0, failures };
}

module.exports = {
  DEFAULT_PERF_THRESHOLDS,
  summarizePerfSmoke,
  evaluatePerfSmoke,
};
