import { useMemo } from "react";
import type { SftpFilenameEncoding, TransferTask } from "../../../domain/models";
import { magiesTerminalBridge } from "../../../infrastructure/services/magiesTerminalBridge";
import type { SftpPane } from "./types";
import { getParentPath, joinPath } from "./utils";

/**
 * How many " (copy N)" names to probe before falling back to a timestamp.
 * The ceiling exists so a target directory that somehow answers "taken" for
 * every candidate cannot spin forever.
 */
export const MAX_DUPLICATE_ATTEMPTS = 1000;

interface TargetStat {
  type?: "file" | "directory" | "symlink";
  size: number;
  mtime: number;
}

/**
 * Bridge calls these helpers need. Injected rather than reached for directly so
 * the conflict logic — which decides between renaming around a file and
 * deleting it — is testable without a React renderer or a live connection.
 */
export interface ConflictOpsDeps {
  statLocal?: (path: string) => Promise<{ type?: string; size: number; lastModified?: number } | null | undefined>;
  statSftp?: (
    sftpId: string,
    path: string,
    encoding: SftpFilenameEncoding,
  ) => Promise<{ type?: string; size: number; lastModified?: number } | null | undefined>;
  deleteLocalFile?: (path: string) => Promise<unknown>;
  deleteSftp?: (sftpId: string, path: string, encoding: SftpFilenameEncoding) => Promise<unknown>;
}

export function splitNameForDuplicate(fileName: string, isDirectory: boolean) {
  if (isDirectory) return { baseName: fileName, ext: "" };
  const lastDot = fileName.lastIndexOf(".");
  // `<= 0` also covers dotfiles: ".bashrc" has its dot at index 0, and
  // splitting there would yield an empty base name.
  if (lastDot <= 0) return { baseName: fileName, ext: "" };
  return {
    baseName: fileName.slice(0, lastDot),
    ext: fileName.slice(lastDot),
  };
}

export async function statTargetPath(
  deps: ConflictOpsDeps,
  targetPane: SftpPane,
  targetSftpId: string | null,
  targetPath: string,
  targetEncoding: SftpFilenameEncoding,
): Promise<TargetStat | null> {
  if (!targetPane.connection) return null;

  const stat = targetPane.connection.isLocal
    ? await deps.statLocal?.(targetPath)
    : targetSftpId
      ? await deps.statSftp?.(targetSftpId, targetPath, targetEncoding)
      : null;

  if (!stat) return null;
  return {
    type: stat.type as TargetStat["type"],
    size: stat.size,
    mtime: stat.lastModified || Date.now(),
  };
}

export async function getDuplicateTarget(
  deps: ConflictOpsDeps,
  task: TransferTask,
  targetPane: SftpPane,
  targetSftpId: string | null,
  targetEncoding: SftpFilenameEncoding,
) {
  const parentPath = getParentPath(task.targetPath);
  const { baseName, ext } = splitNameForDuplicate(task.fileName, task.isDirectory);

  for (let index = 1; index < MAX_DUPLICATE_ATTEMPTS; index++) {
    const suffix = index === 1 ? " (copy)" : ` (copy ${index})`;
    const fileName = `${baseName}${suffix}${ext}`;
    const targetPath = joinPath(parentPath, fileName);
    try {
      const existing = await statTargetPath(deps, targetPane, targetSftpId, targetPath, targetEncoding);
      if (!existing) return { fileName, targetPath };
    } catch {
      // A failed stat is taken as "nothing there". Note this cannot distinguish
      // absence from a transport error, so a connection blip can hand back a
      // name that is in fact occupied.
      return { fileName, targetPath };
    }
  }

  const fallbackName = `${baseName} (copy ${Date.now()})${ext}`;
  return { fileName: fallbackName, targetPath: joinPath(parentPath, fallbackName) };
}

export async function deleteTargetPath(
  deps: ConflictOpsDeps,
  task: TransferTask,
  targetPane: SftpPane,
  targetSftpId: string | null,
  targetEncoding: SftpFilenameEncoding,
) {
  if (!targetPane.connection) return;
  if (targetPane.connection.isLocal) {
    if (!deps.deleteLocalFile) throw new Error("Local delete unavailable");
    await deps.deleteLocalFile(task.targetPath);
    return;
  }
  // Throwing beats skipping: the caller treats a resolved delete as "the old
  // file is gone" and transfers on top of that assumption.
  if (!targetSftpId) throw new Error("Target SFTP session not found");
  if (!deps.deleteSftp) throw new Error("SFTP delete unavailable");
  await deps.deleteSftp(targetSftpId, task.targetPath, targetEncoding);
}

export function useSftpTransferConflictOps() {
  // Resolved per call, not once: the bridge may not be ready when this hook
  // first runs. A missing stat resolves to null (nothing there) while a missing
  // delete throws, matching what each caller can safely assume.
  const deps: ConflictOpsDeps = useMemo(
    () => ({
      statLocal: async (path) => magiesTerminalBridge.get()?.statLocal?.(path) ?? null,
      statSftp: async (sftpId, path, encoding) =>
        magiesTerminalBridge.get()?.statSftp?.(sftpId, path, encoding) ?? null,
      deleteLocalFile: (path) => {
        const del = magiesTerminalBridge.get()?.deleteLocalFile;
        if (!del) throw new Error("Local delete unavailable");
        return del(path);
      },
      deleteSftp: (sftpId, path, encoding) => {
        const del = magiesTerminalBridge.get()?.deleteSftp;
        if (!del) throw new Error("SFTP delete unavailable");
        return del(sftpId, path, encoding);
      },
    }),
    [],
  );

  return useMemo(
    () => ({
      statTargetPath: (
        targetPane: SftpPane,
        targetSftpId: string | null,
        targetPath: string,
        targetEncoding: SftpFilenameEncoding,
      ) => statTargetPath(deps, targetPane, targetSftpId, targetPath, targetEncoding),
      getDuplicateTarget: (
        task: TransferTask,
        targetPane: SftpPane,
        targetSftpId: string | null,
        targetEncoding: SftpFilenameEncoding,
      ) => getDuplicateTarget(deps, task, targetPane, targetSftpId, targetEncoding),
      deleteTargetPath: (
        task: TransferTask,
        targetPane: SftpPane,
        targetSftpId: string | null,
        targetEncoding: SftpFilenameEncoding,
      ) => deleteTargetPath(deps, task, targetPane, targetSftpId, targetEncoding),
    }),
    [deps],
  );
}
