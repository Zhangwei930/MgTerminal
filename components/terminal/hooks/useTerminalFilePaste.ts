import type { Terminal as XTerm } from "@xterm/xterm";
import type React from "react";
import { useEffect } from "react";

import { magiesTerminalBridge } from "../../../infrastructure/services/magiesTerminalBridge";
import { logger } from "../../../lib/logger";
import type { TerminalSession } from "../../../types";
import type { SafePasteSettings } from "../../../domain/safePaste";
import { handleTerminalClipboardPaste } from "../terminalClipboardPaste";

interface UseTerminalFilePasteOptions {
  isLocalConnection: boolean;
  status: TerminalSession["status"];
  termRef: React.MutableRefObject<XTerm | null>;
  sessionRef: React.MutableRefObject<string | null>;
  terminalBackend: {
    writeToSession: (
      sessionId: string,
      data: string,
      options?: { automated?: boolean; lineDelayMs?: number },
    ) => void;
  };
  scrollOnPasteRef?: React.RefObject<boolean>;
  onPasteData?: (data: string) => boolean | void;
  scrollToBottomAfterProgrammaticInput: (data: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  safePasteSettingsRef?: React.RefObject<Partial<SafePasteSettings> | null | undefined>;
  confirmDangerousPasteRef?: React.RefObject<
    | ((info: {
        text: string;
        matchedPattern?: string;
        sampleLine?: string;
      }) => Promise<boolean>)
    | undefined
  >;
}

export function useTerminalFilePaste({
  isLocalConnection,
  status,
  termRef,
  sessionRef,
  terminalBackend,
  scrollOnPasteRef,
  onPasteData,
  scrollToBottomAfterProgrammaticInput,
  containerRef,
  safePasteSettingsRef,
  confirmDangerousPasteRef,
}: UseTerminalFilePasteOptions) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handlePaste = (event: ClipboardEvent) => {
      if (status !== "connected") return;

      const bridge = magiesTerminalBridge.get();

      if (!isLocalConnection || !bridge?.readClipboardFiles) return;

      // ⚡ Must call preventDefault SYNCHRONOUSLY — the event lifecycle
      // is synchronous; calling it after an await is too late and the
      // browser will have already performed the default paste action.
      event.preventDefault();
      event.stopPropagation();

      void (async () => {
        try {
          const term = termRef.current;
          if (!term) return;
          await handleTerminalClipboardPaste({
            bridge,
            isLocalConnection,
            readClipboardText: () => navigator.clipboard.readText(),
            scrollOnPaste: scrollOnPasteRef?.current ?? false,
            onPasteData,
            sessionId: sessionRef.current,
            terminalBackend,
            term,
            scrollToBottomAfterProgrammaticInput,
            safePasteSettings: safePasteSettingsRef?.current,
            confirmDangerous: confirmDangerousPasteRef?.current,
          });
        } catch (error) {
          logger.error("Failed to handle file paste", error);
        }
      })();
    };

    container.addEventListener("paste", handlePaste, true);
    return () => {
      container.removeEventListener("paste", handlePaste, true);
    };
  }, [
    confirmDangerousPasteRef,
    containerRef,
    isLocalConnection,
    onPasteData,
    safePasteSettingsRef,
    scrollOnPasteRef,
    scrollToBottomAfterProgrammaticInput,
    sessionRef,
    status,
    terminalBackend,
    termRef,
  ]);
}
