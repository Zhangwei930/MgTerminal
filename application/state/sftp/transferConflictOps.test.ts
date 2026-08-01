import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DUPLICATE_ATTEMPTS,
  isPathNotFoundError,
  deleteTargetPath,
  getDuplicateTarget,
  splitNameForDuplicate,
  statTargetPath,
} from "./transferConflictOps.ts";
import type { ConflictOpsDeps } from "./transferConflictOps.ts";
import type { SftpPane } from "./types.ts";
import type { TransferTask } from "../../../domain/models.ts";

const pane = (isLocal: boolean, connected = true): SftpPane =>
  ({ connection: connected ? { isLocal } : null }) as unknown as SftpPane;

const task = (overrides: Partial<TransferTask> = {}): TransferTask =>
  ({
    id: "t1",
    fileName: "report.csv",
    targetPath: "/dest/report.csv",
    isDirectory: false,
    ...overrides,
  }) as TransferTask;

/** Deps whose stat resolves for exactly the paths listed in `existing`. */
function makeDeps(existing: string[] = [], overrides: Partial<ConflictOpsDeps> = {}): ConflictOpsDeps & {
  deletedLocal: string[];
  deletedRemote: { sftpId: string; path: string }[];
  statCalls: string[];
} {
  const deletedLocal: string[] = [];
  const deletedRemote: { sftpId: string; path: string }[] = [];
  const statCalls: string[] = [];
  const stat = async (path: string) => {
    statCalls.push(path);
    return existing.includes(path)
      ? { type: "file" as const, size: 1, lastModified: 100 }
      : null;
  };
  return {
    deletedLocal,
    deletedRemote,
    statCalls,
    statLocal: stat,
    statSftp: async (_id: string, path: string) => stat(path),
    deleteLocalFile: async (path: string) => { deletedLocal.push(path); },
    deleteSftp: async (sftpId: string, path: string) => { deletedRemote.push({ sftpId, path }); },
    ...overrides,
  };
}

// ── splitNameForDuplicate ───────────────────────────────────────────────────

test("splitNameForDuplicate separates the final extension", () => {
  assert.deepEqual(splitNameForDuplicate("report.csv", false), { baseName: "report", ext: ".csv" });
});

test("splitNameForDuplicate keeps a directory name whole", () => {
  assert.deepEqual(splitNameForDuplicate("backup.d", true), { baseName: "backup.d", ext: "" });
});

test("splitNameForDuplicate treats a dotfile as having no extension", () => {
  // lastIndexOf(".") is 0 here — splitting would produce an empty base name and
  // a copy called " (copy).bashrc".
  assert.deepEqual(splitNameForDuplicate(".bashrc", false), { baseName: ".bashrc", ext: "" });
});

test("splitNameForDuplicate handles a name with no dot at all", () => {
  assert.deepEqual(splitNameForDuplicate("Makefile", false), { baseName: "Makefile", ext: "" });
});

test("splitNameForDuplicate splits only the last extension of a double one", () => {
  // "archive.tar" + ".gz" — so the copy is "archive.tar (copy).gz". Pinned
  // because the alternative (treating .tar.gz as one unit) is a plausible
  // future change that would alter file names users already have.
  assert.deepEqual(splitNameForDuplicate("archive.tar.gz", false), { baseName: "archive.tar", ext: ".gz" });
});

// ── statTargetPath ──────────────────────────────────────────────────────────

test("statTargetPath returns null when the pane has no connection", async () => {
  const deps = makeDeps(["/dest/x"]);
  assert.equal(await statTargetPath(deps, pane(true, false), null, "/dest/x", "utf-8"), null);
  assert.deepEqual(deps.statCalls, [], "a disconnected pane must not be probed");
});

test("statTargetPath uses the local stat for a local pane", async () => {
  const deps = makeDeps(["/dest/x"]);
  const stat = await statTargetPath(deps, pane(true), null, "/dest/x", "utf-8");
  assert.equal(stat?.type, "file");
  assert.equal(stat?.size, 1);
  assert.equal(stat?.mtime, 100);
});

test("statTargetPath needs an sftp id for a remote pane", async () => {
  const deps = makeDeps(["/dest/x"]);
  assert.equal(await statTargetPath(deps, pane(false), null, "/dest/x", "utf-8"), null);
  assert.deepEqual(deps.statCalls, []);
});

test("statTargetPath falls back to now when the target has no mtime", async () => {
  const deps = makeDeps([], {
    statLocal: async () => ({ type: "file" as const, size: 5, lastModified: 0 }),
  });
  const before = Date.now();
  const stat = await statTargetPath(deps, pane(true), null, "/dest/x", "utf-8");
  assert.ok((stat?.mtime ?? 0) >= before);
});

// ── getDuplicateTarget ──────────────────────────────────────────────────────

test("getDuplicateTarget uses ' (copy)' when that name is free", async () => {
  const deps = makeDeps(["/dest/report.csv"]);
  const result = await getDuplicateTarget(deps, task(), pane(true), null, "utf-8");

  assert.equal(result.fileName, "report (copy).csv");
  assert.equal(result.targetPath, "/dest/report (copy).csv");
});

test("getDuplicateTarget counts up past names already taken", async () => {
  const deps = makeDeps([
    "/dest/report.csv",
    "/dest/report (copy).csv",
    "/dest/report (copy 2).csv",
  ]);
  const result = await getDuplicateTarget(deps, task(), pane(true), null, "utf-8");

  assert.equal(result.fileName, "report (copy 3).csv");
});

test("getDuplicateTarget keeps a directory name intact", async () => {
  const deps = makeDeps(["/dest/backup"]);
  const result = await getDuplicateTarget(
    deps,
    task({ fileName: "backup", targetPath: "/dest/backup", isDirectory: true }),
    pane(true), null, "utf-8",
  );

  assert.equal(result.fileName, "backup (copy)");
});

test("getDuplicateTarget gives up after the attempt ceiling and uses a timestamp", async () => {
  // Every candidate is taken, so the loop must terminate rather than spin.
  const deps = makeDeps([], { statLocal: async () => ({ type: "file" as const, size: 1, lastModified: 1 }) });
  const result = await getDuplicateTarget(deps, task(), pane(true), null, "utf-8");

  assert.match(result.fileName, /^report \(copy \d{10,}\)\.csv$/);
  assert.equal(deps.statCalls.length, 0, "the override replaced the counting stat");
  assert.ok(MAX_DUPLICATE_ATTEMPTS > 0);
});

// ── deleteTargetPath ────────────────────────────────────────────────────────

test("deleteTargetPath deletes through the local bridge", async () => {
  const deps = makeDeps();
  await deleteTargetPath(deps, task(), pane(true), null, "utf-8");

  assert.deepEqual(deps.deletedLocal, ["/dest/report.csv"]);
  assert.deepEqual(deps.deletedRemote, []);
});

test("deleteTargetPath deletes through the sftp bridge with the session id", async () => {
  const deps = makeDeps();
  await deleteTargetPath(deps, task(), pane(false), "sftp-1", "utf-8");

  assert.deepEqual(deps.deletedRemote, [{ sftpId: "sftp-1", path: "/dest/report.csv" }]);
  assert.deepEqual(deps.deletedLocal, []);
});

test("deleteTargetPath does nothing when the pane is disconnected", async () => {
  const deps = makeDeps();
  await deleteTargetPath(deps, task(), pane(true, false), null, "utf-8");

  assert.deepEqual(deps.deletedLocal, []);
  assert.deepEqual(deps.deletedRemote, []);
});

test("deleteTargetPath throws rather than silently skipping a remote delete", async () => {
  const deps = makeDeps();
  // No sftp id: the caller believes the old file is gone and proceeds to
  // transfer, so failing loudly is the only safe option.
  await assert.rejects(
    () => deleteTargetPath(deps, task(), pane(false), null, "utf-8"),
    /session not found/i,
  );
});

test("deleteTargetPath throws when the bridge cannot delete", async () => {
  await assert.rejects(
    () => deleteTargetPath(makeDeps([], { deleteLocalFile: undefined }), task(), pane(true), null, "utf-8"),
    /unavailable/i,
  );
  await assert.rejects(
    () => deleteTargetPath(makeDeps([], { deleteSftp: undefined }), task(), pane(false), "s1", "utf-8"),
    /unavailable/i,
  );
});

// ── isPathNotFoundError ─────────────────────────────────────────────────────
//
// Separates "the target genuinely is not there" from "the probe failed". Only
// the first makes a candidate name safe to use. Recognition is a strict
// allowlist: anything unrecognised must read as false, because a false
// positive here is what leads to overwriting a real file.

test("a local ENOENT is recognised as not-found", () => {
  assert.equal(isPathNotFoundError(new Error("ENOENT: no such file or directory, stat '/x'")), true);
  assert.equal(isPathNotFoundError(Object.assign(new Error("boom"), { code: "ENOENT" })), true);
});

test("an sftp NO_SUCH_FILE is recognised as not-found", () => {
  // ssh2 maps STATUS_CODE.NO_SUCH_FILE to exactly this text.
  assert.equal(isPathNotFoundError(new Error("No such file or directory")), true);
});

test("an IPC-wrapped message is still recognised", () => {
  assert.equal(
    isPathNotFoundError(new Error(
      "Error invoking remote method 'magiesTerminal:local:stat': Error: ENOENT: no such file or directory, stat '/x'",
    )),
    true,
  );
});

test("a dead session is NOT treated as a missing file", () => {
  // statSftp throws exactly this when the session is gone. Reading it as
  // not-found would hand back a name that may well be occupied.
  assert.equal(isPathNotFoundError(new Error("SFTP session not found")), false);
});

test("transport and permission failures are not not-found", () => {
  for (const message of [
    "ECONNRESET",
    "Permission denied",
    "EACCES: permission denied",
    "Timed out",
    "Bridge not available",
  ]) {
    assert.equal(isPathNotFoundError(new Error(message)), false, message);
  }
});

test("non-errors are not not-found", () => {
  assert.equal(isPathNotFoundError(null), false);
  assert.equal(isPathNotFoundError(undefined), false);
  assert.equal(isPathNotFoundError("ENOENT"), false);
});

// ── getDuplicateTarget: probe failures ──────────────────────────────────────

test("a confirmed-missing candidate is used directly", async () => {
  const deps = makeDeps([], {
    statLocal: async () => { throw new Error("ENOENT: no such file or directory, stat '/x'"); },
  });
  const result = await getDuplicateTarget(deps, task(), pane(true), null, "utf-8");

  assert.equal(result.fileName, "report (copy).csv", "not-found means the name is free");
});

// This is the fix: a probe that fails for any other reason is not evidence of
// absence, so the name it was checking cannot be trusted.
test("an unexplained probe failure falls back to a timestamped name", async () => {
  const deps = makeDeps([], {
    statLocal: async () => { throw new Error("ECONNRESET"); },
  });
  const result = await getDuplicateTarget(deps, task(), pane(true), null, "utf-8");

  assert.match(
    result.fileName,
    /^report \(copy \d{10,}\)\.csv$/,
    "a blip must not hand back ' (copy)', which may already exist",
  );
  assert.notEqual(result.fileName, "report (copy).csv");
});

test("a dead session falls back rather than claiming the name is free", async () => {
  const deps = makeDeps([], {
    statSftp: async () => { throw new Error("SFTP session not found"); },
  });
  const result = await getDuplicateTarget(deps, task(), pane(false), "sftp-1", "utf-8");

  assert.match(result.fileName, /^report \(copy \d{10,}\)\.csv$/);
});

test("the fallback path is still a sibling of the original target", async () => {
  const deps = makeDeps([], {
    statLocal: async () => { throw new Error("ECONNRESET"); },
  });
  const result = await getDuplicateTarget(deps, task(), pane(true), null, "utf-8");

  assert.equal(result.targetPath, `/dest/${result.fileName}`);
});

test("a mid-search failure falls back instead of using the current candidate", async () => {
  // First candidate exists, second probe blows up: the second name is unknown,
  // so it must not be used just because the probe did not resolve.
  let call = 0;
  const deps = makeDeps([], {
    statLocal: async () => {
      call += 1;
      if (call === 1) return { type: "file" as const, size: 1, lastModified: 1 };
      throw new Error("ECONNRESET");
    },
  });
  const result = await getDuplicateTarget(deps, task(), pane(true), null, "utf-8");

  assert.match(result.fileName, /^report \(copy \d{10,}\)\.csv$/);
});
