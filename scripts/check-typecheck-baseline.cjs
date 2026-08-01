"use strict";

// Ratchets `tsc --noEmit` against a checked-in baseline (scripts/typecheck-baseline.json)
// of pre-existing errors, so CI fails only on *new* type errors rather than the legacy
// backlog. Run with --update to regenerate the baseline from the current tsc output
// (e.g. after fixing some of the backlog, or — sparingly — to grandfather a new one).

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
  parseTscOutput,
  loadBaseline,
  loadBaselineTotalCap,
  writeBaseline,
  diffAgainstBaseline,
  exceedsTotalCap,
  findBaselinePollution,
  DEFAULT_BASELINE_PATH,
} = require("./typecheckBaseline.cjs");

function runTypecheck() {
  const result = spawnSync("npx", ["tsc", "--noEmit", "-p", "."], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 64,
  });
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function main() {
  const shouldUpdate = process.argv.includes("--update");
  const output = runTypecheck();
  const current = parseTscOutput(output);

  if (shouldUpdate) {
    const polluted = findBaselinePollution(path.join(__dirname, ".."));
    if (polluted.length > 0 && !process.argv.includes("--force")) {
      console.error("[typecheck-baseline] Refusing to regenerate from this checkout.");
      console.error(`Found local installs CI does not have: ${polluted.join(", ")}.`);
      console.error("They resolve imports CI cannot, so the baseline would drop errors CI still reports");
      console.error("and the next push to main would fail. Regenerate from a throwaway worktree:");
      console.error("\n  git worktree add /tmp/baseline-wt main && cd /tmp/baseline-wt \\");
      console.error("    && npm ci && npm run typecheck:baseline:update\n");
      console.error("then copy scripts/typecheck-baseline.json back. Use --force to override.");
      process.exitCode = 1;
      return;
    }

    const unique = new Set(current).size;
    writeBaseline(DEFAULT_BASELINE_PATH, current, current.length);
    console.log(`[typecheck-baseline] Wrote ${unique} identities (cap ${current.length} total errors) to ${DEFAULT_BASELINE_PATH}`);
    return;
  }

  const baseline = loadBaseline(DEFAULT_BASELINE_PATH);
  const maxTotalErrors = loadBaselineTotalCap(DEFAULT_BASELINE_PATH);
  const { newViolations, fixed } = diffAgainstBaseline(current, baseline);

  if (fixed.length > 0) {
    // Don't advertise shrinking from a checkout that resolves more than CI —
    // those entries are "fixed" only locally, and acting on the suggestion is
    // exactly how this baseline drifted out of CI parity before.
    const polluted = findBaselinePollution(path.join(__dirname, ".."));
    const advice = polluted.length > 0
      ? `these likely still reproduce in CI (this checkout has ${polluted.join(", ")}); do NOT shrink the baseline from here`
      : 'consider running "npm run typecheck:baseline:update" to shrink the baseline';
    console.log(`[typecheck-baseline] ${fixed.length} baseline error(s) no longer reproduce — ${advice}:`);
    for (const id of fixed) console.log(`  - ${id}`);
  }

  if (newViolations.length > 0) {
    console.error(`[typecheck-baseline] ${newViolations.length} NEW type error(s) not in the baseline:`);
    for (const id of newViolations) console.error(`  + ${id}`);
    console.error(`\nFix them, or if a new baseline entry is genuinely unavoidable, run "npm run typecheck:baseline:update".`);
    process.exitCode = 1;
    return;
  }

  // Identities are deduped, so re-introducing an error that already exists in
  // the same file produces no new violation. The total cap is what catches it.
  if (exceedsTotalCap(current.length, maxTotalErrors)) {
    console.error(`[typecheck-baseline] Total type errors grew from ${maxTotalErrors} to ${current.length}.`);
    console.error("No NEW error identity appeared, so these are duplicates of errors already in the baseline");
    console.error("(identities drop line/col, so repeats in an already-failing file collapse into one entry).");
    console.error(`\nFix them, or run "npm run typecheck:baseline:update" if the growth is genuinely unavoidable.`);
    process.exitCode = 1;
    return;
  }

  const capNote = maxTotalErrors === null ? "no total cap recorded" : `cap ${maxTotalErrors}`;
  console.log(`[typecheck-baseline] OK — ${current.length} error(s), none new (baseline has ${baseline.size} identities, ${capNote}).`);
}

main();
