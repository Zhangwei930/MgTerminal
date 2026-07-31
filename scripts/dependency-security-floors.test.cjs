const test = require("node:test");
const assert = require("node:assert/strict");

/**
 * Minimum versions for transitive dependencies that sit on a security-sensitive
 * path and whose vulnerable range we have already shipped past. A lockfile
 * rollback or a careless `npm install` can silently reintroduce them, and
 * `npm audit` does not run on every PR — so pin the floor here instead.
 *
 * Each entry documents the advisory it closes.
 */
const SECURITY_FLOORS = [
  {
    name: "builder-util-runtime",
    minimum: "9.7.0",
    // GHSA-p2f4-r6v6-j797 — electron-updater leaks `PRIVATE-TOKEN` and
    // mixed-case `Authorization` headers across origins on redirect.
    advisory: "GHSA-p2f4-r6v6-j797",
  },
];

/** Compares dotted numeric versions; returns true when `actual` >= `minimum`. */
function satisfiesFloor(actual, minimum) {
  const toParts = (v) => v.split("-")[0].split(".").map((n) => Number(n) || 0);
  const a = toParts(actual);
  const b = toParts(minimum);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

test("satisfiesFloor compares dotted versions numerically, not lexically", () => {
  assert.equal(satisfiesFloor("9.7.0", "9.7.0"), true);
  assert.equal(satisfiesFloor("9.10.0", "9.7.0"), true, "9.10 > 9.7 numerically");
  assert.equal(satisfiesFloor("9.6.3", "9.7.0"), false);
  assert.equal(satisfiesFloor("10.0.0", "9.7.0"), true);
  assert.equal(satisfiesFloor("9.7.0-alpha.1", "9.7.0"), true, "prerelease of the fixed version counts");
});

for (const { name, minimum, advisory } of SECURITY_FLOORS) {
  test(`${name} stays at or above the ${advisory} fix (${minimum})`, () => {
    const installed = require(`${name}/package.json`).version;
    assert.ok(
      satisfiesFloor(installed, minimum),
      `${name}@${installed} is below the ${advisory} fix floor of ${minimum}. ` +
      "Run `npm update` rather than downgrading this floor.",
    );
  });
}
