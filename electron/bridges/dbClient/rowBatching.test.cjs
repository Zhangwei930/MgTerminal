const test = require("node:test");
const assert = require("node:assert/strict");

const { emitRowBatches, BATCH_SIZE } = require("./rowBatching.cjs");

test("emits a single empty batch with columns for an empty result", () => {
  const batches = [];
  const result = emitRowBatches([], [{ name: "id", type: "number" }], 10, (b) => batches.push(b));
  assert.equal(result.rowCount, 0);
  assert.equal(result.truncated, false);
  assert.deepEqual(batches, [{ columns: [{ name: "id", type: "number" }], rows: [] }]);
});

test("splits rows into BATCH_SIZE-sized chunks, columns only on the first", () => {
  const rows = Array.from({ length: BATCH_SIZE + 10 }, (_, i) => [i]);
  const columns = [{ name: "id", type: "number" }];
  const batches = [];
  const result = emitRowBatches(rows, columns, 10_000, (b) => batches.push(b));

  assert.equal(result.rowCount, rows.length);
  assert.equal(result.truncated, false);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].rows.length, BATCH_SIZE);
  assert.deepEqual(batches[0].columns, columns);
  assert.equal(batches[1].rows.length, 10);
  assert.equal(batches[1].columns, undefined);
});

test("caps at maxRows and reports truncated", () => {
  const rows = Array.from({ length: 20 }, (_, i) => [i]);
  const batches = [];
  const result = emitRowBatches(rows, [], 5, (b) => batches.push(b));
  assert.equal(result.rowCount, 5);
  assert.equal(result.truncated, true);
  assert.equal(batches[0].rows.length, 5);
});
