"use strict";

const path = require("node:path");

const ERROR_LINE_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/**
 * Parses `tsc --noEmit` output into a stable, line/column-independent set of
 * error identities: "<file>::<code>::<message>", where continuation lines
 * (the extra explanation tsc indents under some errors) are folded into the
 * same message. Line/column are dropped because they drift on every
 * unrelated edit above an error, which would make a line-number-keyed
 * baseline spuriously stale.
 */
function parseTscOutput(output) {
  const lines = output.split("\n");
  const entries = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(ERROR_LINE_RE);
    if (match) {
      const [, file, , , code, message] = match;
      current = { file: file.trim(), code, messageParts: [message.trim()] };
      entries.push(current);
    } else if (current && line.trim()) {
      current.messageParts.push(line.trim());
    }
  }

  return entries.map((e) => `${e.file}::${e.code}::${e.messageParts.join(" ")}`);
}

/**
 * Reads the baseline file. Accepts both the current
 * `{ maxTotalErrors, identities }` shape and the legacy bare array.
 */
function readBaselineFile(baselinePath) {
  try {
    const raw = require(baselinePath);
    if (Array.isArray(raw)) return { identities: raw, maxTotalErrors: null };
    return {
      identities: Array.isArray(raw?.identities) ? raw.identities : [],
      maxTotalErrors: typeof raw?.maxTotalErrors === "number" ? raw.maxTotalErrors : null,
    };
  } catch {
    return { identities: [], maxTotalErrors: null };
  }
}

function loadBaseline(baselinePath) {
  return new Set(readBaselineFile(baselinePath).identities);
}

/** The recorded total error count, or null for legacy/missing baselines. */
function loadBaselineTotalCap(baselinePath) {
  return readBaselineFile(baselinePath).maxTotalErrors;
}

function writeBaseline(baselinePath, identities, maxTotalErrors) {
  const fs = require("node:fs");
  // Callers pass raw tsc identities, which repeat whenever one file has several
  // errors that collapse to the same identity. Dedupe on write so the file
  // matches what loadBaseline yields instead of carrying silent duplicates.
  const sorted = [...new Set(identities)].sort();
  const payload = { maxTotalErrors, identities: sorted };
  fs.writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`);
}

/** Splits current identities against a baseline set into new/fixed/unchanged. */
function diffAgainstBaseline(currentIdentities, baselineSet) {
  const currentSet = new Set(currentIdentities);
  const newViolations = currentIdentities.filter((id) => !baselineSet.has(id));
  const fixed = [...baselineSet].filter((id) => !currentSet.has(id));
  return { newViolations, fixed };
}

/**
 * True when the raw error count outgrew the recorded cap. Identities are
 * deduped (line/col are stripped, see parseTscOutput), so a file that already
 * carries one error of a given code+message absorbs further identical ones
 * without ever showing up as a new violation. The cap is what makes that
 * backlog a ratchet instead of a free allowance. A null cap means unlimited,
 * which keeps legacy baselines working.
 */
function exceedsTotalCap(currentCount, maxTotalErrors) {
  return typeof maxTotalErrors === "number" && currentCount > maxTotalErrors;
}

/**
 * Directories a long-lived local checkout accumulates that CI never has. CI
 * runs `npm ci` against the root package.json only, so mobile/node_modules
 * resolves @capacitor/* imports here that stay unresolved there. Regenerating
 * the baseline from such a checkout drops errors CI still reports, and the
 * next push fails on main — this has happened twice (PR #104, and again when
 * the total cap landed).
 */
const CI_ABSENT_INSTALL_DIRS = ["mobile/node_modules"];

/** Returns the CI-absent directories present in `repoRoot`, relative paths. */
function findBaselinePollution(repoRoot, existsSync = require("node:fs").existsSync) {
  return CI_ABSENT_INSTALL_DIRS.filter((rel) => existsSync(path.join(repoRoot, rel)));
}

module.exports = {
  parseTscOutput,
  loadBaseline,
  loadBaselineTotalCap,
  writeBaseline,
  diffAgainstBaseline,
  exceedsTotalCap,
  findBaselinePollution,
  DEFAULT_BASELINE_PATH: path.join(__dirname, "typecheck-baseline.json"),
};
