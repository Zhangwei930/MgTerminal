import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReplaceTypeMismatchError,
  conflictDefaultKey,
  isTransferCancelledError,
  probePartialTargetBytes,
  resolveTaskEndpoints,
} from "./useSftpTransfers.ts";
import type { PartialProbeDeps } from "./useSftpTransfers.ts";
import type { SftpPane } from "./types.ts";
import type { TransferTask } from "../../../domain/models.ts";

const task = (overrides: Partial<TransferTask> = {}): TransferTask =>
  ({
    id: "t1",
    fileName: "dump.sql",
    targetPath: "/backup/dump.sql",
    sourceConnectionId: "src",
    targetConnectionId: "dst",
    isDirectory: false,
    ...overrides,
  }) as TransferTask;

const pane = (isLocal: boolean | null, filenameEncoding?: string): SftpPane =>
  ({
    connection: isLocal === null ? null : { isLocal },
    filenameEncoding,
  }) as unknown as SftpPane;

// ── isTransferCancelledError ────────────────────────────────────────────────
// Cancellation travels as a thrown Error with an exact message. Everything that
// is not that must stay a genuine failure — swallowing a real error as
// "cancelled" would report a broken transfer as one the user stopped.

test("only the exact cancellation error counts as cancellation", () => {
  assert.equal(isTransferCancelledError(new Error("Transfer cancelled")), true);
});

test("other errors are not mistaken for cancellation", () => {
  assert.equal(isTransferCancelledError(new Error("Permission denied")), false);
  assert.equal(isTransferCancelledError(new Error("transfer cancelled")), false, "case matters");
  assert.equal(isTransferCancelledError(new Error("Transfer cancelled by peer")), false);
  assert.equal(isTransferCancelledError("Transfer cancelled"), false, "a bare string is not an Error");
  assert.equal(isTransferCancelledError(null), false);
  assert.equal(isTransferCancelledError(undefined), false);
});

// ── conflictDefaultKey ──────────────────────────────────────────────────────
// Scopes a remembered "apply to all" choice. Two conflicts sharing a key share
// the decision, so batch and kind both have to be part of it.

test("a remembered choice does not leak across batches", () => {
  assert.notEqual(conflictDefaultKey("batch-1", false, "file"), conflictDefaultKey("batch-2", false, "file"));
});

test("a remembered choice does not leak across conflict kinds", () => {
  assert.notEqual(conflictDefaultKey("batch-1", false, "file"), conflictDefaultKey("batch-1", true, "file"));
  assert.notEqual(conflictDefaultKey("batch-1", false, "file"), conflictDefaultKey("batch-1", false, "directory"));
});

test("the same batch and kind reuse one key", () => {
  assert.equal(conflictDefaultKey("batch-1", false, "file"), conflictDefaultKey("batch-1", false, "file"));
});

test("transfers with no batch share a global scope", () => {
  assert.equal(conflictDefaultKey(undefined, false, "file"), "global:file:file");
});

// ── buildReplaceTypeMismatchError ───────────────────────────────────────────

test("the mismatch error names both kinds and the path", () => {
  const message = buildReplaceTypeMismatchError(false, "directory", "/backup/data");
  assert.match(message, /existing directory/);
  assert.match(message, /with file/);
  assert.match(message, /\/backup\/data/);
});

test("the mismatch error describes a symlink as a file", () => {
  // Matches describeSftpExistingKind; pinned so the wording is a decision.
  assert.match(buildReplaceTypeMismatchError(true, "symlink", "/x"), /existing file with directory/);
});

// ── resolveTaskEndpoints ────────────────────────────────────────────────────

test("resolveTaskEndpoints returns both sides when each tab is connected", () => {
  const sourceTab = { side: "left", pane: pane(true) };
  const targetTab = { side: "right", pane: pane(false) };
  const result = resolveTaskEndpoints(
    (id: string) => (id === "src" ? sourceTab : targetTab),
    task(),
  );

  assert.equal(result?.sourceSide, "left");
  assert.equal(result?.targetSide, "right");
  assert.equal(result?.sourcePane, sourceTab.pane);
  assert.equal(result?.targetPane, targetTab.pane);
});

test("resolveTaskEndpoints returns null when either tab is missing", () => {
  assert.equal(resolveTaskEndpoints(() => null, task()), null);
  assert.equal(
    resolveTaskEndpoints((id: string) => (id === "src" ? { side: "left", pane: pane(true) } : null), task()),
    null,
  );
});

test("resolveTaskEndpoints returns null when a tab exists but is disconnected", () => {
  const result = resolveTaskEndpoints(
    () => ({ side: "left", pane: pane(null) }),
    task(),
  );
  assert.equal(result, null, "a disconnected pane cannot be an endpoint");
});

// ── probePartialTargetBytes ─────────────────────────────────────────────────
// Decides the byte offset a resumed transfer restarts from. A wrong non-zero
// answer writes new data at the wrong position and corrupts the file, so every
// uncertain case must fall back to 0 (start over).

function makeProbeDeps(overrides: Partial<PartialProbeDeps> = {}): PartialProbeDeps {
  return {
    statLocal: async () => ({ size: 512 }),
    statSftp: async () => ({ size: 1024 }),
    getSftpId: () => "sftp-1",
    ...overrides,
  };
}

test("a download probes the local target", async () => {
  const bytes = await probePartialTargetBytes(makeProbeDeps(), task({ direction: "download" }), pane(false));
  assert.equal(bytes, 512);
});

test("a local target pane probes locally even without a download direction", async () => {
  const bytes = await probePartialTargetBytes(makeProbeDeps(), task(), pane(true));
  assert.equal(bytes, 512);
});

test("a target connection id of 'local' probes locally", async () => {
  const bytes = await probePartialTargetBytes(
    makeProbeDeps(), task({ targetConnectionId: "local" }), pane(false),
  );
  assert.equal(bytes, 512);
});

test("a remote target probes over sftp with the pane's encoding", async () => {
  let seenEncoding: string | undefined;
  const deps = makeProbeDeps({
    statSftp: async (_id, _path, encoding) => { seenEncoding = encoding; return { size: 1024 }; },
  });

  const bytes = await probePartialTargetBytes(deps, task(), pane(false, "gb18030"));
  assert.equal(bytes, 1024);
  assert.equal(seenEncoding, "gb18030");
});

test("a remote probe defaults the encoding to auto", async () => {
  let seenEncoding: string | undefined;
  const deps = makeProbeDeps({
    statSftp: async (_id, _path, encoding) => { seenEncoding = encoding; return { size: 1024 }; },
  });

  await probePartialTargetBytes(deps, task(), pane(false));
  assert.equal(seenEncoding, "auto");
});

test("no sftp session means restart from zero, not resume blindly", async () => {
  const deps = makeProbeDeps({ getSftpId: () => undefined });
  assert.equal(await probePartialTargetBytes(deps, task(), pane(false)), 0);
});

test("a failing stat restarts from zero", async () => {
  const deps = makeProbeDeps({ statLocal: async () => { throw new Error("ENOENT"); } });
  assert.equal(await probePartialTargetBytes(deps, task(), pane(true)), 0);
});

test("a missing or zero size restarts from zero", async () => {
  for (const stat of [null, undefined, { size: 0 }, {}]) {
    const deps = makeProbeDeps({ statLocal: async () => stat as { size: number } });
    assert.equal(await probePartialTargetBytes(deps, task(), pane(true)), 0, `stat=${JSON.stringify(stat)}`);
  }
});

test("a negative or non-numeric size restarts from zero", async () => {
  // Resuming at a negative offset is worse than starting over.
  for (const size of [-1, NaN, "512" as unknown as number]) {
    const deps = makeProbeDeps({ statLocal: async () => ({ size }) });
    assert.equal(await probePartialTargetBytes(deps, task(), pane(true)), 0, `size=${String(size)}`);
  }
});
