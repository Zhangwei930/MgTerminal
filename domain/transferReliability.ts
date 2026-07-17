// SFTP transfer reliability helpers (resume offset, auto-retry backoff,
// persistent queue serialization). Pure logic — no I/O.

import type { TransferDirection, TransferStatus, TransferTask } from "./models";

export const DEFAULT_MAX_AUTO_RETRIES = 3;
export const TRANSFER_QUEUE_SCHEMA_VERSION = 1;

/** Exponential backoff: 1s, 2s, 4s, … capped at 30s. attempt is 1-based. */
export const computeRetryBackoffMs = (attempt: number): number => {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(30_000, 1000 * 2 ** (n - 1));
};

export const shouldAutoRetry = ({
  status,
  attemptCount = 0,
  maxAttempts = DEFAULT_MAX_AUTO_RETRIES,
  retryable,
  isDirectory,
  isCancelled,
}: {
  status?: TransferStatus;
  attemptCount?: number;
  maxAttempts?: number;
  retryable?: boolean;
  isDirectory?: boolean;
  isCancelled?: boolean;
}): boolean => {
  if (isCancelled) return false;
  if (retryable === false) return false;
  if (isDirectory) return false;
  if (status === "cancelled") return false;
  return attemptCount < maxAttempts;
};

/**
 * Decide the byte offset to resume from. Prefer the partial target size when
 * it is a positive prefix of the total; otherwise fall back to last observed
 * transferred bytes. Returns 0 when resume is not safe.
 */
export const resolveResumeOffset = ({
  partialTargetBytes,
  transferredBytes,
  totalBytes,
  direction,
}: {
  partialTargetBytes?: number | null;
  transferredBytes?: number;
  totalBytes?: number;
  direction?: TransferDirection;
}): number => {
  // Directory / remote-to-remote copies cannot safely resume at byte level.
  if (direction === "remote-to-remote" || direction === "local-copy") return 0;

  const total = Number.isFinite(totalBytes) && (totalBytes as number) > 0
    ? (totalBytes as number)
    : 0;
  const observed = Number.isFinite(transferredBytes) && (transferredBytes as number) > 0
    ? Math.floor(transferredBytes as number)
    : 0;
  const partial = Number.isFinite(partialTargetBytes as number) && (partialTargetBytes as number) > 0
    ? Math.floor(partialTargetBytes as number)
    : 0;

  // Prefer on-disk partial size (authoritative after a crash / disconnect).
  let offset = partial > 0 ? partial : observed;
  if (total > 0) {
    // Already complete — no resume needed (caller should treat as done).
    if (offset >= total) return total;
    offset = Math.min(offset, total);
  }
  // Tiny leftovers are more likely corrupt than useful — restart.
  if (offset > 0 && offset < 4096 && total > 64 * 1024) return 0;
  return Math.max(0, offset);
};

export const isPersistableTransfer = (task: Pick<TransferTask, "status" | "isDirectory" | "retryable" | "parentTaskId">): boolean => {
  if (task.parentTaskId) return false;
  if (task.isDirectory) return false;
  if (task.retryable === false) return false;
  return task.status === "pending" || task.status === "transferring" || task.status === "failed";
};

export interface PersistedTransferQueue {
  version: number;
  savedAt: number;
  tasks: TransferTask[];
}

export const serializeTransferQueue = (tasks: TransferTask[]): PersistedTransferQueue => ({
  version: TRANSFER_QUEUE_SCHEMA_VERSION,
  savedAt: Date.now(),
  tasks: tasks
    .filter(isPersistableTransfer)
    .map((task) => ({
      ...task,
      // Never rehydrate mid-flight as "transferring" — user must re-arm.
      status: task.status === "transferring" ? "failed" : task.status,
      speed: 0,
      error:
        task.status === "transferring"
          ? task.error || "Interrupted — retry when connected"
          : task.error,
      endTime: task.endTime ?? Date.now(),
    })),
});

export const parsePersistedTransferQueue = (raw: unknown): TransferTask[] => {
  if (!raw || typeof raw !== "object") return [];
  const doc = raw as Partial<PersistedTransferQueue>;
  if (doc.version !== TRANSFER_QUEUE_SCHEMA_VERSION) return [];
  if (!Array.isArray(doc.tasks)) return [];
  return doc.tasks
    .filter((task): task is TransferTask => Boolean(task && typeof task === "object" && typeof (task as TransferTask).id === "string"))
    .map((task) => ({
      ...task,
      status: task.status === "transferring" ? "failed" : task.status,
      speed: 0,
      retryable: task.retryable !== false,
    }));
};

/** Optional post-transfer integrity: size match is required; digest is optional. */
export const checksumsMatch = (
  expected: string | undefined,
  actual: string | undefined,
): boolean => {
  if (!expected || !actual) return true;
  return expected.replace(/^sha256:/i, "").toLowerCase() ===
    actual.replace(/^sha256:/i, "").toLowerCase();
};
