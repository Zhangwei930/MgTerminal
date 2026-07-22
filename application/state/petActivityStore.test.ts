import test from 'node:test';
import assert from 'node:assert/strict';

import {
  reportTabStreaming,
  reportTabToolName,
  reportTabFinished,
  isAnyTabStreaming,
  getActiveToolName,
  getRelevantBusyScope,
  getLastFinished,
  subscribePetActivity,
} from './petActivityStore';

// The store is module-level (shared across tests in this file); each test uses a
// unique scopeKey so they don't interfere with each other's state.

test('reportTabStreaming aggregates across scopes and notifies on change', () => {
  const seen: number[] = [];
  const unsubscribe = subscribePetActivity(() => seen.push(seen.length));

  assert.equal(isAnyTabStreaming(), false);
  reportTabStreaming('scope-a', true);
  assert.equal(isAnyTabStreaming(), true);
  reportTabStreaming('scope-b', true);
  assert.equal(isAnyTabStreaming(), true);

  reportTabStreaming('scope-a', false);
  assert.equal(isAnyTabStreaming(), true, 'scope-b is still streaming');
  reportTabStreaming('scope-b', false);
  assert.equal(isAnyTabStreaming(), false);

  // Reporting the same value again must not notify (no-op).
  const countBeforeNoop = seen.length;
  reportTabStreaming('scope-b', false);
  assert.equal(seen.length, countBeforeNoop);

  unsubscribe();
});

test('reportTabToolName clears when the scope stops streaming', () => {
  reportTabStreaming('scope-tool', true, { scopeType: 'terminal', scopeTargetId: 'session-1' });
  reportTabToolName('scope-tool', 'read_file');
  assert.equal(getActiveToolName(), 'read_file');

  reportTabStreaming('scope-tool', false);
  assert.equal(getActiveToolName(), null, 'tool name should not linger after the scope goes idle');
});

test('getRelevantBusyScope prefers a scope that is currently streaming', () => {
  reportTabStreaming('scope-x', true, { scopeType: 'terminal', scopeTargetId: 'session-x' });
  reportTabStreaming('scope-y', true, { scopeType: 'terminal', scopeTargetId: 'session-y' });
  reportTabStreaming('scope-x', false);

  assert.deepEqual(getRelevantBusyScope(), { scopeType: 'terminal', scopeTargetId: 'session-y' });

  reportTabStreaming('scope-y', false);
});

test('getRelevantBusyScope falls back to the most recently busy scope once everything is idle', () => {
  reportTabStreaming('scope-z', true, { scopeType: 'terminal', scopeTargetId: 'session-z' });
  reportTabStreaming('scope-z', false);

  assert.deepEqual(getRelevantBusyScope(), { scopeType: 'terminal', scopeTargetId: 'session-z' });
});

test('reportTabFinished records the outcome and timestamp', () => {
  const before = Date.now();
  reportTabFinished('failed');
  const finished = getLastFinished();
  assert.equal(finished?.outcome, 'failed');
  assert.ok(finished && finished.at >= before);
});
