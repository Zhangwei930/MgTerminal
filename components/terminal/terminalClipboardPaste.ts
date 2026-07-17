import type { Terminal as XTerm } from "@xterm/xterm";

import type { SafePasteSettings } from "../../domain/safePaste";
import { extractRootPathsFromClipboardFiles } from "./terminalHelpers";
import { performSafeTerminalPaste } from "./safeTerminalPaste";

type ClipboardFileBridge = Pick<Partial<MagiesTerminalBridge>, "readClipboardFiles">;

type TerminalClipboardPasteOptions = {
  bridge?: ClipboardFileBridge;
  isLocalConnection: boolean;
  onPasteData?: (data: string) => boolean | void;
  readClipboardText: () => Promise<string>;
  scrollOnPaste?: boolean;
  scrollToBottomAfterProgrammaticInput?: (data: string) => void;
  sessionId: string | null | undefined;
  terminalBackend: {
    writeToSession: (
      sessionId: string,
      data: string,
      options?: { automated?: boolean; lineDelayMs?: number },
    ) => void;
  };
  term: Pick<XTerm, "paste" | "scrollToBottom"> &
    Partial<Pick<XTerm, "focus" | "buffer" | "cols" | "rows" | "write" | "modes" | "options">>;
  safePasteSettings?: Partial<SafePasteSettings> | null;
  confirmDangerous?: (info: {
    text: string;
    matchedPattern?: string;
    sampleLine?: string;
  }) => Promise<boolean>;
};

export async function handleTerminalClipboardPaste({
  bridge,
  isLocalConnection,
  onPasteData,
  readClipboardText,
  scrollOnPaste = false,
  scrollToBottomAfterProgrammaticInput,
  sessionId,
  terminalBackend,
  term,
  safePasteSettings,
  confirmDangerous,
}: TerminalClipboardPasteOptions): Promise<void> {
  const readClipboardFiles = bridge?.readClipboardFiles;
  if (isLocalConnection && readClipboardFiles) {
    try {
      const files = await readClipboardFiles();
      if (files.length > 0 && sessionId) {
        const paths = extractRootPathsFromClipboardFiles(files);
        if (paths.length > 0) {
          const pathsText = paths.join(" ");
          terminalBackend.writeToSession(sessionId, pathsText);
          scrollToBottomAfterProgrammaticInput?.(pathsText);
          term.focus?.();
          return;
        }
      }
    } catch {
      // Fall through to text paste.
    }
  }

  const text = await readClipboardText();
  if (text && sessionId) {
    await performSafeTerminalPaste({
      text,
      term: term as never,
      sessionId,
      settings: safePasteSettings,
      scrollOnPaste,
      terminalBackend,
      onPasteData,
      confirmDangerous,
    });
  }
}
