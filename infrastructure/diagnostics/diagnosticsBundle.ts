/**
 * Aggregates the diagnostic sources that already exist (main-process crash
 * logs, RPC invocation logs, connection history, AI tool-approval audit)
 * into a single exportable bundle for Settings > System > Diagnostics.
 *
 * Connection log entries are reduced to a safe subset — hostnames, usernames,
 * and captured terminal replay data are never included, since this bundle is
 * meant to be shared for troubleshooting.
 */
import { localStorageAdapter } from '../persistence/localStorageAdapter';
import { STORAGE_KEY_CONNECTION_LOGS } from '../config/storageKeys';
import { readApprovalAuditPersisted, type ApprovalAuditEntry } from '../ai/approvalAudit';
import type { ConnectionLog } from '../../domain/models';

export interface SafeConnectionLogSummary {
  id: string;
  sessionId?: string;
  hostId: string;
  protocol: ConnectionLog['protocol'];
  authMethod?: string;
  hostOs?: ConnectionLog['hostOs'];
  startTime: number;
  endTime?: number;
}

export interface DiagnosticsLogFile<TEntry = unknown> {
  fileName: string;
  date: string;
  entryCount: number;
  entries: TEntry[];
}

export type DiagnosticsCrashLogFile = DiagnosticsLogFile;

export interface RpcInvocationLogEntry {
  timestamp: string;
  source: string;
  method: string;
  ok: boolean;
  durationMs?: number;
  errorCode?: string;
}

export interface DiagnosticsBundle {
  generatedAt: string;
  app: { name: string; version: string; platform: string } | null;
  environment: { userAgent: string; language: string };
  crashLogs: DiagnosticsLogFile[];
  rpcInvocationLogs: DiagnosticsLogFile<RpcInvocationLogEntry>[];
  connectionLogs: SafeConnectionLogSummary[];
  approvalAudit: ApprovalAuditEntry[];
}

interface DiagnosticsBridge {
  getAppInfo?(): Promise<{ name: string; version: string; platform: string }>;
  getCrashLogs?(): Promise<Array<{ fileName: string; date: string; size: number; entryCount: number }>>;
  readCrashLog?(fileName: string): Promise<unknown[]>;
  getRpcInvocationLogs?(): Promise<Array<{ fileName: string; date: string; size: number; entryCount: number }>>;
  readRpcInvocationLog?(fileName: string): Promise<RpcInvocationLogEntry[]>;
}

const MAX_LOG_FILES = 3;
const MAX_CONNECTION_LOGS = 50;

function getBridge(): DiagnosticsBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { magiesTerminal?: DiagnosticsBridge }).magiesTerminal;
}

export function toSafeConnectionLogSummary(log: ConnectionLog): SafeConnectionLogSummary {
  return {
    id: log.id,
    sessionId: log.sessionId,
    hostId: log.hostId,
    protocol: log.protocol,
    authMethod: log.authMethod,
    hostOs: log.hostOs,
    startTime: log.startTime,
    endTime: log.endTime,
  };
}

async function collectLogFiles<TEntry>(
  list: (() => Promise<Array<{ fileName: string; date: string; size: number; entryCount: number }>>) | undefined,
  read: ((fileName: string) => Promise<TEntry[]>) | undefined,
): Promise<DiagnosticsLogFile<TEntry>[]> {
  if (!list || !read) return [];
  try {
    const files = await list();
    const recent = files.slice(0, MAX_LOG_FILES);
    return await Promise.all(recent.map(async (file) => ({
      fileName: file.fileName,
      date: file.date,
      entryCount: file.entryCount,
      entries: await read(file.fileName),
    })));
  } catch {
    return [];
  }
}

function collectConnectionLogs(): SafeConnectionLogSummary[] {
  const logs = localStorageAdapter.read<ConnectionLog[]>(STORAGE_KEY_CONNECTION_LOGS) ?? [];
  return logs.slice(0, MAX_CONNECTION_LOGS).map(toSafeConnectionLogSummary);
}

export async function buildDiagnosticsBundle(): Promise<DiagnosticsBundle> {
  const bridge = getBridge();

  let app: DiagnosticsBundle['app'] = null;
  try {
    app = (await bridge?.getAppInfo?.()) ?? null;
  } catch {
    app = null;
  }

  const [crashLogs, rpcInvocationLogs, approvalAudit] = await Promise.all([
    collectLogFiles<unknown>(bridge?.getCrashLogs?.bind(bridge), bridge?.readCrashLog?.bind(bridge)),
    collectLogFiles<RpcInvocationLogEntry>(bridge?.getRpcInvocationLogs?.bind(bridge), bridge?.readRpcInvocationLog?.bind(bridge)),
    readApprovalAuditPersisted(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    app,
    environment: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      language: typeof navigator !== 'undefined' ? navigator.language : '',
    },
    crashLogs,
    rpcInvocationLogs,
    connectionLogs: collectConnectionLogs(),
    approvalAudit,
  };
}

export function serializeDiagnosticsBundle(bundle: DiagnosticsBundle): string {
  return JSON.stringify(bundle, null, 2);
}
