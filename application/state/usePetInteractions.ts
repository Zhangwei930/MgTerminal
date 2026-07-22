import { useCallback, useEffect } from 'react';
import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';
import { parseCommandString } from '../../domain/petCommand';

/** Left-click: bring the main window forward and open its AI chat panel. */
export function useOpenAiPanelFromPet(): () => void {
  return useCallback(() => {
    void magiesTerminalBridge.get()?.openAiPanelFromPet?.();
  }, []);
}

/** Double-click: bring the main window forward (reuses the tray panel's "open main window" IPC). */
export function useFocusMainWindowFromPet(): () => void {
  return useCallback(() => {
    void magiesTerminalBridge.get()?.openMainWindow?.();
  }, []);
}

/** Right-click: ask the main process to build and pop up the pet's native context menu. */
export function useShowPetContextMenu(customCommand: string): () => void {
  return useCallback(() => {
    const argv = customCommand.trim() ? parseCommandString(customCommand) : null;
    void magiesTerminalBridge.get()?.showPetContextMenu?.(argv);
  }, [customCommand]);
}

/** Subscribes to the "Hide Pet" context-menu action so the pet window can disable itself. */
export function usePetHideRequested(onHide: () => void): void {
  useEffect(() => magiesTerminalBridge.get()?.onPetHideRequested?.(onHide), [onHide]);
}

/** Settings → AI → Pet "Test Run": launches a command string and reports whether it started cleanly. */
export function useTestPetCommand(): (commandString: string) => Promise<{ success: boolean; error?: string }> {
  return useCallback(async (commandString: string) => {
    const argv = parseCommandString(commandString);
    if (argv.length === 0) return { success: false, error: "No command configured" };
    const result = await magiesTerminalBridge.get()?.testPetCommand?.(argv);
    return result ?? { success: false, error: "Bridge unavailable" };
  }, []);
}
