import { AlertTriangle, Check, Download, Loader2, Play, Square, Undo2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { useIsDbWorkspaceTabActive } from '../../application/state/activeTabStore';
import { useDbClientBackend } from '../../application/state/useDbClientBackend';
import { useDbSchema } from '../../application/state/useDbSchema';
import { useDbTransaction } from '../../application/state/useDbTransaction';
import { useDbRowEditing } from '../../application/state/useDbRowEditing';
import { resolveEditableTable } from '../../domain/db/editableResult';
import { UTF8_BOM, toCsv, toJson } from '../../domain/db/resultExport';
import { dbWorkspaceTabStore, useDbWorkspaceTabs } from '../../application/state/dbWorkspaceTabStore';
import { buildConnectionDiagnosticsRequest } from '../../domain/connectionDiagnostics';
import type { DbConnectionProfile, DbResultColumn } from '../../domain/models';
import type { Host, Identity, KnownHost, SSHKey } from '../../types';
import { Button } from '../ui/button';
import { attemptDbConnection } from './dbConnectAttempt';
import { buildDbConnectRequest } from './dbConnectRequest';
import { DbResultsGrid } from './DbResultsGrid';
import { DbSchemaTree } from './DbSchemaTree';
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
  const { connect, close, runQuery, cancelQuery, exportResult } = useDbClientBackend();
  const tabs = useDbWorkspaceTabs();
  const sqlDraft = tabs.find((tab) => tab.connectionId === connectionProfile.id)?.sqlDraft ?? '';

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [result, setResult] = useState<{ columns: DbResultColumn[]; rows: unknown[][] } | null>(null);
  const [meta, setMeta] = useState<{ rowCount: number; durationMs: number; truncated: boolean; affectedRows?: number } | null>(null);
  // The draft keeps changing as the user types; editing has to key off the SQL
  // that actually produced the rows on screen.
  const [resultSql, setResultSql] = useState<string | null>(null);

  const connectionId = connectionProfile.id;
  const activeQueryIdRef = useRef<string | null>(null);
  // One schema for the tab: the tree renders it, the editor completes against it.
  const schema = useDbSchema(connectionId, status === 'connected');
  const transaction = useDbTransaction(connectionId, connectionProfile.engine);
  const rowEditing = useDbRowEditing({
    connectionId,
    engine: connectionProfile.engine,
    sql: resultSql,
    columns: result?.columns ?? [],
  });

  useEffect(() => {
    const request = buildDbConnectRequest({
      connectionProfile,
      host,
      buildSshOptions: () =>
        buildConnectionDiagnosticsRequest({ host: host as Host, keys, identities, knownHosts }),
    });
    if (request.status === 'error') {
      setStatus('error');
      setConnectError(request.error);
      return;
    }
    let cancelled = false;

    void attemptDbConnection(connect, request.params).then((outcome) => {
      if (cancelled) return;
      setStatus(outcome.status);
      setConnectError(outcome.status === 'error' ? outcome.error : null);
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
    setResultSql(sqlDraft);

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

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      if (!result) return;
      const base = (resultSql && resolveEditableTable(resultSql)) || 'query-result';
      // The BOM goes on the file only — Excel needs it to read UTF-8, and it
      // is written here rather than by toCsv so a clipboard copy never gets it.
      const content = format === 'csv'
        ? UTF8_BOM + toCsv(result.columns, result.rows)
        : toJson(result.columns, result.rows);

      const outcome = await exportResult({
        content,
        defaultFileName: `${base.replace(/[^\w.-]/g, '_')}.${format}`,
        format,
      });
      if (!outcome.success && !outcome.canceled) setQueryError(outcome.error ?? 'Export failed');
    },
    [exportResult, result, resultSql],
  );

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
        <div className="mx-3 flex items-center gap-2 border-l border-border/60 pl-3">
          <label
            className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"
            title={t('db.tx.autoCommitHint')}
          >
            <input
              type="checkbox"
              checked={transaction.autoCommit}
              disabled={status !== 'connected' || transaction.busy}
              onChange={(event) => void transaction.setAutoCommit(event.target.checked)}
            />
            {t('db.tx.autoCommit')}
          </label>
          {!transaction.autoCommit && (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={transaction.busy}
                onClick={() => void transaction.commit()}
              >
                <Check size={13} className="mr-1.5" /> {t('db.tx.commit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={transaction.busy}
                onClick={() => void transaction.rollback()}
              >
                <Undo2 size={13} className="mr-1.5" /> {t('db.tx.rollback')}
              </Button>
            </>
          )}
        </div>

        {result && result.rows.length > 0 && (
          <div className="flex items-center gap-1 border-l border-border/60 pl-3">
            <Button size="sm" variant="ghost" onClick={() => void handleExport('csv')}>
              <Download size={13} className="mr-1.5" /> {t('db.export.csv')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleExport('json')}>
              {t('db.export.json')}
            </Button>
          </div>
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
      {transaction.error && (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle size={13} /> {transaction.error}
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

      <div className="flex min-h-0 flex-1">
        <div className="w-56 shrink-0">
          <DbSchemaTree
            engine={connectionProfile.engine}
            tables={schema.tables}
            loading={schema.loading}
            error={schema.error}
            ready={status === 'connected'}
            onReload={() => void schema.reload()}
            getColumns={schema.getColumns}
            onOpenTable={(sql) => dbWorkspaceTabStore.setSqlDraft(connectionId, sql)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-[45%] min-h-[120px] border-b border-border/60">
            <SqlCodeEditor
              value={sqlDraft}
              onChange={(value) => dbWorkspaceTabStore.setSqlDraft(connectionId, value)}
              onRun={handleRun}
              completionSource={{ tables: schema.tables, getColumns: schema.getColumns }}
            />
          </div>
          <div className="min-h-0 flex-1">
            {result && (
              <DbResultsGrid
                columns={result.columns}
                rows={result.rows}
                onCommitEdit={rowEditing.editable ? rowEditing.commitEdit : undefined}
                readOnlyReason={rowEditing.reason ? t(`db.edit.${rowEditing.reason}`) : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
