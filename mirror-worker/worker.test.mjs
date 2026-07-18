/* global Request */
import assert from "node:assert/strict";
import test from "node:test";

import { buildManifest, resolveAssetName } from "./src/worker.js";

test("manifest is synthesized from the GitHub API release payload", () => {
  const manifest = buildManifest(
    {
      tag_name: "v0.4.0",
      published_at: "2026-07-13T12:00:00Z",
      assets: [
        { name: "MagiesTerminal-0.4.0-mac-arm64.dmg", size: 111 },
        { name: "latest.yml", size: 22 },
      ],
    },
    "https://dl.magies.top",
  );

  assert.equal(manifest.version, "0.4.0");
  assert.equal(manifest.tag, "v0.4.0");
  assert.equal(manifest.publishedAt, "2026-07-13T12:00:00Z");
  assert.deepEqual(manifest.files[0], {
    name: "MagiesTerminal-0.4.0-mac-arm64.dmg",
    size: 111,
    url: "https://dl.magies.top/stable/MagiesTerminal-0.4.0-mac-arm64.dmg",
  });
  assert.equal(manifest.files[1].url, "https://dl.magies.top/stable/latest.yml");
});

test("asset names resolve only under /stable/ and never the manifest itself", () => {
  assert.equal(resolveAssetName("/stable/latest.yml"), "latest.yml");
  assert.equal(
    resolveAssetName("/stable/MagiesTerminal-0.4.0-win-x64.exe"),
    "MagiesTerminal-0.4.0-win-x64.exe",
  );
  assert.equal(resolveAssetName("/stable/release.json"), null);
  assert.equal(resolveAssetName("/stable/"), null);
  assert.equal(resolveAssetName("/stable/a/b"), null);
  assert.equal(resolveAssetName("/other/latest.yml"), null);
});

test("encoded asset names are decoded", () => {
  assert.equal(resolveAssetName("/stable/some%20file.zip"), "some file.zip");
});

test("crash report validation accepts sane payloads and rejects junk", async () => {
  const { validateCrashReport } = await import("./src/worker.js");
  assert.equal(
    validateCrashReport({ schema: 1, message: "boom", appVersion: "0.5.6", platform: "darwin" }),
    true,
  );
  assert.equal(validateCrashReport(null), false);
  assert.equal(validateCrashReport({ schema: 2, message: "boom", appVersion: "1", platform: "p" }), false);
  assert.equal(validateCrashReport({ schema: 1, appVersion: "1", platform: "p" }), false);
  assert.equal(validateCrashReport({ schema: 1, message: 42, appVersion: "1", platform: "p" }), false);
});

test("POST /crash-report writes a data point when the binding exists", async () => {
  const worker = (await import("./src/worker.js")).default;
  const points = [];
  const env = { CRASH_REPORTS: { writeDataPoint: (p) => points.push(p) } };
  const request = new Request("https://dl.magies.top/crash-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schema: 1, message: "boom", appVersion: "0.5.6", platform: "darwin", arch: "x64" }),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 202);
  assert.equal(points.length, 1);
  assert.ok(points[0].blobs.includes("0.5.6"));
});

test("POST /crash-report without a binding answers 501 and stores nothing", async () => {
  const worker = (await import("./src/worker.js")).default;
  const request = new Request("https://dl.magies.top/crash-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schema: 1, message: "boom", appVersion: "0.5.6", platform: "darwin" }),
  });
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 501);
});

test("POST /crash-report rejects invalid or oversized payloads", async () => {
  const worker = (await import("./src/worker.js")).default;
  const env = { CRASH_REPORTS: { writeDataPoint: () => {} } };
  const bad = await worker.fetch(new Request("https://dl.magies.top/crash-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  }), env);
  assert.equal(bad.status, 400);

  const huge = await worker.fetch(new Request("https://dl.magies.top/crash-report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ schema: 1, message: "x".repeat(64 * 1024), appVersion: "1", platform: "p" }),
  }), env);
  assert.equal(huge.status, 413);
});

test("POST to other paths is still method-not-allowed", async () => {
  const worker = (await import("./src/worker.js")).default;
  const response = await worker.fetch(
    new Request("https://dl.magies.top/stable/release.json", { method: "POST" }),
    {},
  );
  assert.equal(response.status, 405);
});
