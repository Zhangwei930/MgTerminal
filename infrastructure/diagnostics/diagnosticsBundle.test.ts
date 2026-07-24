import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_KEY_AI_APPROVAL_AUDIT, STORAGE_KEY_CONNECTION_LOGS } from '../config/storageKeys';
import type { ConnectionLog } from '../../domain/models';
import {
  buildDiagnosticsBundle,
  serializeDiagnosticsBundle,
  toSafeConnectionLogSummary,
} from './diagnosticsBundle';

const memory = new Map<string, string>();

test.beforeEach(() => {
  memory.clear();
  const store = {
    get length() { return memory.size; },
    clear() { memory.clear(); },
    getItem(key: string) { return memory.has(key) ? memory.get(key)! : null; },
    setItem(key: string, value: string) { memory.set(key, String(value)); },
    removeItem(key: string) { memory.delete(key); },
    key(index: number) { return [...memory.keys()][index] ?? null; },
  };
  (globalThis as { localStorage: Storage }).localStorage = store as Storage;
  (globalThis as { window: unknown }).window = {};
});

const sampleConnectionLog: ConnectionLog = {
  id: 'log-1',
  sessionId: 'sess-1',
  hostId: 'host-1',
  hostLabel: 'prod-db-01',
  hostname: 'db.internal.example.com',
  username: 'alice',
  protocol: 'ssh',
  authMethod: 'publickey',
  hostOs: 'linux',
  startTime: 1000,
  endTime: 2000,
  localUsername: 'alice-laptop',
  localHostname: 'alices-mbp',
  saved: false,
  terminalData: 'cat ~/.ssh/id_rsa\n-----BEGIN OPENSSH PRIVATE KEY-----...',
};

test('toSafeConnectionLogSummary strips hostname, username, and terminal replay data', () => {
  const summary = toSafeConnectionLogSummary(sampleConnectionLog);
  assert.deepEqual(summary, {
    id: 'log-1',
    sessionId: 'sess-1',
    hostId: 'host-1',
    protocol: 'ssh',
    authMethod: 'publickey',
    hostOs: 'linux',
    startTime: 1000,
    endTime: 2000,
  });
  assert.ok(!('hostname' in summary));
  assert.ok(!('username' in summary));
  assert.ok(!('localUsername' in summary));
  assert.ok(!('localHostname' in summary));
  assert.ok(!('hostLabel' in summary));
  assert.ok(!('terminalData' in summary));
});

test('buildDiagnosticsBundle aggregates crash logs, connection logs, and approval audit', async () => {
  memory.set(STORAGE_KEY_CONNECTION_LOGS, JSON.stringify([sampleConnectionLog]));
  memory.set(STORAGE_KEY_AI_APPROVAL_AUDIT, JSON.stringify([
    { id: 'a1', at: 5, phase: 'resolved', toolName: 'sftp_write', outcome: 'approved' },
  ]));

  (globalThis as { window: unknown }).window = {
    magiesTerminal: {
      getAppInfo: async () => ({ name: 'MagiesTerminal', version: '1.2.3', platform: 'darwin' }),
      getCrashLogs: async () => [
        { fileName: 'crash-2026-07-24.log', date: '2026-07-24', size: 100, entryCount: 1 },
      ],
      readCrashLog: async (fileName: string) => {
        assert.equal(fileName, 'crash-2026-07-24.log');
        return [{ timestamp: '2026-07-24T00:00:00.000Z', source: 'main', message: 'oops' }];
      },
      getRpcInvocationLogs: async () => [
        { fileName: 'rpc-2026-07-24.log', date: '2026-07-24', size: 50, entryCount: 1 },
      ],
      readRpcInvocationLog: async (fileName: string) => {
        assert.equal(fileName, 'rpc-2026-07-24.log');
        return [{ timestamp: '2026-07-24T00:00:00.000Z', source: 'cli', method: 'vault.host.list', ok: true, durationMs: 12 }];
      },
    },
  };

  const bundle = await buildDiagnosticsBundle();

  assert.equal(bundle.app?.version, '1.2.3');
  assert.equal(bundle.crashLogs.length, 1);
  assert.equal(bundle.crashLogs[0].entries.length, 1);
  assert.equal(bundle.connectionLogs.length, 1);
  assert.equal(bundle.connectionLogs[0].id, 'log-1');
  assert.ok(!('terminalData' in bundle.connectionLogs[0]));
  assert.equal(bundle.approvalAudit.length, 1);
  assert.equal(bundle.approvalAudit[0].toolName, 'sftp_write');
  assert.equal(bundle.rpcInvocationLogs.length, 1);
  assert.equal(bundle.rpcInvocationLogs[0].entries.length, 1);
  assert.equal(bundle.rpcInvocationLogs[0].entries[0].method, 'vault.host.list');
  assert.ok(bundle.generatedAt);
});

test('buildDiagnosticsBundle degrades gracefully when the bridge is unavailable', async () => {
  const bundle = await buildDiagnosticsBundle();
  assert.equal(bundle.app, null);
  assert.deepEqual(bundle.crashLogs, []);
  assert.deepEqual(bundle.connectionLogs, []);
  assert.deepEqual(bundle.approvalAudit, []);
  assert.deepEqual(bundle.rpcInvocationLogs, []);
});

test('serializeDiagnosticsBundle produces pretty-printed JSON', async () => {
  const bundle = await buildDiagnosticsBundle();
  const text = serializeDiagnosticsBundle(bundle);
  assert.equal(JSON.parse(text).generatedAt, bundle.generatedAt);
  assert.ok(text.includes('\n  '));
});
