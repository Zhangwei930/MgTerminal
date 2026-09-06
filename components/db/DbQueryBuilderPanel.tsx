import { Plus, Trash2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { formatQualifiedTable } from '../../domain/db/identifiers';
import {
  buildSelectFromSpec,
  COMPARISON_OPERATORS,
  type ComparisonOperator,
  type QueryFilter,
  type QuerySort,
} from '../../domain/db/queryBuilder';
import type { DbEngine } from '../../domain/models';

interface DbQueryBuilderPanelProps {
  engine: DbEngine;
  tables: DbSchemaTable[];
  /** Columns of one table, for the pickers. Null while loading. */
  getColumns: (table: DbSchemaTable) => Promise<DbSchemaColumn[] | null>;
  /** Hands the built SQL to the editor. */
  onApply: (sql: string) => void;
  onClose: () => void;
}

const DEFAULT_LIMIT = 200;

/**
 * Builds a single-table SELECT from pickers.
 *
 * The SQL is on screen the whole time and Apply only puts it in the editor —
 * nothing runs from here. That is what keeps this useful rather than a second,
 * worse way to run a query: it is a starting point you then edit.
 */
export const DbQueryBuilderPanel: React.FC<DbQueryBuilderPanelProps> = ({
  engine,
  tables,
  getColumns,
  onApply,
  onClose,
}) => {
  const { t } = useI18n();
  const selectable = useMemo(() => tables.filter((table) => table.kind === 'table'), [tables]);
  const [tableKey, setTableKey] = useState('');
  const [columns, setColumns] = useState<DbSchemaColumn[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [filters, setFilters] = useState<QueryFilter[]>([]);
  const [sorts, setSorts] = useState<QuerySort[]>([]);
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);

  const table = useMemo(
    () => selectable.find((entry) => formatQualifiedTable(entry) === tableKey),
    [selectable, tableKey],
  );

  useEffect(() => {
    if (!table) {
      setColumns([]);
      return;
    }
    let cancelled = false;
    // Everything below refers to the old table's columns until these arrive.
    setPicked([]);
    setFilters([]);
    setSorts([]);
    void getColumns(table).then((loaded) => {
      if (!cancelled) setColumns(loaded ?? []);
    });
    return () => { cancelled = true; };
  }, [getColumns, table]);

  const sql = useMemo(() => {
    if (!table) return '';
    try {
      return buildSelectFromSpec({
        engine,
        table: { schema: table.schema, name: table.name },
        columns: picked,
        // A half-typed filter would otherwise appear in the SQL as an empty
        // comparison the moment the row is added.
        filters: filters.filter((filter) => filter.column),
        sorts: sorts.filter((sort) => sort.column),
        limit: limit > 0 ? limit : undefined,
      });
    } catch {
      return '';
    }
  }, [engine, filters, limit, picked, sorts, table]);

  const toggleColumn = useCallback((name: string) => {
    setPicked((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }, []);

  const columnOptions = columns.map((column) => (
    <option key={column.name} value={column.name}>{column.name}</option>
  ));

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border/60 bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium">{t('db.builder.title')}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={t('db.builder.close')}
        >
          <X size={12} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-2 text-xs">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('db.builder.table')}
          </label>
          <select
            value={tableKey}
            onChange={(event) => setTableKey(event.target.value)}
            className="w-full rounded border border-border/60 bg-background px-2 py-1 outline-none focus:border-primary/60"
          >
            <option value="">{t('db.builder.selectTable')}</option>
            {selectable.map((entry) => {
              const key = formatQualifiedTable(entry);
              return <option key={key} value={key}>{key}</option>;
            })}
          </select>
        </div>

        {table && (
          <>
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('db.builder.columns')}
              </div>
              <div className="max-h-36 space-y-0.5 overflow-auto rounded border border-border/50 p-1">
                {columns.map((column) => (
                  <label key={column.name} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={picked.includes(column.name)}
                      onChange={() => toggleColumn(column.name)}
                    />
                    <span className="truncate font-mono">{column.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {column.dataType}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70">{t('db.builder.allColumnsHint')}</p>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('db.builder.filters')}
              </div>
              {filters.map((filter, index) => (
                <div key={index} className="flex items-center gap-1">
                  <select
                    value={filter.column}
                    onChange={(event) => setFilters((prev) => prev.map((f, i) =>
                      (i === index ? { ...f, column: event.target.value } : f)))}
                    className="min-w-0 flex-1 rounded border border-border/60 bg-background px-1 py-0.5"
                  >
                    <option value="">—</option>
                    {columnOptions}
                  </select>
                  <select
                    value={filter.operator}
                    onChange={(event) => setFilters((prev) => prev.map((f, i) =>
                      (i === index ? { ...f, operator: event.target.value as ComparisonOperator } : f)))}
                    className="rounded border border-border/60 bg-background px-1 py-0.5"
                  >
                    {COMPARISON_OPERATORS.map((operator) => (
                      <option key={operator} value={operator}>{operator}</option>
                    ))}
                  </select>
                  <input
                    value={filter.value}
                    disabled={filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL'}
                    onChange={(event) => setFilters((prev) => prev.map((f, i) =>
                      (i === index ? { ...f, value: event.target.value } : f)))}
                    className="min-w-0 flex-1 rounded border border-border/60 bg-background px-1 py-0.5 font-mono disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFilters((prev) => [...prev, { column: '', operator: '=', value: '' }])}
                className="flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 hover:bg-muted"
              >
                <Plus size={11} /> {t('db.builder.addFilter')}
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('db.builder.sort')}
              </div>
              {sorts.map((sort, index) => (
                <div key={index} className="flex items-center gap-1">
                  <select
                    value={sort.column}
                    onChange={(event) => setSorts((prev) => prev.map((s, i) =>
                      (i === index ? { ...s, column: event.target.value } : s)))}
                    className="min-w-0 flex-1 rounded border border-border/60 bg-background px-1 py-0.5"
                  >
                    <option value="">—</option>
                    {columnOptions}
                  </select>
                  <select
                    value={sort.direction}
                    onChange={(event) => setSorts((prev) => prev.map((s, i) =>
                      (i === index ? { ...s, direction: event.target.value as 'asc' | 'desc' } : s)))}
                    className="rounded border border-border/60 bg-background px-1 py-0.5"
                  >
                    <option value="asc">ASC</option>
                    <option value="desc">DESC</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setSorts((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSorts((prev) => [...prev, { column: '', direction: 'asc' }])}
                className="flex items-center gap-1 rounded border border-border/60 px-2 py-0.5 hover:bg-muted"
              >
                <Plus size={11} /> {t('db.builder.addSort')}
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('db.builder.limit')}
              </label>
              <input
                type="number"
                min={1}
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value) || 0)}
                className="w-24 rounded border border-border/60 bg-background px-2 py-1"
              />
            </div>
          </>
        )}
      </div>

      <div className="border-t border-border/60">
        <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {t('db.builder.preview')}
        </div>
        <pre className="max-h-32 overflow-auto px-3 pb-2 font-mono text-[11px] leading-relaxed">
          {sql || <span className="text-muted-foreground">{t('db.builder.selectTable')}</span>}
        </pre>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border/60 px-2 py-1 text-xs hover:bg-muted"
        >
          {t('db.builder.close')}
        </button>
        <button
          type="button"
          disabled={!sql}
          onClick={() => { onApply(sql); onClose(); }}
          className="ml-auto rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-40"
        >
          {t('db.builder.apply')}
        </button>
      </div>
    </div>
  );
};
