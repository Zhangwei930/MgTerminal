import { AlertTriangle, ChevronDown, ChevronRight, Eye, FunctionSquare, Loader2, RefreshCw, Table2, Terminal, Zap } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import type { DbEngine } from '../../domain/models';
import { buildPreviewSelect } from '../../domain/db/previewQuery';

interface DbSchemaTreeProps {
  engine: DbEngine;
  tables: DbSchemaTable[] | null;
  routines: DbSchemaRoutine[];
  triggers: DbSchemaTrigger[];
  loading: boolean;
  error: string | null;
  /** Only true once the connection is live — the catalog queries need it. */
  ready: boolean;
  onReload: () => void;
  getColumns: (table: string) => Promise<DbSchemaColumn[] | null>;
  /** Double-clicking a table hands its preview SQL to the editor. */
  onOpenTable: (sql: string) => void;
}

/** Columns are fetched per table on first expand, then kept. */
type ColumnState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; columns: DbSchemaColumn[] };

/** A labelled divider for the non-table node types. */
const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mt-1 border-t border-border/40 pt-1">
    <div className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
      {label}
    </div>
    {children}
  </div>
);

export const DbSchemaTree: React.FC<DbSchemaTreeProps> = ({
  engine,
  tables,
  routines,
  triggers,
  loading,
  error,
  ready,
  onReload,
  getColumns,
  onOpenTable,
}) => {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, ColumnState | undefined>>({});

  const toggleTable = useCallback(
    async (name: string) => {
      if (expanded[name]) {
        setExpanded((prev) => ({ ...prev, [name]: undefined }));
        return;
      }
      setExpanded((prev) => ({ ...prev, [name]: { status: 'loading' } }));
      const columns = await getColumns(name);
      setExpanded((prev) => ({
        ...prev,
        [name]: columns ? { status: 'loaded', columns } : { status: 'error' },
      }));
    },
    [expanded, getColumns],
  );

  const handleRefresh = useCallback(() => {
    // Collapse everything: the cached columns behind these rows are dropped by
    // the reload, so leaving rows expanded would show stale children.
    setExpanded({});
    onReload();
  }, [onReload]);

  const needle = filter.trim().toLowerCase();
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);
  const visible = (tables ?? []).filter((table) => matches(table.name));
  const visibleRoutines = routines.filter((routine) => matches(routine.name));
  const visibleTriggers = triggers.filter((trigger) => matches(trigger.name));

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
        {!error && tables !== null && visible.length === 0
          && visibleRoutines.length === 0 && visibleTriggers.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t('db.schema.empty')}</div>
        )}

        {visible.map((table) => {
          const state = expanded[table.name];
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
                {state ? <ChevronDown size={11} className="shrink-0" /> : <ChevronRight size={11} className="shrink-0" />}
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
                <div className="py-0.5 pl-7 text-xs text-destructive">{t('db.schema.columnsFailed')}</div>
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

        {visibleRoutines.length > 0 && (
          <Section label={t('db.schema.procedures')}>
            {visibleRoutines.map((routine) => (
              <div
                key={`${routine.kind}:${routine.name}`}
                className="flex items-center gap-1 px-2 py-0.5 pl-4 text-xs"
              >
                {routine.kind === 'procedure'
                  ? <Terminal size={11} className="shrink-0 text-muted-foreground" />
                  : <FunctionSquare size={11} className="shrink-0 text-muted-foreground" />}
                <span className="truncate">{routine.name}</span>
              </div>
            ))}
          </Section>
        )}

        {visibleTriggers.length > 0 && (
          <Section label={t('db.schema.triggers')}>
            {visibleTriggers.map((trigger) => (
              <div
                key={`${trigger.table}:${trigger.name}`}
                className="flex items-center gap-1.5 px-2 py-0.5 pl-4 text-xs"
              >
                <Zap size={11} className="shrink-0 text-muted-foreground" />
                <span className="truncate">{trigger.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground opacity-70">
                  {trigger.table}
                </span>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
};
