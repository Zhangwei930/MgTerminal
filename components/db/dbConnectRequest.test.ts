import assert from 'node:assert/strict';
import test from 'node:test';
import type { Host } from '../../types';
import type { DbConnectionProfile } from '../../domain/models';
import { buildDbConnectRequest } from './dbConnectRequest';

const profile = (overrides: Partial<DbConnectionProfile> = {}): DbConnectionProfile => ({
  id: 'conn-1',
  label: 'app db',
  engine: 'postgres',
  hostId: '',
  remoteHost: '127.0.0.1',
  remotePort: 5432,
  database: 'appdb',
  dbUsername: 'app',
  dbPassword: 'secret',
  createdAt: 0,
  ...overrides,
});

const host = (overrides: Partial<Host> = {}): Host =>
  ({ id: 'host-1', label: 'bastion', hostname: '10.0.0.1', username: 'ubuntu', port: 22, ...overrides }) as Host;

const buildSsh = () => ({ hostname: '10.0.0.1', username: 'ubuntu' });

// ── Direct connections ──────────────────────────────────────────────────────
//
// An empty hostId means the database is reachable from this machine, the way a
// desktop DB client normally connects. Requiring a saved SSH host there makes
// the direct mode unusable.

test('a profile with no hostId connects directly, without a host', () => {
  const result = buildDbConnectRequest({
    connectionProfile: profile(),
    host: undefined,
    buildSshOptions: buildSsh,
  });

  assert.equal(result.status, 'ready');
  assert.ok(result.status === 'ready');
  assert.equal(result.params.remoteHost, '127.0.0.1');
  assert.equal(result.params.remotePort, 5432);
});

test('a direct connection sends no hostId, so the backend opens no tunnel', () => {
  const result = buildDbConnectRequest({
    connectionProfile: profile(),
    host: undefined,
    buildSshOptions: buildSsh,
  });

  assert.ok(result.status === 'ready');
  // dbBridge keys `useTunnel` off exactly this field.
  assert.ok(!result.params.hostId);
});

test('a direct connection never builds SSH options', () => {
  let called = false;
  const result = buildDbConnectRequest({
    connectionProfile: profile(),
    host: undefined,
    buildSshOptions: () => { called = true; return buildSsh(); },
  });

  assert.ok(result.status === 'ready');
  assert.equal(called, false, 'built SSH options for a connection with no SSH leg');
});

// ── Tunnelled connections ───────────────────────────────────────────────────

test('a profile naming a host tunnels through it', () => {
  const result = buildDbConnectRequest({
    connectionProfile: profile({ hostId: 'host-1' }),
    host: host(),
    buildSshOptions: buildSsh,
  });

  assert.ok(result.status === 'ready');
  // Without this the backend dials the database directly and the SSH host is
  // silently ignored — the tunnel the user asked for never opens.
  assert.equal(result.params.hostId, 'host-1');
  assert.deepEqual(result.params.sshOptions, buildSsh());
});

test('a profile naming a host that no longer exists fails loudly', () => {
  const result = buildDbConnectRequest({
    connectionProfile: profile({ hostId: 'deleted-host' }),
    host: undefined,
    buildSshOptions: buildSsh,
  });

  assert.ok(result.status === 'error');
  assert.match(result.error, /host/i);
});

// ── Credentials ─────────────────────────────────────────────────────────────

test('database credentials are carried through unchanged', () => {
  const result = buildDbConnectRequest({
    connectionProfile: profile({ database: 'clinic', dbUsername: 'dba', dbPassword: 'pw' }),
    host: undefined,
    buildSshOptions: buildSsh,
  });

  assert.ok(result.status === 'ready');
  assert.equal(result.params.database, 'clinic');
  assert.equal(result.params.dbUsername, 'dba');
  assert.equal(result.params.dbPassword, 'pw');
  assert.equal(result.params.engine, 'postgres');
  assert.equal(result.params.connectionId, 'conn-1');
});
