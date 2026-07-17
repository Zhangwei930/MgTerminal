import test from "node:test";
import assert from "node:assert/strict";

import {
  formatHexDump,
  formatHexLine,
  stringToUtf8Bytes,
  TerminalHexRingBuffer,
} from "./terminalHexDump.ts";

test("stringToUtf8Bytes encodes ascii", () => {
  const bytes = stringToUtf8Bytes("Hi\n");
  assert.deepEqual(Array.from(bytes), [0x48, 0x69, 0x0a]);
});

test("formatHexLine shows offset hex and ascii", () => {
  const bytes = stringToUtf8Bytes("Hello, world!!!!");
  const line = formatHexLine(0, bytes, 0, bytes.length, 16);
  assert.match(line, /^00000000  /);
  assert.match(line, /\|Hello, world!!!!\|$/);
  assert.match(line, /48 65 6c 6c 6f/);
});

test("formatHexDump splits multi-line", () => {
  const bytes = stringToUtf8Bytes("0123456789abcdefXYZ");
  const dump = formatHexDump(bytes, { width: 16 });
  const lines = dump.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^00000000  /);
  assert.match(lines[1]!, /^00000010  /);
});

test("ring buffer trims oldest bytes and advances offset", () => {
  const ring = new TerminalHexRingBuffer(8);
  ring.push(stringToUtf8Bytes("ABCDEFGH"));
  assert.equal(ring.byteLength, 8);
  assert.equal(ring.startOffset, 0);
  ring.push(stringToUtf8Bytes("XY"));
  assert.equal(ring.byteLength, 8);
  assert.equal(ring.startOffset, 2);
  const text = new TextDecoder().decode(ring.toBytes());
  assert.equal(text, "CDEFGHXY");
});

test("ring format uses sliding offset", () => {
  const ring = new TerminalHexRingBuffer(4);
  ring.pushString("abcd");
  ring.pushString("ef");
  const dump = ring.format(4);
  assert.match(dump, /^00000002  /);
});
