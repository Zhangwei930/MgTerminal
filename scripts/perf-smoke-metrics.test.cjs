const test = require("node:test");
const assert = require("node:assert/strict");
const {
  summarizePerfSmoke,
  evaluatePerfSmoke,
  DEFAULT_PERF_THRESHOLDS,
} = require("./perf-smoke-metrics.cjs");

function makeSessions() {
  return [
    { sessionId: "perf-0", spawnMs: 20, firstOutputMs: 100, bytes: 1_000_000 },
    { sessionId: "perf-1", spawnMs: 40, firstOutputMs: 300, bytes: 3_000_000 },
  ];
}

test("summarizePerfSmoke aggregates spawn, latency, bytes, and throughput", () => {
  const summary = summarizePerfSmoke({
    sessions: makeSessions(),
    durationMs: 2000,
    peakRssBytes: 500 * 1024 * 1024,
  });

  assert.equal(summary.sessionCount, 2);
  assert.equal(summary.totalBytes, 4_000_000);
  assert.equal(summary.throughputBytesPerSec, 2_000_000);
  assert.equal(summary.spawnMsAvg, 30);
  assert.equal(summary.spawnMsMax, 40);
  assert.equal(summary.firstOutputMsAvg, 200);
  assert.equal(summary.firstOutputMsMax, 300);
  assert.equal(summary.minSessionBytes, 1_000_000);
  assert.equal(summary.peakRssBytes, 500 * 1024 * 1024);
});

test("summarizePerfSmoke guards zero duration and empty sessions", () => {
  const summary = summarizePerfSmoke({ sessions: [], durationMs: 0, peakRssBytes: 0 });
  assert.equal(summary.sessionCount, 0);
  assert.equal(summary.totalBytes, 0);
  assert.equal(summary.throughputBytesPerSec, 0);
  assert.equal(summary.spawnMsAvg, 0);
  assert.equal(summary.firstOutputMsMax, 0);
  assert.equal(summary.minSessionBytes, 0);
});

test("summarizePerfSmoke ignores sessions without first output for latency stats", () => {
  const summary = summarizePerfSmoke({
    sessions: [
      { sessionId: "a", spawnMs: 10, firstOutputMs: null, bytes: 0 },
      { sessionId: "b", spawnMs: 30, firstOutputMs: 50, bytes: 500 },
    ],
    durationMs: 1000,
    peakRssBytes: 1,
  });
  assert.equal(summary.firstOutputMsAvg, 50);
  assert.equal(summary.firstOutputMsMax, 50);
  assert.equal(summary.sessionsWithoutOutput, 1);
});

test("evaluatePerfSmoke passes a healthy run with default thresholds", () => {
  const summary = summarizePerfSmoke({
    sessions: makeSessions(),
    durationMs: 2000,
    peakRssBytes: 200 * 1024 * 1024,
  });
  const verdict = evaluatePerfSmoke(summary, DEFAULT_PERF_THRESHOLDS);
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.failures, []);
});

test("evaluatePerfSmoke fails when a session never produced output", () => {
  const summary = summarizePerfSmoke({
    sessions: [{ sessionId: "a", spawnMs: 10, firstOutputMs: null, bytes: 0 }],
    durationMs: 1000,
    peakRssBytes: 1,
  });
  const verdict = evaluatePerfSmoke(summary, DEFAULT_PERF_THRESHOLDS);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.failures.some((f) => f.metric === "sessionsWithoutOutput"));
});

test("evaluatePerfSmoke reports each exceeded threshold with actual and limit", () => {
  const summary = summarizePerfSmoke({
    sessions: [
      { sessionId: "a", spawnMs: 5000, firstOutputMs: 20000, bytes: 10 },
    ],
    durationMs: 1000,
    peakRssBytes: 10 * 1024 * 1024 * 1024,
  });
  const verdict = evaluatePerfSmoke(summary, {
    ...DEFAULT_PERF_THRESHOLDS,
    maxSpawnMsAvg: 100,
    maxFirstOutputMsMax: 100,
    maxPeakRssBytes: 1024,
  });
  assert.equal(verdict.pass, false);
  const metrics = verdict.failures.map((f) => f.metric);
  assert.ok(metrics.includes("spawnMsAvg"));
  assert.ok(metrics.includes("firstOutputMsMax"));
  assert.ok(metrics.includes("peakRssBytes"));
  for (const failure of verdict.failures) {
    assert.equal(typeof failure.actual, "number");
    assert.equal(typeof failure.limit, "number");
  }
});

test("evaluatePerfSmoke fails an empty run instead of vacuously passing", () => {
  const summary = summarizePerfSmoke({ sessions: [], durationMs: 0, peakRssBytes: 0 });
  const verdict = evaluatePerfSmoke(summary, DEFAULT_PERF_THRESHOLDS);
  assert.equal(verdict.pass, false);
  assert.ok(verdict.failures.some((f) => f.metric === "sessionCount"));
});
