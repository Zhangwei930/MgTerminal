import test from "node:test";
import assert from "node:assert/strict";

import { describeStatementFailure } from "./useDbClientBackend.ts";

// A designer change is several statements, and MySQL and Oracle commit each
// DDL statement as it runs. When one fails partway the user has to be told
// that the earlier ones are already in the database — otherwise the obvious
// reading of "failed" is that nothing happened.

test("a lone statement reports just its error", () => {
  assert.equal(describeStatementFailure(0, 1, "syntax error"), "syntax error");
});

test("the first of several says which one failed and nothing more", () => {
  const message = describeStatementFailure(0, 3, "syntax error");
  assert.match(message, /1 of 3/);
  assert.doesNotMatch(message, /already/i, "nothing ran before it");
});

test("a later failure warns that the earlier statements have already run", () => {
  const message = describeStatementFailure(2, 3, "column does not exist");
  assert.match(message, /3 of 3/);
  assert.match(message, /column does not exist/);
  assert.match(message, /already/i);
});
