import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const hookSource = readFileSync(new URL('./useUpdateCheck.ts', import.meta.url), 'utf8');
const systemTabSource = readFileSync(
  new URL('../../components/settings/tabs/SettingsSystemTab.tsx', import.meta.url),
  'utf8',
);

test('update install shows an installing state before invoking the bridge', () => {
  assert.match(hookSource, /AutoDownloadStatus = [^\n]*'installing'/);
  const installStart = hookSource.indexOf('const installUpdate = useCallback');
  const bridgeInvoke = hookSource.indexOf('await bridge.installUpdate()', installStart);
  const installingState = hookSource.indexOf("autoDownloadStatus: 'installing'", installStart);

  assert.notEqual(installStart, -1);
  assert.notEqual(bridgeInvoke, -1);
  assert.ok(installingState > installStart && installingState < bridgeInvoke);
});

test('update install handles an empty bridge result without a secondary exception', () => {
  assert.match(hookSource, /if \(result\?\.unsupported\)/);
});

test('system settings disables the install button while restart is starting', () => {
  assert.match(systemTabSource, /autoDownloadStatus === 'installing'/);
  assert.match(systemTabSource, /settings\.update\.installing/);
});
