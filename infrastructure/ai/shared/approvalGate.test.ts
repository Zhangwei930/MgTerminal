import test from 'node:test';
import assert from 'node:assert/strict';

import {
  requestApproval,
  resolveApproval,
  clearAllPendingApprovals,
  getPendingApprovalCount,
  onPendingApprovalCountChange,
  setupMcpApprovalBridge,
} from './approvalGate';

// requestApproval() logs an audit entry via localStorageAdapter, which is a no-op
// outside a browser (window/localStorage are undefined here); that's expected noise.

test('getPendingApprovalCount tracks requestApproval/resolveApproval transitions', async () => {
  assert.equal(getPendingApprovalCount(), 0);

  const pending = requestApproval('petgate-tc-1', 'testTool', {});
  assert.equal(getPendingApprovalCount(), 1);

  resolveApproval('petgate-tc-1', true);
  assert.equal(await pending, true);
  assert.equal(getPendingApprovalCount(), 0);
});

test('onPendingApprovalCountChange notifies subscribers on request, resolve, and clear', async () => {
  const seen: number[] = [];
  const unsubscribe = onPendingApprovalCountChange((count) => seen.push(count));

  const pending = requestApproval('petgate-tc-2', 'testTool', {});
  resolveApproval('petgate-tc-2', false);
  await pending;

  const pendingToClear = requestApproval('petgate-tc-3', 'testTool', {});
  clearAllPendingApprovals();
  await pendingToClear;

  unsubscribe();
  requestApproval('petgate-tc-4', 'testTool', {});
  clearAllPendingApprovals();

  assert.deepEqual(seen, [1, 0, 1, 0]);
});

test('external MCP approval requests/clears also notify the pending-approval count (pet "waiting" state)', () => {
  let requestHandler: ((payload: { approvalId: string; toolName: string; args: Record<string, unknown>; chatSessionId?: string }) => void) | null = null;
  let clearedHandler: ((payload: { approvalIds: string[] }) => void) | null = null;

  (globalThis as unknown as { window: unknown }).window = {
    magiesTerminal: {
      onMcpApprovalRequest: (cb: typeof requestHandler) => { requestHandler = cb; return () => { requestHandler = null; }; },
      onMcpApprovalCleared: (cb: typeof clearedHandler) => { clearedHandler = cb; return () => { clearedHandler = null; }; },
    },
  };

  try {
    const seen: number[] = [];
    const unsubscribeCount = onPendingApprovalCountChange((count) => seen.push(count));
    const unsubscribeBridge = setupMcpApprovalBridge();

    assert.equal(getPendingApprovalCount(), 0);
    requestHandler?.({ approvalId: 'mcp_approval_petgate-1', toolName: 'testTool', args: {} });
    assert.equal(getPendingApprovalCount(), 1, 'an incoming MCP approval request must raise the pending count');

    clearedHandler?.({ approvalIds: ['mcp_approval_petgate-1'] });
    assert.equal(getPendingApprovalCount(), 0, 'a main-process clear (timeout/cancel) must lower the pending count');

    assert.deepEqual(seen, [1, 0]);
    unsubscribeBridge();
    unsubscribeCount();
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});
