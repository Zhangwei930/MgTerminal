import type { PetStatus } from './petStatus';

export interface SpriteGrid {
  cols: number;
  rows: number;
}

const MAX_SPRITE_AXIS = 32;

function clampAxis(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) return 1;
  return Math.min(Math.floor(num), MAX_SPRITE_AXIS);
}

/** Normalizes user-supplied sprite grid dimensions to a safe, well-formed grid. */
export function clampSpriteGrid(grid: Partial<SpriteGrid>): SpriteGrid {
  return { cols: clampAxis(grid.cols), rows: clampAxis(grid.rows) };
}

export function getSpriteFrameCount(grid: SpriteGrid): number {
  return Math.max(1, grid.cols * grid.rows);
}

/**
 * Background-position percentages for a given frame index in a row-major
 * sprite sheet (left-to-right, top-to-bottom), for use with a background-size
 * of `{cols * 100}% {rows * 100}%`.
 */
export function getSpriteFramePosition(frameIndex: number, grid: SpriteGrid): { xPercent: number; yPercent: number } {
  const frameCount = getSpriteFrameCount(grid);
  const safeIndex = ((frameIndex % frameCount) + frameCount) % frameCount;
  const col = safeIndex % grid.cols;
  const row = Math.floor(safeIndex / grid.cols);
  const xPercent = grid.cols > 1 ? (col / (grid.cols - 1)) * 100 : 0;
  const yPercent = grid.rows > 1 ? (row / (grid.rows - 1)) * 100 : 0;
  return { xPercent, yPercent };
}

export interface FrameRange {
  start: number;
  end: number;
}

/** Per-status frame sub-range within a sprite sheet, e.g. only frames 4-7 play while "waiting". */
export type PetFrameRangesByStatus = Partial<Record<PetStatus, FrameRange>>;

/**
 * Normalizes a user-supplied per-status frame range to valid, in-bounds frame
 * indices. Missing/invalid bounds fall back to the full sheet; an end before
 * start collapses to a single-frame range at start rather than erroring.
 */
export function clampFrameRange(range: Partial<FrameRange> | undefined, frameCount: number): FrameRange {
  const maxIndex = Math.max(0, frameCount - 1);
  const rawStart = Number.isFinite(range?.start) ? Math.trunc(range!.start) : 0;
  const start = Math.min(Math.max(rawStart, 0), maxIndex);
  const rawEnd = Number.isFinite(range?.end) ? Math.trunc(range!.end) : maxIndex;
  const end = Math.min(Math.max(rawEnd, start), maxIndex);
  return { start, end };
}

/**
 * Advances one step through a frame range, wrapping back to `start` after
 * `end`. If the current frame is outside the range (e.g. the pet's status
 * just changed to one with a different range), snaps straight to `start`.
 */
export function stepFrameInRange(currentFrame: number, range: FrameRange): number {
  if (currentFrame < range.start || currentFrame >= range.end) return range.start;
  return currentFrame + 1;
}
