/**
 * Safe paste policy helpers: delay pacing + dangerous-command detection.
 * Defaults keep existing paste behavior (no delay, no confirm).
 */

import { checkCommandSafety } from "../infrastructure/ai/magiesTerminalAgent/safety";

export type SafePasteSettings = {
  pasteCharDelayMs: number;
  pasteLineDelayMs: number;
  pasteWaitForPrompt: boolean;
  confirmDangerousPaste: boolean;
};

export const DEFAULT_SAFE_PASTE_SETTINGS: SafePasteSettings = {
  pasteCharDelayMs: 0,
  pasteLineDelayMs: 0,
  pasteWaitForPrompt: false,
  confirmDangerousPaste: false,
};

export const MAX_PASTE_CHAR_DELAY_MS = 200;
export const MAX_PASTE_LINE_DELAY_MS = 5000;
export const PASTE_WAIT_FOR_PROMPT_TIMEOUT_MS = 30_000;

export function clampPasteCharDelayMs(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_PASTE_CHAR_DELAY_MS);
}

export function clampPasteLineDelayMs(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_PASTE_LINE_DELAY_MS);
}

export function normalizeSafePasteSettings(
  settings?: Partial<SafePasteSettings> | null,
): SafePasteSettings {
  return {
    pasteCharDelayMs: clampPasteCharDelayMs(settings?.pasteCharDelayMs),
    pasteLineDelayMs: clampPasteLineDelayMs(settings?.pasteLineDelayMs),
    pasteWaitForPrompt: Boolean(settings?.pasteWaitForPrompt),
    confirmDangerousPaste: Boolean(settings?.confirmDangerousPaste),
  };
}

/** True when paste must leave the fast xterm.paste path. */
export function needsThrottledPaste(settings: SafePasteSettings): boolean {
  return (
    settings.pasteCharDelayMs > 0 ||
    settings.pasteLineDelayMs > 0 ||
    settings.pasteWaitForPrompt
  );
}

export type DangerousPasteInspection = {
  dangerous: boolean;
  matchedPattern?: string;
  sampleLine?: string;
};

/**
 * Inspect pasted text against the shared command blocklist.
 * Checks the full blob and each non-empty line (multi-line pastes).
 */
export function inspectDangerousPaste(text: string): DangerousPasteInspection {
  if (!text) return { dangerous: false };

  // Prefer per-line matches so the confirm dialog can show the offending line.
  for (const line of text.split(/\r\n|\n|\r/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const result = checkCommandSafety(trimmed);
    if (result.blocked) {
      return {
        dangerous: true,
        matchedPattern: result.matchedPattern,
        sampleLine: trimmed.slice(0, 200),
      };
    }
  }

  const full = checkCommandSafety(text);
  if (full.blocked) {
    return {
      dangerous: true,
      matchedPattern: full.matchedPattern,
      sampleLine: firstNonEmptyLine(text),
    };
  }

  return { dangerous: false };
}

/**
 * Split paste text into write chunks that preserve original line endings.
 * Final chunk may omit trailing newline when the paste did not end with one.
 */
export function splitPasteIntoLineChunks(text: string): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let buffer = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    buffer += ch;
    if (ch === "\n") {
      chunks.push(buffer);
      buffer = "";
      continue;
    }
    if (ch === "\r") {
      const next = text[i + 1];
      if (next === "\n") {
        buffer += next;
        i += 1;
      }
      chunks.push(buffer);
      buffer = "";
    }
  }
  if (buffer.length > 0) chunks.push(buffer);
  return chunks.length > 0 ? chunks : [text];
}

export function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const firstNonEmptyLine = (text: string): string | undefined => {
  for (const line of text.split(/\r\n|\n|\r/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.slice(0, 200);
  }
  return undefined;
};
