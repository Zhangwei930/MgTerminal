import assert from 'node:assert/strict';
import test from 'node:test';
import { findLastSuccessfulSyncAt, formatLastSync, formatSyncDateTime, type SyncHistoryEntry } from './sync';

test('formatSyncDateTime renders yyyymmdd hhmm', () => {
  const timestamp = new Date(2025, 5, 28, 14, 30, 0).getTime();
  assert.equal(formatSyncDateTime(timestamp), '20250628 1430');
});

test('formatLastSync uses compact datetime for older timestamps', () => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  const formatted = formatLastSync(twoHoursAgo);
  assert.match(formatted, /^\d{8} \d{4}$/);
});

test('findLastSuccessfulSyncAt ignores failures and unordered history', () => {
  const entry = (over: Partial<SyncHistoryEntry>): SyncHistoryEntry => ({
    id: 'e', timestamp: 0, provider: 'github', action: 'upload',
    success: true, localVersion: 1, ...over,
  });

  assert.equal(findLastSuccessfulSyncAt([]), undefined);
  assert.equal(
    findLastSuccessfulSyncAt([entry({ timestamp: 500, success: false })]),
    undefined,
    'a failed attempt is not a sync',
  );
  // The newest success wins even when the ring is not sorted, and even when a
  // later failure follows it — the question is "when did data last land".
  assert.equal(
    findLastSuccessfulSyncAt([
      entry({ timestamp: 300 }),
      entry({ timestamp: 900, success: false }),
      entry({ timestamp: 700 }),
      entry({ timestamp: 100 }),
    ]),
    700,
  );
});
