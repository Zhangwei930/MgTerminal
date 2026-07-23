import { AlertTriangle, Loader2, Play, Square } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { useIsDbWorkspaceTabActive } from '../../application/state/activeTabStore';
import { useDbClientBackend } from '../../application/state/useDbClientBackend';
import { dbWorkspaceTabStore, useDbWorkspaceTabs } from '../../application/state/dbWorkspaceTabStore';
import { buildConnectionDiagnosticsRequest } from '../../domain/connectionDiagnostics';
import type { DbConnectionProfile, DbResultColumn } from '../../domain/models';
import type { Host, Identity, KnownHost, SSHKey } from '../../types';
import { Button } from '../ui/button';
import { DbResultsGrid } from './DbResultsGrid';
import { SqlCodeEditor } from './SqlCodeEditor';

interface DbWorkspaceTabViewProps {
  connectionProfile: DbConnectionProfile;
  host: Host | undefined;
  keys: SSHKey[];
  identities: Identity[];
  knownHosts: KnownHost[];
}

type ConnectionStatus = 'connecting' | 'connected' | 'error';

export const DbWorkspaceTabView: React.FC<DbWorkspaceTabViewProps> = ({
  connectionProfile,
  host,
  keys,
  identities,
  knownHosts,
}) => {
  const { t } = useI18n();
  const isVisible = useIsDbWorkspaceTabActive(connectionProfile.id);
  const { connect, close, runQuery, cancelQuery } = useDbClientBackend();
  const tabs = useDbWorkspaceTabs();
  const sqlDraft = tabs.find((tab) => tab.connectionId === connectionProfile.id)?.sqlDraft ?? '';

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [result, setResult] = useState<{ columns: DbResultColumn[]; rows: unknown[][] } | null>(null);
  const [meta, setMeta] = useState<{ rowCount: number; durationMs: number; truncated: boolean; affectedRows?: number } | null>(null);

  const connectionId = connectionProfile.id;
  const activeQueryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!host) {
      setStatus('error');
      setConnectError('Host not found');
      return;
    }
    let cancelled = false;
    const sshOptions = buildConnectionDiagnosticsRequest({ host, keys, identities, knownHosts });

    connect({
      connectionId,
      engine: connectionProfile.engine,
      sshOptions,
      remoteHost: connectionProfile.remoteHost,
      remotePort: connectionProfile.remotePort,
      database: connectionProfile.database,
      dbUsername: connectionProfile.dbUsername,
      dbPassword: connectionProfile.dbPassword,
    }).then((res) => {
      if (cancelled) return;
      if (res.success) {
        setStatus('connected');
      } else {
        setStatus('error');
        setConnectError(res.error ?? 'Connection failed');
      }
    });

    return () => {
      cancelled = true;
      void close(connectionId);
    };
    // Intentionally connect once per mounted tab (id is stable for its lifetime).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const handleRun = useCallback(() => {
    if (status !== 'connected' || isRunning || !sqlDraft.trim()) return;
    const queryId = crypto.randomUUID();
    activeQueryIdRef.current = queryId;
    setIsRunning(true);
    setQueryError(null);
    setResult(null);
    setMeta(null);

    let accumulatedColumns: DbResultColumn[] = [];
    let accumulatedRows: unknown[][] = [];

    void runQuery(
      { connectionId, queryId, sql: sqlDraft },
      {
        onRows: (payload) => {
          if (activeQueryIdRef.current !== queryId) return;
          if (payload.columns) accumulatedColumns = payload.columns;
          accumulatedRows = [...accumulatedRows, ...payload.rows];
          setResult({ columns: accumulatedColumns, rows: accumulatedRows });
        },
        onComplete: (payload) => {
          if (activeQueryIdRef.current !== queryId) return;
          setIsRunning(false);
          setMeta(payload);
        },
        onError: (payload) => {
          if (activeQueryIdRef.current !== queryId) return;
          setIsRunning(false);
          setQueryError(payload.error);
        },
      },
    );
  }, [status, isRunning, sqlDraft, connectionId, runQuery]);

  const handleCancel = useCallback(() => {
    void cancelQuery(connectionId);
  }, [cancelQuery, connectionId]);

  return (
    <div
      className="absolute inset-0 flex flex-col bg-background"
      style={isVisible ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Button size="sm" onClick={handleRun} disabled={status !== 'connected' || isRunning}>
          <Play size={13} className="mr-1.5" /> {t('db.workspace.run')}
        </Button>
        {isRunning && (
          <Button size="sm" variant="ghost" onClick={handleCancel}>
            <Square size={13} className="mr-1.5" /> {t('db.workspace.cancel')}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {status === 'connecting' && (
            <span className="flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {t('db.workspace.connecting')}</span>
          )}
          {status === 'connected' && meta && !isRunning && (
            <span>
              {meta.affectedRows !== undefined
                ? t('db.workspace.rowsAffected', { count: meta.affectedRows })
                : t('db.workspace.rowCount', { count: meta.rowCount })}
              {' · '}{meta.durationMs}ms
            </span>
          )}
        </div>
      </div>

      {status === 'error' && connectError && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle size={13} /> {connectError}
        </div>
      )}
      {queryError && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle size={13} /> {queryError}
        </div>
      )}
      {meta?.truncated && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600">
          {t('db.workspace.truncated', { count: meta.rowCount })}
        </div>
      )}

      <div className="h-[45%] min-h-[120px] border-b border-border/60">
        <SqlCodeEditor
          value={sqlDraft}
          onChange={(value) => dbWorkspaceTabStore.setSqlDraft(connectionId, value)}
          onRun={handleRun}
        />
      </div>
      <div className="min-h-0 flex-1">
        {result && <DbResultsGrid columns={result.columns} rows={result.rows} />}
      </div>
    </div>
  );
};
