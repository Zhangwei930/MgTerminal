// Lightweight DB client — connection profiles are SSH-tunneled to an existing vault Host.
//
// 'mariadb' is MySQL's wire protocol and SQL dialect; it exists as its own
// engine so the UI can name it, and every dialect switch pairs it with mysql.
// 'sqlite' is a local file rather than a server, so it has no host, port,
// username or password — see isFileEngine.
export type DbEngine = 'mysql' | 'mariadb' | 'postgres' | 'mssql' | 'oracle' | 'sqlite';

export interface DbConnectionProfile {
  id: string;
  label: string;
  engine: DbEngine;
  /**
   * Saved SSH host to tunnel through. Empty means a direct connection: the
   * database is reachable from this machine and no SSH leg is involved.
   */
  hostId: string;
  /**
   * Where the database listens. For a direct connection this is the address
   * this machine dials; when tunnelling it is the address as seen from the
   * SSH host, usually '127.0.0.1'.
   */
  remoteHost: string;
  remotePort: number;
  database?: string;
  /**
   * TLS for a *direct* connection. Ignored when tunnelling, where the SSH leg
   * already encrypts the transport. Absent means 'disable'.
   *
   * 'require' encrypts without checking the certificate — the mode that makes
   * a self-signed cert on an internal server usable, and the reason there are
   * three modes rather than a checkbox.
   */
  ssl?: { mode: 'disable' | 'require' | 'verify'; ca?: string };
  dbUsername?: string;
  dbPassword?: string; // ciphertext at rest — see infrastructure/persistence/secureFieldAdapter
  order?: number;
  createdAt: number;
}

export type DbColumnType = 'string' | 'number' | 'boolean' | 'date' | 'binary' | 'null' | 'json';

export interface DbResultColumn {
  name: string;
  type: DbColumnType;
}

export interface DbQueryResult {
  columns: DbResultColumn[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  affectedRows?: number;
}

const DEFAULT_PORT_BY_ENGINE: Record<DbEngine, number> = {
  mysql: 3306,
  mariadb: 3306,
  postgres: 5432,
  mssql: 1433,
  oracle: 1521,
  // Not a network engine; the field is unused and 0 keeps the map total.
  sqlite: 0,
};

export function defaultPortForEngine(engine: DbEngine): number {
  return DEFAULT_PORT_BY_ENGINE[engine];
}

/**
 * True for engines that open a file rather than dial a server.
 *
 * These have no host, port, username or password, and cannot be tunnelled —
 * `remoteHost` carries the file path instead. Every form and connect path
 * branches on this rather than on `engine === 'sqlite'`, so adding another
 * file-backed engine later is one edit.
 */
export function isFileEngine(engine: DbEngine): boolean {
  return engine === 'sqlite';
}
