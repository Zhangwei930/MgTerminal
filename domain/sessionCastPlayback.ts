/**
 * Reading back the asciinema cast v2 files this app records.
 *
 * sessionCast.ts only ever wrote them, so a recording could be produced and
 * never opened again. Everything here is the inverse of that writer.
 */

import type { AsciinemaCastEventType, AsciinemaCastHeader } from "./sessionCast";

export interface CastEvent {
  /** Seconds since the recording started. */
  time: number;
  type: AsciinemaCastEventType;
  data: string;
}

export type CastParseResult =
  | { ok: true; header: AsciinemaCastHeader; events: CastEvent[]; skipped: number }
  | { ok: false; error: "empty" | "header" | "version" | "dimensions" };

function parseHeader(line: string): AsciinemaCastHeader | CastParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, error: "header" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "header" };
  }
  const record = parsed as Record<string, unknown>;
  if (Number(record.version) !== 2) return { ok: false, error: "version" };

  const width = Number(record.width);
  const height = Number(record.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ok: false, error: "dimensions" };
  }

  const header: AsciinemaCastHeader = { version: 2, width, height };
  if (Number.isFinite(Number(record.timestamp))) header.timestamp = Number(record.timestamp);
  if (typeof record.title === "string") header.title = record.title;
  if (record.env && typeof record.env === "object") {
    header.env = record.env as Record<string, string>;
  }
  return header;
}

export function parseAsciinemaCast(text: string): CastParseResult {
  const lines = String(text ?? "").split("\n");
  const headerLine = lines.find((line) => line.trim().length > 0);
  if (!headerLine) return { ok: false, error: "empty" };

  const header = parseHeader(headerLine.trim());
  if ("ok" in header) return header;

  const events: CastEvent[] = [];
  let skipped = 0;
  for (const raw of lines.slice(lines.indexOf(headerLine) + 1)) {
    const line = raw.trim();
    // Blank lines are formatting, not corruption.
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // A recording cut short by a crash is exactly when someone wants to
      // watch it, so a bad tail costs that line and nothing more.
      skipped += 1;
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length < 3) {
      skipped += 1;
      continue;
    }
    const [time, type, data] = parsed as [unknown, unknown, unknown];
    if (!Number.isFinite(Number(time)) || (type !== "o" && type !== "i") || typeof data !== "string") {
      skipped += 1;
      continue;
    }
    events.push({ time: Number(time), type, data });
  }

  return { ok: true, header, events, skipped };
}

export function castDurationSeconds(events: CastEvent[]): number {
  return events.length === 0 ? 0 : events[events.length - 1]!.time;
}

/**
 * The output written up to and including `seconds`. Input events are excluded:
 * they record what the user typed, which the terminal already echoed into the
 * output stream, so replaying them would double every keystroke.
 */
export function sliceCastOutputUpTo(events: CastEvent[], seconds: number): string {
  let out = "";
  for (const event of events) {
    if (event.time > seconds) break;
    if (event.type === "o") out += event.data;
  }
  return out;
}

/** Index of the first event strictly after `seconds` — the next one to play. */
export function findCastEventIndexAt(events: CastEvent[], seconds: number): number {
  let index = 0;
  while (index < events.length && events[index]!.time <= seconds) index += 1;
  return index;
}
