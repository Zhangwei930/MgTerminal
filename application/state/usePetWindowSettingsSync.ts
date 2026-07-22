import { useEffect } from 'react';
import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';
import { useStoredBoolean } from './useStoredBoolean';
import { usePetNumberSetting } from './usePetNumberSetting';
import {
  STORAGE_KEY_AI_PET_OPACITY,
  STORAGE_KEY_AI_PET_ALWAYS_ON_TOP,
} from '../../infrastructure/config/storageKeys';

/**
 * Mounted once in the pet window itself: pushes the opacity/always-on-top
 * settings (edited in the separate Settings window) to this window's actual
 * BrowserWindow whenever they change, via the native cross-window storage sync.
 */
export function usePetWindowSettingsSync(): void {
  const [opacity] = usePetNumberSetting(STORAGE_KEY_AI_PET_OPACITY, 1, { min: 0.3, max: 1 });
  const [alwaysOnTop] = useStoredBoolean(STORAGE_KEY_AI_PET_ALWAYS_ON_TOP, true);

  useEffect(() => {
    magiesTerminalBridge.get()?.setPetOpacity?.(opacity);
  }, [opacity]);

  useEffect(() => {
    magiesTerminalBridge.get()?.setPetAlwaysOnTop?.(alwaysOnTop);
  }, [alwaysOnTop]);
}
