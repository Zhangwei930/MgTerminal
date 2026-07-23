import assert from 'node:assert/strict';
import test from 'node:test';

import { dbWorkspaceTabStore } from './dbWorkspaceTabStore.ts';

test('openOrFocus opens a tab once and is idempotent', () => {
  dbWorkspaceTabStore.openOrFocus('c1');
  dbWorkspaceTabStore.openOrFocus('c1');
  assert.equal(dbWorkspaceTabStore.getTabs().length, 1);
  assert.equal(dbWorkspaceTabStore.isOpen('c1'), true);
  dbWorkspaceTabStore.close('c1');
});

test('setSqlDraft updates only the matching tab and preserves others', () => {
  dbWorkspaceTabStore.openOrFocus('c1');
  dbWorkspaceTabStore.openOrFocus('c2');
  dbWorkspaceTabStore.setSqlDraft('c1', 'SELECT 1');
  assert.equal(dbWorkspaceTabStore.getTab('c1')?.sqlDraft, 'SELECT 1');
  assert.equal(dbWorkspaceTabStore.getTab('c2')?.sqlDraft, '');
  dbWorkspaceTabStore.close('c1');
  dbWorkspaceTabStore.close('c2');
});

test('close removes only the targeted tab', () => {
  dbWorkspaceTabStore.openOrFocus('c1');
  dbWorkspaceTabStore.openOrFocus('c2');
  dbWorkspaceTabStore.close('c1');
  assert.equal(dbWorkspaceTabStore.isOpen('c1'), false);
  assert.equal(dbWorkspaceTabStore.isOpen('c2'), true);
  dbWorkspaceTabStore.close('c2');
});

test('subscribe notifies listeners on open/close/draft changes', () => {
  let notifications = 0;
  const unsubscribe = dbWorkspaceTabStore.subscribe(() => { notifications += 1; });
  dbWorkspaceTabStore.openOrFocus('c3');
  dbWorkspaceTabStore.setSqlDraft('c3', 'SELECT 2');
  dbWorkspaceTabStore.close('c3');
  assert.equal(notifications, 3);
  unsubscribe();
});
