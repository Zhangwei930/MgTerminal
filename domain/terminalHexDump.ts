/**
 * Hex / raw stream diagnostics helpers (Xshell-style dump).
 * Operates on byte views of the terminal receive path (UTF-8 of decoded
 * session strings in the renderer). Does not claim wire-level fidelity
 * after charset decoding.
 */

export const DEFAULT_HEX_WIDTH = 16;
/** Cap retained raw bytes so floody sessions cannot grow unbounded. */
export const DEFAULT_HEX_RING_BYTES = 64 * 1024;

const textEncoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

export function stringToUtf8Bytes(text: string): Uint8Array {
  if (!text) return new Uint8Array(0);
  if (textEncoder) return textEncoder.encode(text);
  // Node test fallback without TextEncoder polyfill edge cases
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function formatAsciiPreview(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let i = start; i < end; i += 1) {
    const value = bytes[i] ?? 0;
    out += value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : ".";
  }
  return out;
}

export function formatHexLine(
  offset: number,
  bytes: Uint8Array,
  start: number,
  end: number,
  width: number = DEFAULT_HEX_WIDTH,
): string {
  const offsetHex = (offset >>> 0).toString(16).padStart(8, "0");
  const leftBytes: string[] = [];
  const rightBytes: string[] = [];
  const mid = Math.floor(width / 2);
  for (let i = 0; i < width; i += 1) {
    const cell = start + i < end
      ? (bytes[start + i] ?? 0).toString(16).padStart(2, "0")
      : "  ";
    if (i < mid) leftBytes.push(cell);
    else rightBytes.push(cell);
  }
  const hex = `${leftBytes.join(" ")}  ${rightBytes.join(" ")}`;
  const ascii = formatAsciiPreview(bytes, start, end).padEnd(width, " ");
  return `${offsetHex}  ${hex}  |${ascii}|`;
}

export function formatHexDump(
  bytes: Uint8Array,
  options?: { offset?: number; width?: number },
): string {
  const width = options?.width && options.width > 0 ? options.width : DEFAULT_HEX_WIDTH;
  const baseOffset = options?.offset ?? 0;
  if (bytes.length === 0) return "";
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += width) {
    const end = Math.min(i + width, bytes.length);
    lines.push(formatHexLine(baseOffset + i, bytes, i, end, width));
  }
  return lines.join("\n");
}

/**
 * Ring buffer of raw bytes with a sliding start offset for dump headers.
 */
export class TerminalHexRingBuffer {
  private chunks: Uint8Array[] = [];
  private total = 0;
  private baseOffset = 0;
  readonly maxBytes: number;

  constructor(maxBytes: number = DEFAULT_HEX_RING_BYTES) {
    this.maxBytes = Number.isFinite(maxBytes) && maxBytes > 0
      ? Math.floor(maxBytes)
      : DEFAULT_HEX_RING_BYTES;
  }

  get byteLength(): number {
    return this.total;
  }

  get startOffset(): number {
    return this.baseOffset;
  }

  clear(): void {
    this.chunks = [];
    this.total = 0;
    this.baseOffset = 0;
  }

  push(data: Uint8Array): void {
    if (!data.length) return;
    // Copy so callers can reuse buffers.
    const copy = data.slice();
    this.chunks.push(copy);
    this.total += copy.length;
    this.trim();
  }

  pushString(text: string): void {
    this.push(stringToUtf8Bytes(text));
  }

  toBytes(): Uint8Array {
    if (this.total === 0) return new Uint8Array(0);
    if (this.chunks.length === 1) return this.chunks[0]!;
    const out = new Uint8Array(this.total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  format(width: number = DEFAULT_HEX_WIDTH): string {
    return formatHexDump(this.toBytes(), { offset: this.baseOffset, width });
  }

  private trim(): void {
    while (this.total > this.maxBytes && this.chunks.length > 0) {
      const head = this.chunks[0]!;
      const overflow = this.total - this.maxBytes;
      if (head.length <= overflow) {
        this.chunks.shift();
        this.total -= head.length;
        this.baseOffset += head.length;
        continue;
      }
      const kept = head.subarray(overflow);
      this.chunks[0] = kept.slice();
      this.total -= overflow;
      this.baseOffset += overflow;
    }
  }
}

