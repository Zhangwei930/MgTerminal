const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const crashLogBridge = require("./crashLogBridge.cjs");
const crashTelemetry = require("./crashTelemetryBridge.cjs");

test("captureError forwards a sanitized entry to telemetry when opted in", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crash-telemetry-e2e-"));
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      received.push({ url: req.url, body });
      res.statusCode = 202;
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/crash-report`;
  process.env.MAGIES_TERMINAL_CRASH_ENDPOINT = endpoint;

  try {
    const fakeApp = {
      getPath: () => dir,
      getVersion: () => "0.0.0-test",
    };
    crashTelemetry._resetForTest();
    crashTelemetry.init({ app: fakeApp });
    crashTelemetry.setEnabled(true);
    crashLogBridge.init({ sessions: new Map(), electronModule: { app: fakeApp } });

    const err = new Error(`boom in ${os.homedir()}/private/file.ts`);
    crashLogBridge.captureError("telemetry-e2e", err, { secretHost: "10.0.0.9" });

    // The telemetry POST is fire-and-forget; poll briefly for arrival.
    const deadline = Date.now() + 5000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.equal(received.length, 1);
    const payload = JSON.parse(received[0].body);
    assert.equal(payload.schema, 1);
    assert.equal(payload.source, "telemetry-e2e");
    assert.ok(!JSON.stringify(payload).includes(os.homedir()));
    assert.equal(payload.extra, undefined);
    assert.equal(payload.pid, undefined);
  } finally {
    delete process.env.MAGIES_TERMINAL_CRASH_ENDPOINT;
    crashTelemetry._resetForTest();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
