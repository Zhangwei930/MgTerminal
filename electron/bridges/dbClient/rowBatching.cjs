"use strict";

const BATCH_SIZE = 500;

/**
 * Slices an already-fetched row-major result into IPC-sized batches, capping
 * at `maxRows`. Real DB-level streaming (so a huge result set never has to
 * fully buffer in the adapter) is left for a later phase — this only protects
 * the IPC channel from one giant message.
 */
function emitRowBatches(rows, columns, maxRows, onRowBatch) {
  const truncated = rows.length > maxRows;
  const capped = truncated ? rows.slice(0, maxRows) : rows;

  if (capped.length === 0) {
    onRowBatch({ columns, rows: [] });
  } else {
    for (let i = 0; i < capped.length; i += BATCH_SIZE) {
      onRowBatch({ columns: i === 0 ? columns : undefined, rows: capped.slice(i, i + BATCH_SIZE) });
    }
  }

  return { rowCount: capped.length, truncated };
}

module.exports = { emitRowBatches, BATCH_SIZE };
