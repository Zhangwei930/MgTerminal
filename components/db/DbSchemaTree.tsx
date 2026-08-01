import { AlertTriangle, ChevronDown, ChevronRight, Eye, Loader2, RefreshCw, Table2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import type { DbEngine } from '../../domain/models';
import { buildPreviewSelect } from '../../domain/db/previewQuery';
import { useDbClientBackend } from '../../application/state/useDbClientBackend';

interface DbSchemaTreeProps {
  connectionId: string;
  engine: DbEngine;
  /** Only true once the connection is live — the catalog queries need it. */
  ready: boolean;
  /** Double-clicking a table hands its preview SQL to the editor. */
  onOpenTable: (sql: string) => void;
}

/** Columns are fetched per table on first expand, then kept. */
type ColumnState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'loaded'; columns: DbSchemaColumn[] };

export const DbSchemaTree: React.FC<DbSchemaTreeProps> = ({
  connectionId,
  engine,
  ready,
  onOpenTable,
}) => {
  const { t } = useI18n();
  const { listTables, listColumns } = useDbClientBackend();
  const [tables, setTables] = useState<DbSchemaTable[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, ColumnState | undefined>>({});

  const loadTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listTables(connectionId);
      if (result?.success) setTables(result.tables ?? []);
      else setError(result?.error || 'Failed to read schema');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, listTables]);

  useEffect(() => {
    if (!ready) return;
    void loadTables();
  }, [ready, loadTables]);

  const toggleTable = useCallback(
    async (name: string) => {
      const current = expanded[name];
      if (current) {
        // Collapsing drops the cached columns too — a refresh should not have
        // to know which tables happen to be open.
        setExpanded((prev) => ({ ...prev, [name]: undefined }));
        return;
      }
      setExpanded((prev) => ({ ...prev, [name]: { status: 'loading' } }));

      try {
        const result = await listColumns(connectionId, name);
        setExpanded((prev) => ({
          ...prev,
          [name]: result?.success
            ? { status: 'loaded', columns: result.columns ?? [] }
            : { status: 'error', error: result?.error || 'Failed to read columns' },
        }));
      } catch (err) {
        setExpanded((prev) => ({
          ...prev,
          [name]: { status: 'error', error: err instanceof Error ? err.message : String(err) },
        }));
      }
    },
    [connectionId, expanded, listColumns],
  );

  const handleRefresh = useCallback(() => {
    setExpanded({});
    void loadTables();
  }, [loadTables]);

  const needle = filter.trim().toLowerCase();
  const visible = (tables ?? []).filter((table) => !needle || table.name.toLowerCase().includes(needle));

  return (
    <div className="flex h-full flex-col border-r border-border/60 bg-muted/20">
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('db.schema.title')}</span>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={!ready || loading}
          title={t('db.schema.refresh')}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        </button>
      </div>

      <div className="border-b border-border/60 px-2 py-1.5">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('db.schema.filter')}
          disabled={!ready}
          className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-primary/60"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {error && (
          <div className="flex items-start gap-1.5 px-2 py-2 text-xs text-destructive">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {!error && tables !== null && visible.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t('db.schema.empty')}</div>
        )}

        {visible.map((table) => {
          const state = expanded[table.name];
          const isOpen = Boolean(state);
          return (
            <div key={`${table.kind}:${table.name}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => void toggleTable(table.name)}
                onDoubleClick={() => onOpenTable(buildPreviewSelect(engine, table.name))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpenTable(buildPreviewSelect(engine, table.name));
                }}
                title={t('db.schema.openHint')}
                className="flex cursor-default items-center gap-1 px-2 py-0.5 text-xs hover:bg-muted/60"
              >
                {isOpen ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
                {table.kind === 'view'
                  ? <Eye size={11} className="shrink-0 text-muted-foreground" />
                  : <Table2 size={11} className="shrink-0 text-muted-foreground" />}
                <span className="truncate">{table.name}</span>
              </div>

              {state?.status === 'loading' && (
                <div className="flex items-center gap-1 py-0.5 pl-7 text-xs text-muted-foreground">
                  <Loader2 size={10} className="animate-spin" /> {t('db.schema.loading')}
                </div>
              )}
              {state?.status === 'error' && (
                <div className="py-0.5 pl-7 text-xs text-destructive">{state.error}</div>
              )}
              {state?.status === 'loaded' && state.columns.map((column) => (
                <div
                  key={column.name}
                  className="flex items-center gap-1.5 py-0.5 pl-7 pr-2 text-xs text-muted-foreground"
                >
                  <span className="truncate text-foreground/80">{column.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] opacity-70">
                    {column.dataType}{column.nullable ? '' : ' ·'}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
