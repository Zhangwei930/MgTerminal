const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseTscOutput,
  loadBaseline,
  loadBaselineTotalCap,
  writeBaseline,
  diffAgainstBaseline,
  exceedsTotalCap,
  findBaselinePollution,
} = require("./typecheckBaseline.cjs");

const SAMPLE_OUTPUT = `foo.ts(1,2): error TS2339: Property 'x' does not exist on type 'Y'.
bar.ts(10,5): error TS2322: Type 'A' is not assignable to type 'B'.
  'B' could be instantiated with an arbitrary type.
foo.ts(99,1): error TS2339: Property 'x' does not exist on type 'Y'.
`;

test("parseTscOutput folds continuation lines into one identity, drops line/col", () => {
  const ids = parseTscOutput(SAMPLE_OUTPUT);
  // The two foo.ts(1,2) / foo.ts(99,1) errors share file+code+message once
  // line/col are stripped, so they collapse into a single identity.
  assert.deepEqual(new Set(ids), new Set([
    "foo.ts::TS2339::Property 'x' does not exist on type 'Y'.",
    "bar.ts::TS2322::Type 'A' is not assignable to type 'B'. 'B' could be instantiated with an arbitrary type.",
  ]));
});

test("parseTscOutput returns nothing for clean output", () => {
  assert.deepEqual(parseTscOutput("\n"), []);
});

test("diffAgainstBaseline reports new violations and fixed baseline entries", () => {
  const baseline = new Set(["a.ts::TS1::old error", "b.ts::TS2::still here"]);
  const current = ["b.ts::TS2::still here", "c.ts::TS3::brand new error"];

  const { newViolations, fixed } = diffAgainstBaseline(current, baseline);
  assert.deepEqual(newViolations, ["c.ts::TS3::brand new error"]);
  assert.deepEqual(fixed, ["a.ts::TS1::old error"]);
});

test("diffAgainstBaseline is clean when current exactly matches baseline", () => {
  const baseline = new Set(["a.ts::TS1::x"]);
  const { newViolations, fixed } = diffAgainstBaseline(["a.ts::TS1::x"], baseline);
  assert.deepEqual(newViolations, []);
  assert.deepEqual(fixed, []);
});

test("writeBaseline then loadBaseline round-trips a sorted, deduped set", () => {
  const tmpFile = path.join(os.tmpdir(), `typecheck-baseline-test-${Date.now()}.json`);
  try {
    writeBaseline(tmpFile, ["z.ts::TS1::z", "a.ts::TS1::a"], 7);
    const loaded = loadBaseline(tmpFile);
    assert.deepEqual(loaded, new Set(["a.ts::TS1::a", "z.ts::TS1::z"]));
    const raw = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.deepEqual(raw.identities, ["a.ts::TS1::a", "z.ts::TS1::z"]);
    assert.equal(raw.maxTotalErrors, 7, "total cap is persisted alongside the identities");
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

test("writeBaseline dedupes repeated identities before persisting them", () => {
  const tmpFile = path.join(os.tmpdir(), `typecheck-baseline-dupes-${Date.now()}.json`);
  try {
    // Raw tsc output repeats an identity once per occurrence; the file should
    // record it once, while the cap still reflects the raw occurrence count.
    writeBaseline(tmpFile, ["a.ts::TS1::a", "a.ts::TS1::a", "b.ts::TS2::b"], 3);
    const raw = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
    assert.deepEqual(raw.identities, ["a.ts::TS1::a", "b.ts::TS2::b"]);
    assert.equal(raw.maxTotalErrors, 3);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

test("loadBaseline returns an empty set when the file is missing", () => {
  const missing = path.join(os.tmpdir(), "typecheck-baseline-does-not-exist.json");
  assert.deepEqual(loadBaseline(missing), new Set());
});

test("loadBaseline still reads the legacy bare-array format", () => {
  const tmpFile = path.join(os.tmpdir(), `typecheck-baseline-legacy-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(["a.ts::TS1::a"]));
    assert.deepEqual(loadBaseline(tmpFile), new Set(["a.ts::TS1::a"]));
    assert.equal(loadBaselineTotalCap(tmpFile), null, "legacy files carry no cap");
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

test("loadBaselineTotalCap reads the cap, and is null when absent or unreadable", () => {
  const tmpFile = path.join(os.tmpdir(), `typecheck-baseline-cap-${Date.now()}.json`);
  try {
    writeBaseline(tmpFile, ["a.ts::TS1::a"], 42);
    assert.equal(loadBaselineTotalCap(tmpFile), 42);
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
  assert.equal(
    loadBaselineTotalCap(path.join(os.tmpdir(), "typecheck-cap-does-not-exist.json")),
    null,
  );
});

// The identity set is deduped by design (line/col are stripped), so a file that
// already has one `TS2503` error absorbs a second identical one for free. The
// total cap is what stops that backlog from silently growing.
test("exceedsTotalCap catches duplicate errors the identity set cannot", () => {
  assert.equal(exceedsTotalCap(336, 335), true, "one more error than the cap fails");
  assert.equal(exceedsTotalCap(335, 335), false, "exactly at the cap passes");
  assert.equal(exceedsTotalCap(300, 335), false, "below the cap passes");
});

test("exceedsTotalCap treats a missing cap as unlimited", () => {
  assert.equal(exceedsTotalCap(9999, null), false);
  assert.equal(exceedsTotalCap(9999, undefined), false);
});

// CI installs only the root package.json. A long-lived local checkout usually
// also has mobile/node_modules, which resolves @capacitor/* imports that CI
// cannot — so a baseline regenerated here silently drops errors CI still sees.
// This has broken main twice (PR #104, and again when the total cap landed).
test("findBaselinePollution flags local installs CI does not have", () => {
  const present = new Set(["/repo/mobile/node_modules"]);
  assert.deepEqual(
    findBaselinePollution("/repo", (p) => present.has(p)),
    ["mobile/node_modules"],
  );
});

test("findBaselinePollution is empty in a clean checkout", () => {
  assert.deepEqual(findBaselinePollution("/repo", () => false), []);
});
