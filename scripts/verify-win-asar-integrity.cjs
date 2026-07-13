#!/usr/bin/env node
/**
 * Verify a packaged Windows build: the ASAR header hash embedded in the exe's
 * INTEGRITY/ELECTRONASAR resource must match resources/app.asar on disk.
 * With the EnableEmbeddedAsarIntegrityValidation fuse enabled, a mismatch
 * makes the app exit silently at launch (v0.2.7 "Windows won't start" bug),
 * so CI must fail loudly instead.
 *
 * Usage: node scripts/verify-win-asar-integrity.cjs [unpackedDir]
 *   unpackedDir defaults to release/win-unpacked
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { readAsarHeaderString } = require("./afterPackMacUuid.cjs");

function verifyWinAsarIntegrity(unpackedDir) {
  const exePath = path.join(unpackedDir, "MagiesTerminal.exe");
  const asarPath = path.join(unpackedDir, "resources", "app.asar");
  if (!fs.existsSync(exePath)) {
    throw new Error(`[verify-win-asar-integrity] exe not found: ${exePath}`);
  }
  if (!fs.existsSync(asarPath)) {
    throw new Error(`[verify-win-asar-integrity] app.asar not found: ${asarPath}`);
  }

  const { NtExecutable, NtExecutableResource } = require("resedit");
  const executable = NtExecutable.from(fs.readFileSync(exePath));
  const resource = NtExecutableResource.from(executable);
  const entry = resource.entries.find(
    (e) => e.type === "INTEGRITY" && e.id === "ELECTRONASAR",
  );
  if (!entry) {
    throw new Error(
      `[verify-win-asar-integrity] no INTEGRITY/ELECTRONASAR resource in ${exePath}; ` +
        "the asar-integrity fuse would reject this build at launch",
    );
  }

  const embedded = JSON.parse(Buffer.from(entry.bin).toString("utf8"));
  const asarRecord = embedded.find((item) => item.file === "resources\\app.asar");
  if (!asarRecord) {
    throw new Error(
      `[verify-win-asar-integrity] embedded integrity list has no resources\\app.asar record: ${JSON.stringify(embedded)}`,
    );
  }

  const actual = crypto.createHash("sha256").update(readAsarHeaderString(asarPath)).digest("hex");
  if (asarRecord.value !== actual) {
    throw new Error(
      "[verify-win-asar-integrity] embedded ASAR header hash is stale — the app would fail " +
        `integrity validation at launch. embedded=${asarRecord.value} actual=${actual}`,
    );
  }
  return actual;
}

module.exports = { verifyWinAsarIntegrity };

if (require.main === module) {
  const unpackedDir = process.argv[2] || path.join("release", "win-unpacked");
  const hash = verifyWinAsarIntegrity(unpackedDir);
  console.log(`[verify-win-asar-integrity] OK: embedded ASAR header hash matches (${hash})`);
}
