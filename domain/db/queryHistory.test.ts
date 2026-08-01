import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_LIMIT,
  clearUnfavourited,
  recordQuery,
  toggleFavourite,
} from './queryHistory';
import type { QueryHistoryEntry } from './queryHistory';

const entry = (overrides: Partial<QueryHistoryEntry> = {}): QueryHistoryEntry => ({
  id: 'e1',
  sql: 'SELECT 1',
  connectionId: 'c1',
  at: 1000,
  ok: true,
  ...overrides,
});

// ── recordQuery ─────────────────────────────────────────────────────────────

test('a new query goes to the front', () => {
  const out = recordQuery([entry({ id: 'old', sql: 'SELECT 2' })], entry({ id: 'new' }));
  assert.equal(out[0].id, 'new');
  assert.equal(out.length, 2);
});

test('re-running the same SQL moves it up instead of duplicating it', () => {
  // Otherwise iterating on one query buries everything else.
  const history = [entry({ id: 'a', sql: 'SELECT 1' }), entry({ id: 'b', sql: 'SELECT 2' })];
  const out = recordQuery(history, entry({ id: 'c', sql: 'SELECT 2' }));

  assert.equal(out.length, 2);
  assert.equal(out[0].sql, 'SELECT 2');
  assert.equal(out[0].id, 'c', 'the newer run replaces the older record');
});

test('deduplication ignores surrounding whitespace but not the statement', () => {
  const history = [entry({ id: 'a', sql: 'SELECT 1' })];
  assert.equal(recordQuery(history, entry({ id: 'b', sql: '  SELECT 1  ' })).length, 1);
  assert.equal(recordQuery(history, entry({ id: 'b', sql: 'SELECT  1' })).length, 2);
});

test('re-running a favourited query keeps it favourited', () => {
  // The user marked that SQL, not that particular execution.
  const history = [entry({ id: 'a', sql: 'SELECT 1', favourite: true })];
  const out = recordQuery(history, entry({ id: 'b', sql: 'SELECT 1' }));

  assert.equal(out[0].favourite, true);
});

test('the same SQL on a different connection is a separate entry', () => {
  const history = [entry({ id: 'a', sql: 'SELECT 1', connectionId: 'c1' })];
  const out = recordQuery(history, entry({ id: 'b', sql: 'SELECT 1', connectionId: 'c2' }));

  assert.equal(out.length, 2);
});

test('an empty statement is not recorded', () => {
  assert.deepEqual(recordQuery([], entry({ sql: '   ' })), []);
});

test('history is capped', () => {
  const history = Array.from({ length: HISTORY_LIMIT }, (_, i) =>
    entry({ id: `e${i}`, sql: `SELECT ${i}` }));
  const out = recordQuery(history, entry({ id: 'new', sql: 'SELECT new' }));

  assert.equal(out.length, HISTORY_LIMIT);
  assert.equal(out[0].id, 'new');
  assert.ok(!out.some((e) => e.id === `e${HISTORY_LIMIT - 1}`), 'the oldest entry is dropped');
});

test('favourites are never dropped by the cap', () => {
  // A saved query that disappears because the user ran a hundred others is a
  // data-loss bug, not a cache eviction.
  const history = Array.from({ length: HISTORY_LIMIT }, (_, i) =>
    entry({ id: `e${i}`, sql: `SELECT ${i}`, favourite: i === HISTORY_LIMIT - 1 }));
  const out = recordQuery(history, entry({ id: 'new', sql: 'SELECT new' }));

  assert.ok(out.some((e) => e.id === `e${HISTORY_LIMIT - 1}`), 'the favourite survived');
  assert.ok(!out.some((e) => e.id === `e${HISTORY_LIMIT - 2}`), 'a plain entry was dropped instead');
});

test('a failed query is recorded too', () => {
  // Finding the statement that errored is exactly when history is useful.
  const out = recordQuery([], entry({ ok: false }));
  assert.equal(out[0].ok, false);
});

// ── toggleFavourite ─────────────────────────────────────────────────────────

test('toggling flips one entry and leaves the rest alone', () => {
  const history = [entry({ id: 'a' }), entry({ id: 'b', sql: 'SELECT 2' })];
  const out = toggleFavourite(history, 'a');

  assert.equal(out[0].favourite, true);
  assert.equal(out[1].favourite, undefined);
  assert.equal(toggleFavourite(out, 'a')[0].favourite, false);
});

test('toggling an unknown id changes nothing', () => {
  const history = [entry({ id: 'a' })];
  assert.deepEqual(toggleFavourite(history, 'zzz'), history);
});

// ── clearUnfavourited ───────────────────────────────────────────────────────

test('clearing keeps the favourites', () => {
  const history = [
    entry({ id: 'a' }),
    entry({ id: 'b', sql: 'SELECT 2', favourite: true }),
    entry({ id: 'c', sql: 'SELECT 3' }),
  ];

  assert.deepEqual(clearUnfavourited(history).map((e) => e.id), ['b']);
});
