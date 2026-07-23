// Shared shape for per-engine adapters in this directory. Documented here as a
// .d.ts since the adapters themselves are plain .cjs (main-process only, no
// TS build step) — this file is not imported at runtime, only for reference.

export interface DbAdapterRowBatch {
  /** Present only on the first batch of a query's results. */
  columns?: { name: string; type: DbColumnType }[];
  rows: unknown[][];
}

export type DbColumnType = 'string' | 'number' | 'boolean' | 'date' | 'binary' | 'null' | 'json';

export interface DbAdapterConnectOptions {
  host: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
}

export interface DbAdapterQueryOptions {
  maxRows: number;
  onRowBatch: (batch: DbAdapterRowBatch) => void;
}

export interface DbAdapterQueryResult {
  rowCount: number;
  truncated: boolean;
  affectedRows?: number;
}

export interface DbAdapter {
  connect(opts: DbAdapterConnectOptions): Promise<{ serverVersion?: string }>;
  query(sql: string, opts: DbAdapterQueryOptions): Promise<DbAdapterQueryResult>;
  cancel(): Promise<void>;
  close(): Promise<void>;
}
