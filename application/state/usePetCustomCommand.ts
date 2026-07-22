import { useCallback, useEffect, useState } from 'react';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import { STORAGE_KEY_AI_PET_CUSTOM_COMMAND } from '../../infrastructure/config/storageKeys';

function readCommand(): string {
  return localStorageAdapter.readString(STORAGE_KEY_AI_PET_CUSTOM_COMMAND) ?? '';
}

/**
 * The single fixed command line the pet's right-click menu can run (Settings → AI → Pet).
 * Reactive so the pet window picks up edits made in the (separate) settings window.
 */
export function usePetCustomCommand() {
  const [command, setCommandState] = useState(() => readCommand());

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY_AI_PET_CUSTOM_COMMAND) return;
      setCommandState(readCommand());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setCommand = useCallback((value: string) => {
    localStorageAdapter.writeString(STORAGE_KEY_AI_PET_CUSTOM_COMMAND, value);
    setCommandState(value);
  }, []);

  return [command, setCommand] as const;
}
