import type { Dispatch, SetStateAction } from "react";
import type { FileConflict, FileConflictAction } from "../../../domain/models";
import { getSftpConflictTypeKey } from "../../../domain/sftpConflict";

/**
 * Coordinates the prompt-and-wait cycle for upload conflicts.
 *
 * An upload that hits an existing path parks a promise here, surfaces a
 * FileConflict to the UI, and resumes once the user answers. Two properties
 * matter: every parked promise must eventually settle (otherwise the upload
 * loop waits forever), and a remembered "apply to all" choice must apply only
 * to the kind of clash it was made about.
 */

export interface UploadConflictResolver {
  resolve: (action: FileConflictAction) => void;
  setDefault: (action: FileConflictAction) => void;
}

export interface UploadConflictDeps {
  setConflicts: Dispatch<SetStateAction<FileConflict[]>>;
  resolvers: Map<string, UploadConflictResolver>;
  newConflictId?: () => string;
}

export interface IncomingUploadConflict {
  fileName: string;
  targetPath: string;
  isDirectory: boolean;
  existingType?: "file" | "directory" | "symlink";
  existingSize: number;
  newSize: number;
  existingModified: number;
  newModified: number;
  applyToAllCount: number;
}

/**
 * Answers from `conflictDefaults` when this kind of clash was already decided,
 * otherwise surfaces the conflict and waits.
 */
export function requestUploadConflictDecision(
  deps: UploadConflictDeps,
  conflictDefaults: Map<string, FileConflictAction>,
  conflict: IncomingUploadConflict,
): Promise<FileConflictAction> {
  const conflictType = getSftpConflictTypeKey(conflict.isDirectory, conflict.existingType);
  const defaultAction = conflictDefaults.get(conflictType);
  if (defaultAction) return Promise.resolve(defaultAction);

  const conflictId = deps.newConflictId
    ? deps.newConflictId()
    : `upload-conflict-${crypto.randomUUID()}`;

  const fileConflict: FileConflict = {
    transferId: conflictId,
    fileName: conflict.fileName,
    sourcePath: "local",
    targetPath: conflict.targetPath,
    isDirectory: conflict.isDirectory,
    existingType: conflict.existingType,
    applyToAllCount: conflict.applyToAllCount,
    existingSize: conflict.existingSize,
    newSize: conflict.newSize,
    existingModified: conflict.existingModified,
    newModified: conflict.newModified,
  };

  deps.setConflicts((prev) => [...prev, fileConflict]);
  return new Promise<FileConflictAction>((resolve) => {
    deps.resolvers.set(conflictId, {
      resolve,
      setDefault: (action) => {
        conflictDefaults.set(conflictType, action);
      },
    });
  });
}

/**
 * Applies the user's answer. `conflicts` is the currently surfaced list —
 * `applyToAll` is honoured only when the conflict is still in it, so a stale
 * list quietly downgrades "apply to all" to a one-off.
 */
export function resolveUploadConflict(
  deps: UploadConflictDeps,
  conflicts: FileConflict[],
  conflictId: string,
  action: FileConflictAction,
  applyToAll = false,
): void {
  const conflict = conflicts.find((item) => item.transferId === conflictId);
  deps.setConflicts((prev) => prev.filter((item) => item.transferId !== conflictId));
  const resolver = deps.resolvers.get(conflictId);
  if (!resolver) return;
  // Delete before resolving so a second call cannot settle the same promise.
  deps.resolvers.delete(conflictId);
  if (conflict && applyToAll) {
    resolver.setDefault(action);
  }
  resolver.resolve(action);
}

/** Settles every parked conflict with "stop" so no upload is left waiting. */
export function cancelPendingUploadConflicts(deps: UploadConflictDeps): void {
  const resolvers = Array.from(deps.resolvers.values());
  if (resolvers.length === 0) return;

  deps.resolvers.clear();
  deps.setConflicts([]);
  for (const resolver of resolvers) {
    resolver.resolve("stop");
  }
}
