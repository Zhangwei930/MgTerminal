import { useCallback, useEffect, useState } from 'react';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';
import { STORAGE_KEY_AI_PET_IMAGE } from '../../infrastructure/config/storageKeys';
import { clampSpriteGrid, type PetFrameRangesByStatus } from '../../domain/petSprite';

export const DEFAULT_PET_IMAGE_URL = '/ai/pet/pet-default.png';

export interface PetImageConfig {
  /** data: URL for the current frame source (single image, or a cols x rows sprite sheet). */
  dataUrl: string;
  cols: number;
  rows: number;
  frameRanges?: PetFrameRangesByStatus;
}

/**
 * Metadata persisted in localStorage — small and quota-safe. The actual image
 * bytes live on disk (userData/pet-assets/, see electron/bridges/petImageBridge.cjs)
 * and are fetched over IPC; `version` tells other windows (and this one, on the
 * initial mount after an upload) when to re-fetch them.
 */
interface PetImageMeta {
  cols: number;
  rows: number;
  frameRanges?: PetFrameRangesByStatus;
  version: number;
}

function readMeta(): PetImageMeta | null {
  const stored = localStorageAdapter.read<Partial<PetImageMeta>>(STORAGE_KEY_AI_PET_IMAGE);
  if (!stored || typeof stored.version !== 'number') return null;
  const grid = clampSpriteGrid({ cols: stored.cols, rows: stored.rows });
  return { cols: grid.cols, rows: grid.rows, frameRanges: stored.frameRanges, version: stored.version };
}

function writeMeta(meta: PetImageMeta): boolean {
  return localStorageAdapter.write<PetImageMeta>(STORAGE_KEY_AI_PET_IMAGE, meta);
}

/**
 * Reactive access to the desktop pet's custom image config (Settings → AI → Pet).
 * Absent config means "use the built-in default pet". The settings window and the
 * pet overlay window are separate BrowserWindows: metadata syncs via the native
 * cross-window storage event (same as the rest of the pet's settings), and a
 * metadata change re-fetches the image bytes from disk over IPC.
 */
export function usePetImageConfig() {
  const [meta, setMeta] = useState<PetImageMeta | null>(() => readMeta());
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY_AI_PET_IMAGE) return;
      setMeta(readMeta());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!meta) {
      setDataUrl(null);
      return;
    }
    void magiesTerminalBridge.get()?.readPetImage?.().then((result) => {
      if (cancelled) return;
      setDataUrl(result?.success && result.dataUrl ? result.dataUrl : null);
    });
    return () => { cancelled = true; };
  }, [meta]);

  /** Uploads a new image (raw data URL). Returns false if saving to disk or metadata failed. */
  const setImage = useCallback(async (rawDataUrl: string, cols: number, rows: number): Promise<boolean> => {
    const saveResult = await magiesTerminalBridge.get()?.savePetImage?.(rawDataUrl);
    if (!saveResult?.success) return false;
    const grid = clampSpriteGrid({ cols, rows });
    const nextMeta: PetImageMeta = { cols: grid.cols, rows: grid.rows, version: (meta?.version ?? 0) + 1 };
    if (!writeMeta(nextMeta)) return false;
    setMeta(nextMeta);
    return true;
  }, [meta]);

  const resetImage = useCallback(async () => {
    await magiesTerminalBridge.get()?.clearPetImage?.();
    localStorageAdapter.remove(STORAGE_KEY_AI_PET_IMAGE);
    setMeta(null);
  }, []);

  const setFrameRanges = useCallback((frameRanges: PetFrameRangesByStatus): boolean => {
    if (!meta) return false;
    const nextMeta: PetImageMeta = { ...meta, frameRanges };
    if (!writeMeta(nextMeta)) return false;
    setMeta(nextMeta);
    return true;
  }, [meta]);

  const image: PetImageConfig | null = meta && dataUrl
    ? { dataUrl, cols: meta.cols, rows: meta.rows, frameRanges: meta.frameRanges }
    : null;
  /** True while metadata exists but the image bytes haven't loaded from disk yet. */
  const isLoading = Boolean(meta) && !dataUrl;

  return { image, isLoading, setImage, resetImage, setFrameRanges } as const;
}
