import test from "node:test";
import assert from "node:assert/strict";

import {
  checksumsMatch,
  computeRetryBackoffMs,
  isPersistableTransfer,
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
