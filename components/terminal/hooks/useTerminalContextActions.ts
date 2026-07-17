import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback } from "react";
import type { RefObject } from "react";
import { magiesTerminalBridge } from "../../../infrastructure/services/magiesTerminalBridge";
import { logger } from "../../../lib/logger";
import { clearTerminalViewport } from "../clearTerminalViewport";
import {
  handleRemoteClipboardImageUpload,
  type RemoteClipboardImageUploadResult,
} from "../clipboardImagePaste";
import { handleTerminalClipboardPaste } from "../terminalClipboardPaste";
import type { SafePasteSettings } from "../../../domain/safePaste";

type BroadcastPasteRefs = {
  sourceSessionId: string;
  sessionRef: RefObject<string | null>;
  isBroadcastEnabledRef?: RefObject<boolean | undefined>;
  onBroadcastInputRef?: RefObject<((data: string, sourceSessionId: string) => void) | undefined>;
};

export const broadcastTerminalPasteData = (
  data: string,
  { sourceSessionId, sessionRef, isBroadcastEnabledRef, onBroadcastInputRef }: BroadcastPasteRefs,
): boolean => {
  if (sessionRef.current && isBroadcastEnabledRef?.current && onBroadcastInputRef?.current) {
    onBroadcastInputRef.current(data, sourceSessionId);
    return true;
  }
  return false;
};

export const useTerminalContextActions = ({
  termRef,
  sourceSessionId,
  sessionRef,
  onHasSelectionChange,
  scrollOnPasteRef,
  isBroadcastEnabledRef,
  onBroadcastInputRef,
  isLocalConnection,
  supportsRemoteImagePaste,
  clearWipesScrollbackRef,
  terminalBackend,
  getRemoteCwd,
  scrollToBottomAfterProgrammaticInput,
  onClipboardImageUploadResult,
  safePasteSettingsRef,
  confirmDangerousPasteRef,
}: {
  termRef: RefObject<XTerm | null>;
  sourceSessionId: string;
  sessionRef: RefObject<string | null>;
  onHasSelectionChange?: (hasSelection: boolean) => void;
  scrollOnPasteRef?: RefObject<boolean>;
  isBroadcastEnabledRef?: RefObject<boolean | undefined>;
  onBroadcastInputRef?: RefObject<((data: string, sourceSessionId: string) => void) | undefined>;
  isLocalConnection: boolean;
  supportsRemoteImagePaste: boolean;
  clearWipesScrollbackRef?: RefObject<boolean | undefined>;
  terminalBackend: {
    writeToSession: (
      sessionId: string,
      data: string,
      options?: { automated?: boolean; lineDelayMs?: number },
    ) => void;
  };
  getRemoteCwd?: () => Promise<string | null | undefined>;
  scrollToBottomAfterProgrammaticInput?: (data: string) => void;
  onClipboardImageUploadResult?: (result: RemoteClipboardImageUploadResult) => void;
  safePasteSettingsRef?: RefObject<Partial<SafePasteSettings> | null | undefined>;
  confirmDangerousPasteRef?: RefObject<
    | ((info: {
        text: string;
        matchedPattern?: string;
        sampleLine?: string;
      }) => Promise<boolean>)
    | undefined
  >;
}) => {
  const broadcastUserPasteData = useCallback((data: string) => {
    return broadcastTerminalPasteData(data, {
      sourceSessionId,
      sessionRef,
      isBroadcastEnabledRef,
      onBroadcastInputRef,
    });
  }, [isBroadcastEnabledRef, onBroadcastInputRef, sessionRef, sourceSessionId]);

  const onCopy = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  }, [termRef]);

  const onPaste = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    try {
      const bridge = magiesTerminalBridge.get();
      await handleTerminalClipboardPaste({
        bridge,
        isLocalConnection,
        readClipboardText: () => navigator.clipboard.readText(),
        scrollOnPaste: scrollOnPasteRef?.current ?? false,
        onPasteData: broadcastUserPasteData,
        sessionId: sessionRef.current,
        terminalBackend,
        term,
        safePasteSettings: safePasteSettingsRef?.current,
        confirmDangerous: confirmDangerousPasteRef?.current,
      });
    } catch (err) {
      logger.warn("Failed to paste from clipboard", err);
    }
  }, [
    broadcastUserPasteData,
    confirmDangerousPasteRef,
    isLocalConnection,
    safePasteSettingsRef,
    sessionRef,
    termRef,
    scrollOnPasteRef,
    terminalBackend,
  ]);

  const onUploadClipboardImage = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    try {
      const bridge = magiesTerminalBridge.get();
      const result = await handleRemoteClipboardImageUpload({
        bridge,
        getRemoteCwd: getRemoteCwd ?? (async () => undefined),
        sessionId: supportsRemoteImagePaste ? sessionRef.current : null,
        terminalBackend,
        term,
        scrollToBottomAfterProgrammaticInput,
      });
      onClipboardImageUploadResult?.(result);
    } catch (err) {
      logger.warn("Failed to upload clipboard image", err);
      onClipboardImageUploadResult?.({ ok: false, reason: "upload-failed" });
    }
  }, [
    getRemoteCwd,
    onClipboardImageUploadResult,
    scrollToBottomAfterProgrammaticInput,
    sessionRef,
    supportsRemoteImagePaste,
    termRef,
    terminalBackend,
  ]);

  const onPasteSelection = useCallback(() => {
    const term = termRef.current;
    const sessionId = sessionRef.current;
    if (!term || !sessionId) return;
    const selection = term.getSelection();
    if (!selection) return;
    void handleTerminalClipboardPaste({
      isLocalConnection: false,
      readClipboardText: async () => selection,
      scrollOnPaste: scrollOnPasteRef?.current ?? false,
      onPasteData: broadcastUserPasteData,
      sessionId,
      terminalBackend,
      term,
      safePasteSettings: safePasteSettingsRef?.current,
      confirmDangerous: confirmDangerousPasteRef?.current,
    });
  }, [
    broadcastUserPasteData,
    confirmDangerousPasteRef,
    safePasteSettingsRef,
    sessionRef,
    termRef,
    scrollOnPasteRef,
    terminalBackend,
  ]);

  const onSelectAll = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.selectAll();
    onHasSelectionChange?.(true);
  }, [onHasSelectionChange, termRef]);

  const onClear = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    clearTerminalViewport(term, { wipeScrollback: clearWipesScrollbackRef?.current ?? true });
  }, [clearWipesScrollbackRef, termRef]);

  const onSelectWord = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.selectAll();
    onHasSelectionChange?.(true);
  }, [onHasSelectionChange, termRef]);

  return {
    onCopy,
    onPaste,
    onUploadClipboardImage: supportsRemoteImagePaste ? onUploadClipboardImage : undefined,
    onPasteSelection,
    onSelectAll,
    onClear,
    onSelectWord,
  };
};
