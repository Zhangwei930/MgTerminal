// Lightweight DB client — connection profiles are SSH-tunneled to an existing vault Host.
export type DbEngine = 'mysql' | 'postgres' | 'mssql' | 'oracle';

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
  postgres: 5432,
  mssql: 1433,
  oracle: 1521,
};

export function defaultPortForEngine(engine: DbEngine): number {
  return DEFAULT_PORT_BY_ENGINE[engine];
}
