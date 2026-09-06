import { AlertTriangle, Check, Download, GitBranch, GitCompare, History, Loader2, Network, Play, Square, Undo2 } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { useIsDbWorkspaceTabActive } from '../../application/state/activeTabStore';
import { useDbClientBackend } from '../../application/state/useDbClientBackend';
import { useLocalTextFile } from '../../application/state/useLocalTextFile';
import { useDbSchema } from '../../application/state/useDbSchema';
import { useDbTransaction } from '../../application/state/useDbTransaction';
import { useDbRowEditing } from '../../application/state/useDbRowEditing';
import { dbQueryHistoryStore, useDbQueryHistory } from '../../application/state/dbQueryHistoryStore';
import { resolveEditableTable } from '../../domain/db/editableResult';
import { formatQualifiedTable } from '../../domain/db/identifiers';
import { assembleDatabaseDump, type DumpTable, dumpFileName } from '../../domain/db/databaseDump';
import { buildPagedQuery, canPaginate } from '../../domain/db/pagedQuery';
import { buildPreviewSelect } from '../../domain/db/previewQuery';
import { splitSqlStatements } from '../../domain/db/splitStatements';
import { buildDropTable } from '../../domain/db/tableDesignerSql';
import type { DesignerRow } from '../../domain/db/tableDesignerDiff';
import { DbTableDesigner } from './DbTableDesigner';
import { DbImportPanel } from './DbImportPanel';
import { DbQueryBuilderPanel } from './DbQueryBuilderPanel';
import { UTF8_BOM, toCsv, toHtml, toJson, toMarkdown, toXml } from '../../domain/db/resultExport';
import { buildInsertStatements } from '../../domain/db/sqlDump';
import { buildExplainQuery, canExplain, explainFollowUpQuery } from '../../domain/db/explainQuery';
import { dbWorkspaceTabStore, useDbWorkspaceTabs } from '../../application/state/dbWorkspaceTabStore';
import { buildConnectionDiagnosticsRequest } from '../../domain/connectionDiagnostics';
import type { DbConnectionProfile, DbResultColumn } from '../../domain/models';
import type { Host, Identity, KnownHost, SSHKey } from '../../types';
import { Button } from '../ui/button';
import { attemptDbConnection } from './dbConnectAttempt';
import { buildDbConnectRequest } from './dbConnectRequest';
import { DbResultsGrid } from './DbResultsGrid';
import { DbErDiagram } from './DbErDiagram';
import { DbSchemaDiffPanel } from './DbSchemaDiffPanel';
import { DbQueryHistoryPanel } from './DbQueryHistoryPanel';
import { DbSchemaTree } from './DbSchemaTree';
import { SqlCodeEditor } from './SqlCodeEditor';

interface DbWorkspaceTabViewProps {
  connectionProfile: DbConnectionProfile;
  /** Every saved connection, so a structure comparison can pick a target. */
  connections: DbConnectionProfile[];
  host: Host | undefined;
  keys: SSHKey[];
  identities: Identity[];
  knownHosts: KnownHost[];
}

type ConnectionStatus = 'connecting' | 'connected' | 'error';

/** Rows fetched per page. Small enough that a big table opens instantly. */
const DEFAULT_PAGE_SIZE = 200;
const PAGE_SIZES = [100, 200, 500, 1000];
/**
 * Rows per table in a whole-database dump.
 *
 * A cap rather than everything: the rows are buffered in the renderer before
 * the file is written, and a table with millions of rows would exhaust memory
 * long before it reached disk. The header does not claim the dump is complete.
 */
const DUMP_ROW_CAP = 100000;

export const DbWorkspaceTabView: React.FC<DbWorkspaceTabViewProps> = ({
  connectionProfile,
  connections,
  host,
  keys,
  identities,
  knownHosts,
}) => {
  const { t } = useI18n();
  const isVisible = useIsDbWorkspaceTabActive(connectionProfile.id);
  const { connect, close, runQuery, runStatements, collectQuery, cancelQuery, exportResult } = useDbClientBackend();
  const { pickAndRead } = useLocalTextFile();
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [erOpen, setErOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  /** Null when closed; `table: null` designs a new one. */
  const [designer, setDesigner] = useState<
    { table: DbSchemaTable | null; columns: DesignerRow[] } | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  /** Page of the current result. Reset whenever a new query is run. */
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  /** The SQL the pager pages — the user's, not the wrapped form. */
  const [pagedSource, setPagedSource] = useState<string | null>(null);
  /** Non-null while a dump or restore is running; blocks the buttons. */
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const queryHistory = useDbQueryHistory();

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

  const runSql = useCallback((sqlToRun: string) => {
    if (status !== 'connected' || isRunning || !sqlToRun.trim()) return;
    const queryId = crypto.randomUUID();
    activeQueryIdRef.current = queryId;
    setIsRunning(true);
    setQueryError(null);
    setResult(null);
    setMeta(null);
    setResultSql(sqlToRun);

    let accumulatedColumns: DbResultColumn[] = [];
    let accumulatedRows: unknown[][] = [];

    void runQuery(
      { connectionId, queryId, sql: sqlToRun },
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
          dbQueryHistoryStore.record({
            sql: sqlToRun,
            connectionId,
            ok: true,
            rowCount: payload.rowCount,
            durationMs: payload.durationMs,
          });
        },
        onError: (payload) => {
          if (activeQueryIdRef.current !== queryId) return;
          setIsRunning(false);
          setQueryError(payload.error);
          // A failed statement is recorded too — finding the one that errored
          // is exactly when history earns its keep.
          dbQueryHistoryStore.record({ sql: sqlToRun, connectionId, ok: false });
        },
      },
    );
  }, [status, isRunning, connectionId, runQuery]);

  /**
   * Runs everything in the editor, not just the first statement.
   *
   * The leading statements go through runStatements, which stops at the first
   * failure and says which one it was; the last one goes through runSql so its
   * rows land in the grid. That is the behaviour a script needs — setup
   * statements followed by the select you actually wanted to look at.
   */
  /**
   * Runs one page of a query. The pager holds the user's own SQL and wraps it
   * per engine — see pagedQuery — so moving between pages never edits what is
   * in the editor.
   */
  const runPage = useCallback((source: string, nextPage: number) => {
    setPagedSource(source);
    setPage(nextPage);
    runSql(buildPagedQuery(connectionProfile.engine, source, {
      limit: pageSize,
      offset: nextPage * pageSize,
    }));
  }, [connectionProfile.engine, pageSize, runSql]);

  const handleRun = useCallback(() => {
    if (status !== 'connected' || isRunning) return;
    setPagedSource(null);
    setPage(0);
    const statements = splitSqlStatements(sqlDraft);
    if (statements.length <= 1) {
      const only = statements[0] ?? sqlDraft;
      // A SELECT is fetched a page at a time; anything else runs as written.
      if (canPaginate(only)) runPage(only, 0);
      else runSql(only);
      return;
    }

    const leading = statements.slice(0, -1);
    const last = statements[statements.length - 1];
    setIsRunning(true);
    void runStatements(connectionId, leading).then((failure) => {
      setIsRunning(false);
      if (failure) {
        setQueryError(failure);
        return;
      }
      if (canPaginate(last)) runPage(last, 0);
      else runSql(last);
    });
  }, [connectionId, isRunning, runPage, runSql, runStatements, sqlDraft, status]);

  /**
   * Loads a table's current shape into the designer. The columns come from the
   * same catalog read the tree uses, so an expanded table costs nothing extra.
   */
  const openDesigner = useCallback(async (table: DbSchemaTable) => {
    const columns = await schema.getColumns(table);
    setDesigner({
      table,
      columns: (columns ?? []).map((column) => ({
        name: column.name,
        originalName: column.name,
        dataType: column.dataType,
        nullable: column.nullable,
      })),
    });
  }, [schema]);

  /**
   * Runs the designer's statements, then reloads the schema — the tree and the
   * completion cache both describe a shape that has just changed.
   */
  const applyDesign = useCallback(async (statements: string[]) => {
    const failure = await runStatements(connectionId, statements);
    if (!failure) await schema.reload();
    return failure;
  }, [connectionId, runStatements, schema]);

  /**
   * Dumps every table: its DDL, then its rows as INSERTs.
   *
   * One query per table rather than one big join — the row reads are already
   * capped per table by the bridge, and a failure on one table is recorded in
   * the file instead of losing the whole dump.
   */
  const dumpDatabase = useCallback(async () => {
    setBusyMessage(t('db.dump.running'));
    try {
      const list = (schema.tables ?? []).filter((entry) => entry.kind === 'table');
      const dumped: DumpTable[] = [];

      for (const entry of list) {
        const target = { schema: entry.schema, name: entry.name };
        const ddl = await schema.loadTableDdl(entry);
        const rows = await collectQuery(connectionId, buildPreviewSelect(
          connectionProfile.engine, target, DUMP_ROW_CAP,
        ));

        dumped.push({
          table: target,
          // loadTableDdl reports failure as a SQL comment rather than throwing.
          ddl: ddl.trim().startsWith('--') ? null : ddl,
          error: ddl.trim().startsWith('--') ? ddl.replace(/^--\s*/, '') : undefined,
          inserts: rows.success && rows.rows.length
            ? buildInsertStatements({
                engine: connectionProfile.engine,
                table: target,
                columns: rows.columns,
                rows: rows.rows,
              }).split('\n\n')
            : [],
        });
      }

      const generatedAt = new Date();
      const outcome = await exportResult({
        content: assembleDatabaseDump({
          engine: connectionProfile.engine,
          database: connectionProfile.database ?? '',
          generatedAt,
          tables: dumped,
        }),
        defaultFileName: dumpFileName(connectionProfile.database ?? '', generatedAt),
        format: 'sql',
      });
      if (!outcome.success && !outcome.canceled) setQueryError(outcome.error ?? 'Export failed');
    } finally {
      setBusyMessage(null);
    }
  }, [collectQuery, connectionId, connectionProfile, exportResult, schema, t]);

  /** Replays a .sql file statement by statement. */
  const restoreDump = useCallback(async () => {
    let picked;
    try {
      picked = await pickAndRead(t('db.dump.chooseFile'), [{ name: 'SQL', extensions: ['sql'] }]);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!picked) return;

    const statements = splitSqlStatements(picked.text);
    if (!statements.length) {
      setQueryError(t('db.dump.empty'));
      return;
    }
    if (!window.confirm(t('db.dump.restoreConfirm', { count: statements.length }))) return;

    setBusyMessage(t('db.dump.restoring'));
    try {
      const failure = await runStatements(connectionId, statements);
      if (failure) setQueryError(failure);
      else await schema.reload();
    } finally {
      setBusyMessage(null);
    }
  }, [connectionId, pickAndRead, runStatements, schema, t]);

  const dropTable = useCallback((table: DbSchemaTable) => {
    if (!window.confirm(t('db.schema.dropTableConfirm', { name: formatQualifiedTable(table) }))) return;
    void applyDesign([buildDropTable({ engine: connectionProfile.engine, table })]);
  }, [applyDesign, connectionProfile.engine, t]);

  /**
   * Asking for a plan must not be a write, which is why buildExplainQuery
   * refuses anything but a SELECT. Oracle needs two steps: EXPLAIN PLAN FOR
   * returns nothing and writes to PLAN_TABLE, so the plan is read back after.
   */
  const handleExplain = useCallback(() => {
    if (!canExplain(sqlDraft)) {
      setQueryError(t('db.explain.selectOnly'));
      return;
    }
    let explainSql: string;
    try {
      explainSql = buildExplainQuery(connectionProfile.engine, sqlDraft);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err));
      return;
    }

    const followUp = explainFollowUpQuery(connectionProfile.engine);
    if (!followUp) {
      runSql(explainSql);
      return;
    }

    const queryId = crypto.randomUUID();
    void runQuery(
      { connectionId, queryId, sql: explainSql },
      { onComplete: () => runSql(followUp), onError: (payload) => setQueryError(payload.error) },
    );
  }, [connectionId, connectionProfile.engine, runQuery, runSql, sqlDraft, t]);

  const handleExport = useCallback(
    async (format: 'csv' | 'json' | 'sql' | 'md' | 'xml' | 'html') => {
      if (!result) return;
      const sourceTable = resultSql ? resolveEditableTable(resultSql) : null;
      const base = sourceTable || 'query-result';

      let content: string;
      if (format === 'csv') {
        // The BOM goes on the file only — Excel needs it to read UTF-8, and it
        // is written here rather than by toCsv so a clipboard copy never gets it.
        content = UTF8_BOM + toCsv(result.columns, result.rows);
      } else if (format === 'json') {
        content = toJson(result.columns, result.rows);
      } else if (format === 'md') {
        content = toMarkdown(result.columns, result.rows);
      } else if (format === 'xml') {
        content = toXml(result.columns, result.rows);
      } else if (format === 'html') {
        content = toHtml(result.columns, result.rows);
      } else {
        // INSERT statements need a table to insert into. A result assembled
        // from several tables has none, so the statements are emitted against a
        // placeholder the user has to replace — better than silently picking
        // one of the tables involved.
        try {
          content = buildInsertStatements({
            engine: connectionProfile.engine,
            table: sourceTable ?? 'TABLE_NAME_HERE',
            columns: result.columns,
            rows: result.rows,
          });
        } catch (err) {
          setQueryError(err instanceof Error ? err.message : String(err));
          return;
        }
        if (!sourceTable) {
          content = `-- This result does not come from a single table.\n`
            + `-- Replace TABLE_NAME_HERE before running these statements.\n\n${content}`;
        }
      }

      const outcome = await exportResult({
        content,
        defaultFileName: `${base.replace(/[^\w.-]/g, '_')}.${format}`,
        format,
      });
      if (!outcome.success && !outcome.canceled) setQueryError(outcome.error ?? 'Export failed');
    },
    [connectionProfile.engine, exportResult, result, resultSql],
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
        <Button
          size="sm"
          variant="ghost"
          onClick={handleExplain}
          disabled={status !== 'connected' || isRunning}
          title={t('db.explain.hint')}
        >
          <GitBranch size={13} className="mr-1.5" /> {t('db.explain.run')}
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

        <Button
          size="sm"
          variant="ghost"
          disabled={status !== 'connected'}
          onClick={() => setDiffOpen(true)}
          title={t('db.diff.title')}
        >
          <GitCompare size={13} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={status !== 'connected'}
          onClick={() => {
            setErOpen(true);
            void schema.loadRelations();
          }}
          title={t('db.er.title')}
        >
          <Network size={13} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setHistoryOpen((prev) => !prev)}
          title={t('db.history.title')}
        >
          <History size={13} />
        </Button>
        {result && result.rows.length > 0 && (
          <div className="flex items-center gap-1 border-l border-border/60 pl-3">
            <Button size="sm" variant="ghost" onClick={() => void handleExport('csv')}>
              <Download size={13} className="mr-1.5" /> {t('db.export.csv')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleExport('json')}>
              {t('db.export.json')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleExport('md')}>
              {t('db.export.markdown')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleExport('xml')}>
              {t('db.export.xml')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleExport('html')}>
              {t('db.export.html')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleExport('sql')}>
              {t('db.export.sql')}
            </Button>
          </div>
        )}

        {/* Whole-database dump and restore do not need a result on screen, so
            they sit outside the export row rather than inside it. */}
        <div className="flex items-center gap-1 border-l border-border/60 pl-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={status !== 'connected'}
            onClick={() => setBuilderOpen((open) => !open)}
          >
            {t('db.builder.open')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(busyMessage) || status !== 'connected'}
            onClick={() => void dumpDatabase()}
          >
            {t('db.dump.export')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={Boolean(busyMessage) || status !== 'connected'}
            onClick={() => void restoreDump()}
          >
            {t('db.dump.restore')}
          </Button>
        </div>

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
      {busyMessage && (
        <div className="border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          {busyMessage}
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
            routines={schema.routines}
            triggers={schema.triggers}
            loading={schema.loading}
            error={schema.error}
            ready={status === 'connected'}
            onReload={() => void schema.reload()}
            getTableDetail={schema.getTableDetail}
            onOpenTable={(sql) => dbWorkspaceTabStore.setSqlDraft(connectionId, sql)}
            onShowDdl={(table) => {
              void schema.loadTableDdl(table).then((ddl) =>
                dbWorkspaceTabStore.setSqlDraft(connectionId, ddl));
            }}
            onDesignTable={(table) => { void openDesigner(table); }}
            onNewTable={() => setDesigner({ table: null, columns: [] })}
            onDropTable={dropTable}
            onImport={() => setImportOpen(true)}
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
                onDeleteRow={rowEditing.editable ? rowEditing.deleteRow : undefined}
                readOnlyReason={rowEditing.reason ? t(`db.edit.${rowEditing.reason}`) : undefined}
                filterPlaceholder={t('db.workspace.filterRows')}
              />
            )}
          </div>
          {pagedSource && result && (
            <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-2 py-1 text-xs">
              <button
                type="button"
                disabled={page === 0 || isRunning}
                onClick={() => runPage(pagedSource, page - 1)}
                className="rounded border border-border/60 px-2 py-0.5 hover:bg-muted disabled:opacity-40"
              >
                {t('db.workspace.prevPage')}
              </button>
              <span className="text-muted-foreground">
                {t('db.workspace.pageRange', {
                  from: page * pageSize + 1,
                  to: page * pageSize + result.rows.length,
                })}
              </span>
              <button
                type="button"
                // A full page means there may be another; a short one is the end.
                disabled={result.rows.length < pageSize || isRunning}
                onClick={() => runPage(pagedSource, page + 1)}
                className="rounded border border-border/60 px-2 py-0.5 hover:bg-muted disabled:opacity-40"
              >
                {t('db.workspace.nextPage')}
              </button>
              <select
                value={pageSize}
                onChange={(event) => {
                  const size = Number(event.target.value);
                  setPageSize(size);
                  // Re-fetch from the top: the old page numbers no longer line up.
                  runSql(buildPagedQuery(connectionProfile.engine, pagedSource, { limit: size, offset: 0 }));
                  setPage(0);
                }}
                className="ml-auto rounded border border-border/60 bg-background px-1 py-0.5"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{t('db.workspace.perPage', { count: size })}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {designer && (
          <div className="w-96 shrink-0">
            <DbTableDesigner
              engine={connectionProfile.engine}
              table={designer.table}
              columns={designer.columns}
              onApply={applyDesign}
              onClose={() => setDesigner(null)}
            />
          </div>
        )}
        {builderOpen && (
          <div className="w-96 shrink-0">
            <DbQueryBuilderPanel
              engine={connectionProfile.engine}
              tables={schema.tables ?? []}
              getColumns={schema.getColumns}
              onApply={(sql) => dbWorkspaceTabStore.setSqlDraft(connectionId, sql)}
              onClose={() => setBuilderOpen(false)}
            />
          </div>
        )}
        {importOpen && (
          <div className="w-96 shrink-0">
            <DbImportPanel
              engine={connectionProfile.engine}
              onApply={applyDesign}
              onClose={() => setImportOpen(false)}
            />
          </div>
        )}
        {historyOpen && (
          <DbQueryHistoryPanel
            history={queryHistory}
            connectionId={connectionId}
            onPick={(sql) => dbWorkspaceTabStore.setSqlDraft(connectionId, sql)}
            onToggleFavourite={dbQueryHistoryStore.toggleFavourite}
            onClear={dbQueryHistoryStore.clear}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>

      {diffOpen && (
        <DbSchemaDiffPanel
          sourceProfile={connectionProfile}
          sourceSnapshot={schema.readSnapshot}
          candidates={connections.filter((c) => c.id !== connectionId)}
          onClose={() => setDiffOpen(false)}
          onScript={(sql) => dbWorkspaceTabStore.setSqlDraft(connectionId, sql)}
        />
      )}

      {erOpen && (
        <DbErDiagram
          tables={(schema.tables ?? []).filter((t2) => t2.kind === 'table').map(formatQualifiedTable)}
          relations={(schema.relations ?? []).map((fk) => ({
            from: fk.table,
            to: fk.referencedTable,
            fromColumn: fk.column,
            toColumn: fk.referencedColumn,
          }))}
          loading={schema.relationsLoading}
          onClose={() => setErOpen(false)}
          onPickTable={(table) => {
            dbWorkspaceTabStore.setSqlDraft(
              connectionId,
              buildPreviewSelect(connectionProfile.engine, table),
            );
            setErOpen(false);
          }}
        />
      )}
    </div>
  );
};
