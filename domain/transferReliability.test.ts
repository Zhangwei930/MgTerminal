import test from "node:test";
import assert from "node:assert/strict";

import {
  checksumsMatch,
  computeRetryBackoffMs,
  isPersistableTransfer,
  isTransferCancellationMessage,
  parsePersistedTransferQueue,
  resolveResumeOffset,
  serializeTransferQueue,
  shouldAutoRetry,
  TRANSFER_QUEUE_SCHEMA_VERSION,
} from "./transferReliability";
import type { TransferTask } from "./models";

const task = (overrides: Partial<TransferTask> = {}): TransferTask => ({
  id: "t1",
  fileName: "a.bin",
  sourcePath: "/local/a.bin",
  targetPath: "/remote/a.bin",
  sourceConnectionId: "local",
  targetConnectionId: "c1",
  direction: "upload",
  status: "failed",
  totalBytes: 1000,
  transferredBytes: 400,
  speed: 0,
  startTime: 1,
  isDirectory: false,
  ...overrides,
});

test("computeRetryBackoffMs grows exponentially and caps", () => {
  assert.equal(computeRetryBackoffMs(1), 1000);
  assert.equal(computeRetryBackoffMs(2), 2000);
  assert.equal(computeRetryBackoffMs(3), 4000);
  assert.equal(computeRetryBackoffMs(10), 30_000);
});

test("shouldAutoRetry respects limits and non-retryable cases", () => {
  assert.equal(shouldAutoRetry({ attemptCount: 0, maxAttempts: 3 }), true);
  assert.equal(shouldAutoRetry({ attemptCount: 3, maxAttempts: 3 }), false);
  assert.equal(shouldAutoRetry({ retryable: false }), false);
  assert.equal(shouldAutoRetry({ isDirectory: true }), false);
  assert.equal(shouldAutoRetry({ isCancelled: true }), false);
});

test("resolveResumeOffset prefers partial target size", () => {
  assert.equal(
    resolveResumeOffset({
      partialTargetBytes: 500,
      transferredBytes: 200,
      totalBytes: 1000,
      direction: "upload",
    }),
    500,
  );
  assert.equal(
    resolveResumeOffset({
      partialTargetBytes: 0,
      transferredBytes: 300,
      totalBytes: 1000,
      direction: "download",
    }),
    300,
  );
  assert.equal(
    resolveResumeOffset({
      partialTargetBytes: 1000,
      transferredBytes: 1000,
      totalBytes: 1000,
      direction: "upload",
    }),
    1000,
  );
  assert.equal(
    resolveResumeOffset({ direction: "remote-to-remote", transferredBytes: 50 }),
    0,
  );
});

test("serializeTransferQueue only keeps top-level retryable file tasks", () => {
  const queue = serializeTransferQueue([
    task({ id: "ok", status: "failed" }),
    task({ id: "child", parentTaskId: "p", status: "failed" }),
    task({ id: "dir", isDirectory: true, status: "failed" }),
    task({ id: "done", status: "completed" }),
    task({ id: "fly", status: "transferring", transferredBytes: 10 }),
  ]);
  assert.equal(queue.version, TRANSFER_QUEUE_SCHEMA_VERSION);
  assert.deepEqual(
    queue.tasks.map((t) => t.id).sort(),
    ["fly", "ok"],
  );
  const flying = queue.tasks.find((t) => t.id === "fly")!;
  assert.equal(flying.status, "failed");
  assert.match(flying.error || "", /Interrupted/);
});

test("parsePersistedTransferQueue rejects bad payloads", () => {
  assert.deepEqual(parsePersistedTransferQueue(null), []);
  assert.deepEqual(parsePersistedTransferQueue({ version: 99, tasks: [] }), []);
  const tasks = parsePersistedTransferQueue({
    version: TRANSFER_QUEUE_SCHEMA_VERSION,
    tasks: [task({ id: "x", status: "transferring" })],
  });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, "failed");
});

test("isPersistableTransfer and checksumsMatch helpers", () => {
  assert.equal(isPersistableTransfer(task()), true);
  assert.equal(isPersistableTransfer(task({ status: "completed" })), false);
  assert.equal(checksumsMatch("sha256:AbC", "ABC"), true);
  assert.equal(checksumsMatch("aaa", "bbb"), false);
  assert.equal(checksumsMatch(undefined, "x"), true);
});

// ── isTransferCancellationMessage ───────────────────────────────────────────
//
// Decides whether a failed transfer is reported as "cancelled" (silent, no
// error kept) or "failed" (toast + error recorded). Both misreadings cost the
// user something: a real error read as cancellation fails silently, and a
// cancellation read as an error raises a toast for something they chose to do.

test("recognises the cancellation wording the backends emit", () => {
  assert.equal(isTransferCancellationMessage("Transfer cancelled"), true);
  assert.equal(isTransferCancellationMessage("operation canceled"), true, "US spelling too");
  assert.equal(isTransferCancellationMessage("Download cancelled by user"), true);
});

test("a genuine failure is not read as cancellation", () => {
  assert.equal(isTransferCancellationMessage("Permission denied"), false);
  assert.equal(isTransferCancellationMessage("ENOSPC: no space left on device"), false);
  assert.equal(isTransferCancellationMessage(""), false);
});

test("non-string input is never cancellation", () => {
  assert.equal(isTransferCancellationMessage(undefined), false);
  assert.equal(isTransferCancellationMessage(null), false);
});

// The match is a plain substring test, which has two known soft spots. Both are
// pinned as current behaviour rather than fixed, since loosening or tightening
// the match changes which failures go silent.
test("the match is case-sensitive, so a capitalised cancellation reads as failure", () => {
  // A backend emitting "Cancelled by user" surfaces an error toast today.
  assert.equal(isTransferCancellationMessage("Cancelled by user"), false);
});

test("the word anywhere in the text counts, including inside a path", () => {
  // A real error mentioning such a path is reported as a cancellation and the
  // message is discarded.
  assert.equal(isTransferCancellationMessage("cannot write /var/cancelled-jobs/out"), true);
});
