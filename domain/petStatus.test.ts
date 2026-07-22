import test from 'node:test';
import assert from 'node:assert/strict';

import { derivePetStatus } from './petStatus';

test('derivePetStatus prioritizes waiting over running', () => {
  assert.equal(
    derivePetStatus({ pendingApprovalCount: 1, anyStreaming: true, justFinished: null }),
    'waiting',
  );
});

test('derivePetStatus reports running while streaming with no pending approval', () => {
  assert.equal(
    derivePetStatus({ pendingApprovalCount: 0, anyStreaming: true, justFinished: null }),
    'running',
  );
});

test('derivePetStatus surfaces a just-finished outcome even after streaming stops', () => {
  assert.equal(
    derivePetStatus({ pendingApprovalCount: 0, anyStreaming: false, justFinished: 'done' }),
    'done',
  );
  assert.equal(
    derivePetStatus({ pendingApprovalCount: 0, anyStreaming: false, justFinished: 'failed' }),
    'failed',
  );
});

test('derivePetStatus falls back to idle when nothing is happening', () => {
  assert.equal(
    derivePetStatus({ pendingApprovalCount: 0, anyStreaming: false, justFinished: null }),
    'idle',
  );
});

test('derivePetStatus still prefers waiting over a just-finished outcome', () => {
  assert.equal(
    derivePetStatus({ pendingApprovalCount: 1, anyStreaming: false, justFinished: 'done' }),
    'waiting',
  );
});
