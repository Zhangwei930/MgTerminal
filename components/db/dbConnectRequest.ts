import type { DbConnectionProfile } from '../../domain/models';
import type { Host } from '../../types';

/**
 * Turns a saved profile into the payload dbBridge.connect expects.
 *
 * Two things depend on getting this right, and both used to be wrong:
 *
 * - A profile with no `hostId` is a direct connection — the database is
 *   reachable from this machine, the way any desktop DB client connects. The
 *   view used to demand a host unconditionally, so direct profiles failed with
 *   "Host not found" before a single packet went out.
 *
 * - `hostId` has to reach the backend, because dbBridge keys `useTunnel` off
 *   exactly that field. Omitting it meant a profile that named an SSH host
 *   still dialled the database directly, ignoring the tunnel the user asked
 *   for — a connection that fails when the database is only reachable from the
 *   bastion, and one that leaves the traffic unencrypted when it isn't.
 *
 * `buildSshOptions` is a thunk rather than a value so a direct connection never
 * pays for (or fails inside) SSH option resolution.
 */

export interface DbConnectParams {
  connectionId: string;
  engine: DbConnectionProfile['engine'];
  hostId?: string;
  sshOptions?: unknown;
  remoteHost: string;
  remotePort: number;
  database?: string;
  dbUsername?: string;
  dbPassword?: string;
}

/**
 * Discriminated on a string, not a boolean: this project does not enable
 * `strictNullChecks`, and without it TypeScript will not narrow a union on a
 * boolean literal — `if (!request.ok)` leaves `request.error` unreachable.
 * Matches DbConnectOutcome in dbConnectAttempt.ts.
 */
export type DbConnectRequest =
  | { status: 'ready'; params: DbConnectParams }
  | { status: 'error'; error: string };

interface BuildArgs {
  connectionProfile: DbConnectionProfile;
  host: Host | undefined;
  buildSshOptions: () => unknown;
}

export function buildDbConnectRequest({
  connectionProfile,
  host,
  buildSshOptions,
}: BuildArgs): DbConnectRequest {
  const base: DbConnectParams = {
    connectionId: connectionProfile.id,
    engine: connectionProfile.engine,
    remoteHost: connectionProfile.remoteHost,
    remotePort: connectionProfile.remotePort,
    database: connectionProfile.database,
    dbUsername: connectionProfile.dbUsername,
    dbPassword: connectionProfile.dbPassword,
  };

  if (!connectionProfile.hostId) return { status: 'ready', params: base };

  if (!host) {
    return { status: 'error', error: `SSH host not found for this connection (${connectionProfile.hostId})` };
  }

  return {
    status: 'ready',
    params: { ...base, hostId: connectionProfile.hostId, sshOptions: buildSshOptions() },
  };
}
