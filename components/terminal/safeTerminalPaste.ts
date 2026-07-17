import type { Terminal as XTerm } from "@xterm/xterm";

import {
  inspectDangerousPaste,
  needsThrottledPaste,
  normalizeSafePasteSettings,
  PASTE_WAIT_FOR_PROMPT_TIMEOUT_MS,
  sleepMs,
  splitPasteIntoLineChunks,
  type SafePasteSettings,
} from "../../domain/safePaste";
import { detectPrompt } from "./autocomplete/promptDetector";
import { pasteTextIntoTerminal } from "./runtime/terminalUserPaste";

export type SafeTerminalPasteOptions = {
  text: string;
  term: Pick<XTerm, "paste" | "scrollToBottom" | "buffer" | "cols" | "rows" | "write"> &
    Partial<Pick<XTerm, "focus" | "modes" | "options">>;
  sessionId: string;
  settings?: Partial<SafePasteSettings> | null;
  scrollOnPaste?: boolean;
  terminalBackend: {
    writeToSession: (
      sessionId: string,
      data: string,
      options?: { automated?: boolean; lineDelayMs?: number },
    ) => void;
  };
  /** Return true when broadcast handled the payload (peers only; source still writes). */
  onPasteData?: (data: string) => boolean | void;
  /**
   * When confirmDangerousPaste is enabled and text looks dangerous, called to
   * ask the user. Return true to paste, false to cancel.
   */
  confirmDangerous?: (info: {
    text: string;
    matchedPattern?: string;
    sampleLine?: string;
  }) => Promise<boolean>;
  /** Optional prompt probe for wait-for-prompt pacing (defaults to detectPrompt). */
  isAtPrompt?: () => boolean;
};

/**
 * Paste text with optional dangerous-command confirm and send throttling.
 * With all safety settings off, behavior matches legacy pasteTextIntoTerminal.
 */
export async function performSafeTerminalPaste(
  options: SafeTerminalPasteOptions,
): Promise<"pasted" | "cancelled" | "empty"> {
  const text = options.text;
  if (!text) return "empty";

  const settings = normalizeSafePasteSettings(options.settings);

  if (settings.confirmDangerousPaste) {
    const inspection = inspectDangerousPaste(text);
    if (inspection.dangerous) {
      const allowed = options.confirmDangerous
        ? await options.confirmDangerous({
            text,
            matchedPattern: inspection.matchedPattern,
            sampleLine: inspection.sampleLine,
          })
        : false;
      if (!allowed) return "cancelled";
    }
  }

  if (!needsThrottledPaste(settings)) {
    pasteTextIntoTerminal(options.term, text, {
      scrollOnPaste: options.scrollOnPaste,
      onPasteData: options.onPasteData,
    });
    return "pasted";
  }

  await sendThrottledPaste({
    text,
    sessionId: options.sessionId,
    settings,
    terminalBackend: options.terminalBackend,
    onChunk: (chunk) => {
      // Fan out each chunk so broadcast peers stay in lockstep.
      options.onPasteData?.(chunk);
    },
    isAtPrompt:
      options.isAtPrompt ??
      (() => {
        try {
          return detectPrompt(options.term as XTerm).isAtPrompt;
        } catch {
          return false;
        }
      }),
  });

  if (options.scrollOnPaste) {
    options.term.scrollToBottom?.();
  }
  options.term.focus?.();
  return "pasted";
}

async function sendThrottledPaste(params: {
  text: string;
  sessionId: string;
  settings: SafePasteSettings;
  terminalBackend: SafeTerminalPasteOptions["terminalBackend"];
  onChunk?: (chunk: string) => void;
  isAtPrompt: () => boolean;
}): Promise<void> {
  const { text, sessionId, settings, terminalBackend, onChunk, isAtPrompt } = params;
  const lines = splitPasteIntoLineChunks(text);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (settings.pasteCharDelayMs > 0) {
      for (const char of line) {
        terminalBackend.writeToSession(sessionId, char, { automated: true });
        onChunk?.(char);
        await sleepMs(settings.pasteCharDelayMs);
      }
    } else {
      terminalBackend.writeToSession(sessionId, line, { automated: true });
      onChunk?.(line);
    }

    if (index >= lines.length - 1) break;

    if (settings.pasteWaitForPrompt) {
      await waitUntilPrompt(isAtPrompt, PASTE_WAIT_FOR_PROMPT_TIMEOUT_MS);
    } else if (settings.pasteLineDelayMs > 0) {
      await sleepMs(settings.pasteLineDelayMs);
    }
  }
}

async function waitUntilPrompt(
  isAtPrompt: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const started = Date.now();
  // Brief pause so the first line can produce output before probing.
  await sleepMs(30);
  while (Date.now() - started < timeoutMs) {
    if (isAtPrompt()) return true;
    await sleepMs(40);
  }
  return false;
}
