import test from 'node:test';
import assert from 'node:assert/strict';

import { clampSpriteGrid, getSpriteFrameCount, getSpriteFramePosition, clampFrameRange, stepFrameInRange } from './petSprite';

test('clampSpriteGrid falls back to 1x1 for missing or invalid values', () => {
  assert.deepEqual(clampSpriteGrid({}), { cols: 1, rows: 1 });
  assert.deepEqual(clampSpriteGrid({ cols: 0, rows: -3 }), { cols: 1, rows: 1 });
  assert.deepEqual(clampSpriteGrid({ cols: 4.9, rows: 2 }), { cols: 4, rows: 2 });
});

test('clampSpriteGrid caps extreme grids to avoid pathological sheets', () => {
  assert.deepEqual(clampSpriteGrid({ cols: 999, rows: 999 }), { cols: 32, rows: 32 });
});

test('getSpriteFrameCount multiplies cols and rows', () => {
  assert.equal(getSpriteFrameCount({ cols: 1, rows: 1 }), 1);
  assert.equal(getSpriteFrameCount({ cols: 4, rows: 2 }), 8);
});

test('getSpriteFramePosition returns 0,0 for a static 1x1 image', () => {
  assert.deepEqual(getSpriteFramePosition(0, { cols: 1, rows: 1 }), { xPercent: 0, yPercent: 0 });
});

test('getSpriteFramePosition steps evenly across a horizontal filmstrip', () => {
  const grid = { cols: 4, rows: 1 };
  assert.deepEqual(getSpriteFramePosition(0, grid), { xPercent: 0, yPercent: 0 });
  assert.deepEqual(getSpriteFramePosition(1, grid), { xPercent: (1 / 3) * 100, yPercent: 0 });
  assert.deepEqual(getSpriteFramePosition(3, grid), { xPercent: 100, yPercent: 0 });
});

test('getSpriteFramePosition wraps out-of-range indices', () => {
  const grid = { cols: 4, rows: 1 };
  assert.deepEqual(getSpriteFramePosition(4, grid), getSpriteFramePosition(0, grid));
  assert.deepEqual(getSpriteFramePosition(-1, grid), getSpriteFramePosition(3, grid));
});

test('getSpriteFramePosition handles a 2D grid', () => {
  const grid = { cols: 2, rows: 2 };
  assert.deepEqual(getSpriteFramePosition(0, grid), { xPercent: 0, yPercent: 0 });
  assert.deepEqual(getSpriteFramePosition(1, grid), { xPercent: 100, yPercent: 0 });
  assert.deepEqual(getSpriteFramePosition(2, grid), { xPercent: 0, yPercent: 100 });
  assert.deepEqual(getSpriteFramePosition(3, grid), { xPercent: 100, yPercent: 100 });
});

test('clampFrameRange defaults to the full sheet when unset', () => {
  assert.deepEqual(clampFrameRange(undefined, 8), { start: 0, end: 7 });
});

test('clampFrameRange clamps out-of-bounds and reversed ranges into the sheet', () => {
  assert.deepEqual(clampFrameRange({ start: -5, end: 999 }, 8), { start: 0, end: 7 });
  assert.deepEqual(clampFrameRange({ start: 6, end: 2 }, 8), { start: 6, end: 6 }, 'end below start collapses to a single frame at start');
});

test('clampFrameRange accepts a valid sub-range as-is', () => {
  assert.deepEqual(clampFrameRange({ start: 2, end: 5 }, 8), { start: 2, end: 5 });
});

test('stepFrameInRange advances by one within the range', () => {
  const range = { start: 2, end: 5 };
  assert.equal(stepFrameInRange(2, range), 3);
  assert.equal(stepFrameInRange(4, range), 5);
});

test('stepFrameInRange wraps back to the start after the last frame', () => {
  assert.equal(stepFrameInRange(5, { start: 2, end: 5 }), 2);
});

test('stepFrameInRange snaps into range if the current frame is outside it (e.g. status just changed)', () => {
  assert.equal(stepFrameInRange(0, { start: 4, end: 6 }), 4);
  assert.equal(stepFrameInRange(9, { start: 4, end: 6 }), 4);
});

test('stepFrameInRange holds a single-frame range steady', () => {
  assert.equal(stepFrameInRange(3, { start: 3, end: 3 }), 3);
});
