import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAsciinemaCastHeader,
  formatAsciinemaCastEventLine,
  formatAsciinemaCastHeaderLine,
} from "./sessionCast";
import {
  castDurationSeconds,
  findCastEventIndexAt,
  parseAsciinemaCast,
  sliceCastOutputUpTo,
} from "./sessionCastPlayback";

const sample = [
  '{"version":2,"width":80,"height":24,"timestamp":1700000000}',
  '[0.5,"o","hello "]',
  '[1.25,"i","ls\\r"]',
  '[2,"o","world"]',
].join("\n");

test("parseAsciinemaCast reads the header and every event", () => {
  const result = parseAsciinemaCast(sample);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.header.width, 80);
  assert.equal(result.header.height, 24);
  assert.deepEqual(result.events.map((e) => [e.time, e.type, e.data]), [
    [0.5, "o", "hello "],
    [1.25, "i", "ls\r"],
    [2, "o", "world"],
  ]);
});

test("parseAsciinemaCast round-trips what the recorder writes", () => {
  // The writer already ships; a parser that cannot read it is useless.
  const header = buildAsciinemaCastHeader({ width: 120, height: 40, timestampMs: 1700000000000, title: "demo" });
  const text = formatAsciinemaCastHeaderLine(header)
    + formatAsciinemaCastEventLine(0.123456, "o", "$ whoami\r\n")
    + formatAsciinemaCastEventLine(1.5, "i", "");

  const result = parseAsciinemaCast(text);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.header.width, 120);
  assert.equal(result.header.title, "demo");
  assert.deepEqual(result.events[0], { time: 0.123456, type: "o", data: "$ whoami\r\n" });
  assert.deepEqual(result.events[1], { time: 1.5, type: "i", data: "" });
});

test("parseAsciinemaCast rejects a file that is not cast v2", () => {
  assert.equal(parseAsciinemaCast("").ok, false);
  assert.equal(parseAsciinemaCast("not json").ok, false);
  assert.equal(parseAsciinemaCast('{"version":1,"width":80,"height":24}').ok, false);
  assert.equal(parseAsciinemaCast('{"version":2}').ok, false, "width/height are required");
});

test("parseAsciinemaCast skips malformed event lines rather than giving up", () => {
  // A recording truncated by a crash is exactly when someone wants to watch it.
  const result = parseAsciinemaCast([
    '{"version":2,"width":80,"height":24}',
    '[0.5,"o","kept"]',
    'garbage',
    '[1,"x","unknown type"]',
    '[2,"o"]',
    '[3,"o","also kept"]',
    '[4,"o","truncat',
  ].join("\n"));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.events.map((e) => e.data), ["kept", "also kept"]);
  assert.equal(result.skipped, 4);
});

test("parseAsciinemaCast tolerates blank lines and a trailing newline", () => {
  const result = parseAsciinemaCast('{"version":2,"width":80,"height":24}\n\n[1,"o","x"]\n\n');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.events.length, 1);
  assert.equal(result.skipped, 0, "blank lines are not malformed");
});

test("castDurationSeconds is the last event time", () => {
  const result = parseAsciinemaCast(sample);
  assert.equal(result.ok && castDurationSeconds(result.events), 2);
  assert.equal(castDurationSeconds([]), 0);
});

test("sliceCastOutputUpTo returns only output, concatenated in order", () => {
  const result = parseAsciinemaCast(sample);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Input events are what the user typed; replaying them into the terminal
  // would duplicate the echo already present in the output stream.
  assert.equal(sliceCastOutputUpTo(result.events, 0.4), "");
  assert.equal(sliceCastOutputUpTo(result.events, 0.5), "hello ");
  assert.equal(sliceCastOutputUpTo(result.events, 1.9), "hello ");
  assert.equal(sliceCastOutputUpTo(result.events, 99), "hello world");
});

test("findCastEventIndexAt finds the first event after a timestamp", () => {
  const result = parseAsciinemaCast(sample);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(findCastEventIndexAt(result.events, 0), 0);
  assert.equal(findCastEventIndexAt(result.events, 0.5), 1, "an exact hit has already been played");
  assert.equal(findCastEventIndexAt(result.events, 1.3), 2);
  assert.equal(findCastEventIndexAt(result.events, 99), result.events.length);
});
