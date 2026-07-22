import { useEffect, useState } from 'react';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import { STORAGE_KEY_AI_PET_STATE } from '../../infrastructure/config/storageKeys';
import type { PetStatus } from '../../domain/petStatus';

const VALID_PET_STATUSES: PetStatus[] = ['idle', 'running', 'waiting', 'done', 'failed'];

export interface PetStatusSnapshot {
  status: PetStatus;
  /** Name of the tool actively running, if any and if privacy mode allows sharing it. */
  toolName: string | null;
}

const IDLE_SNAPSHOT: PetStatusSnapshot = { status: 'idle', toolName: null };

function readSnapshot(): PetStatusSnapshot {
  const raw = localStorageAdapter.readString(STORAGE_KEY_AI_PET_STATE);
  if (!raw) return IDLE_SNAPSHOT;
  try {
    const parsed = JSON.parse(raw) as { status?: unknown; toolName?: unknown };
    return {
      status: VALID_PET_STATUSES.includes(parsed.status as PetStatus) ? (parsed.status as PetStatus) : 'idle',
      toolName: typeof parsed.toolName === 'string' && parsed.toolName ? parsed.toolName : null,
    };
  } catch {
    return IDLE_SNAPSHOT;
  }
}

/**
 * Reactive read of the desktop pet's current AI status (and active tool name,
 * when not in privacy mode), written by usePetStatusBroadcaster in the main
 * window and consumed here by the pet overlay window via the native
 * cross-window storage event.
 */
export function usePetStatusState(): PetStatusSnapshot {
  const [snapshot, setSnapshot] = useState<PetStatusSnapshot>(() => readSnapshot());

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY_AI_PET_STATE) return;
      setSnapshot(readSnapshot());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return snapshot;
}
