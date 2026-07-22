import { useCallback, useEffect, useState } from 'react';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';

/**
 * A numeric pet setting (scale, opacity, ...) that's reactive across windows —
 * unlike useStoredNumber, this syncs via the native storage event so the pet
 * overlay window picks up changes made in the (separate) settings window.
 */
export function usePetNumberSetting(storageKey: string, fallback: number, clamp: { min: number; max: number }) {
  const read = useCallback(() => {
    const stored = localStorageAdapter.readNumber(storageKey);
    if (stored === null) return fallback;
    return Math.min(clamp.max, Math.max(clamp.min, stored));
  }, [storageKey, fallback, clamp.min, clamp.max]);

  const [value, setValueState] = useState<number>(() => read());

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      setValueState(read());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey, read]);

  const setValue = useCallback((next: number) => {
    const clamped = Math.min(clamp.max, Math.max(clamp.min, next));
    localStorageAdapter.writeNumber(storageKey, clamped);
    setValueState(clamped);
  }, [storageKey, clamp.min, clamp.max]);

  return [value, setValue] as const;
}
