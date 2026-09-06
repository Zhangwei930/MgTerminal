import test from "node:test";
import assert from "node:assert/strict";

import { rowUpdateFailure } from "./useDbRowEditing.ts";

// The grid overlays the typed value as soon as commitEdit resolves without a
// failure, so an UPDATE that matched nothing used to leave the cell showing a
// value the database never took. Every adapter already reports affectedRows on
// the completion payload — this is the check that was missing.

test("an update that matched no row is a failure", () => {
  const failure = rowUpdateFailure(0);

  assert.ok(failure, "0 affected rows must not read as success");
  assert.match(failure!, /no row/i);
});

test("an update that matched exactly one row succeeds", () => {
  assert.equal(rowUpdateFailure(1), null);
});

// mssql reports rowsAffected as an array and can leave it undefined. Inventing
// a failure there would break editing against a server that simply did not say.
test("an adapter that does not report a count is not treated as a failure", () => {
  assert.equal(rowUpdateFailure(undefined), null);
});

// The WHERE is built from the primary key, so this should be unreachable — but
// if it happens the rows are already written, and reporting a failure would
// tell the user the opposite of what occurred.
test("more than one affected row is not reported as a failed write", () => {
  assert.equal(rowUpdateFailure(3), null);
});

// ── resolveEditTarget ───────────────────────────────────────────────────────

import { resolveEditTarget } from "./useDbRowEditing.ts";

// listPrimaryKey used to be asked for "users" with no schema, so on a server
// with the same table in two schemas it answered with both keys merged.

test("a bare table name resolves to a target with no schema", () => {
  assert.deepEqual(resolveEditTarget("SELECT * FROM patients"), { name: "patients" });
});

test("a schema-qualified FROM keeps the schema on the target", () => {
  assert.deepEqual(
    resolveEditTarget("SELECT * FROM tenant_a.patients"),
    { schema: "tenant_a", name: "patients" },
  );
});

test("a result that cannot be written back resolves to nothing", () => {
  assert.equal(resolveEditTarget("SELECT a.* FROM a JOIN b ON 1=1"), null);
  assert.equal(resolveEditTarget(""), null);
});
