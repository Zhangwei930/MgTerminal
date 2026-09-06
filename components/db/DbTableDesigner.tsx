import { Loader2, Plus, Trash2, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { formatQualifiedTable, type QualifiedTable } from '../../domain/db/identifiers';
import { type DesignerRow, diffTableDesign } from '../../domain/db/tableDesignerDiff';
import { buildCreateTable } from '../../domain/db/tableDesignerSql';
import type { DbEngine } from '../../domain/models';
import { cn } from '../../lib/utils';

interface DbTableDesignerProps {
  engine: DbEngine;
  /** Null designs a new table; otherwise the one being altered. */
  table: QualifiedTable | null;
  /** The table's current columns. Empty for a new table. */
  columns: DesignerRow[];
  /** Runs the generated statements in order; resolves with a failure message. */
  onApply: (statements: string[]) => Promise<string | null>;
  onClose: () => void;
}

const BLANK: DesignerRow = { name: '', dataType: '', nullable: true };

/**
 * The structure editor: columns in, DDL out.
 *
 * Nothing runs until Apply, and the exact statements are on screen before it
 * is pressed. That is deliberate — these are the operations in this app that
 * cannot be undone, and a generated ALTER is worth reading before it runs.
 */
export const DbTableDesigner: React.FC<DbTableDesignerProps> = ({
  engine,
  table,
  columns,
  onApply,
  onClose,
}) => {
  const { t } = useI18n();
  const [rows, setRows] = useState<DesignerRow[]>(() => (columns.length ? columns : [BLANK]));
  const [newName, setNewName] = useState('');
  const [applying, setApplying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const update = useCallback((index: number, patch: Partial<DesignerRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  const { statements, problem } = useMemo(() => {
    try {
      if (!table) {
        const name = newName.trim();
        if (!name) return { statements: [], problem: null };
        return {
          statements: [buildCreateTable({ engine, table: { name }, columns: rows })],
          problem: null,
        };
      }
      return {
        statements: diffTableDesign({ engine, table, original: columns, edited: rows }),
        problem: null,
      };
    } catch (err) {
      return { statements: [], problem: err instanceof Error ? err.message : String(err) };
    }
  }, [columns, engine, newName, rows, table]);

  const apply = useCallback(async () => {
    if (!statements.length) return;
    setApplying(true);
    setFailure(null);
    const failed = await onApply(statements);
    setApplying(false);
    if (failed) setFailure(failed);
    else onClose();
  }, [onApply, onClose, statements]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border/60 bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium">
          {table ? `${t('db.designer.title')} · ${formatQualifiedTable(table)}` : t('db.designer.newTable')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={t('db.designer.cancel')}
        >
          <X size={12} />
        </button>
      </div>

      {!table && (
        <div className="border-b border-border/60 px-3 py-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={t('db.designer.tableName')}
            className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-primary/60"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium">{t('db.designer.column')}</th>
              <th className="px-2 py-1 text-left font-medium">{t('db.designer.type')}</th>
              <th className="px-2 py-1 font-medium">{t('db.designer.nullable')}</th>
              <th className="px-2 py-1 font-medium">{t('db.designer.primaryKey')}</th>
              <th className="px-2 py-1 text-left font-medium">{t('db.designer.default')}</th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border/30">
                <td className="px-1 py-0.5">
                  <input
                    value={row.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                    className="w-full rounded bg-transparent px-1 py-0.5 font-mono outline-none focus:bg-muted/50"
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    value={row.dataType}
                    onChange={(event) => update(index, { dataType: event.target.value })}
                    placeholder="varchar(64)"
                    className="w-full rounded bg-transparent px-1 py-0.5 font-mono outline-none focus:bg-muted/50"
                  />
                </td>
                <td className="px-1 py-0.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.nullable}
                    onChange={(event) => update(index, { nullable: event.target.checked })}
                    aria-label={t('db.designer.nullable')}
                  />
                </td>
                <td className="px-1 py-0.5 text-center">
                  <input
                    type="checkbox"
                    checked={Boolean(row.primaryKey)}
                    // A key column cannot be null, so ticking one settles both.
                    onChange={(event) => update(index, {
                      primaryKey: event.target.checked,
                      nullable: event.target.checked ? false : row.nullable,
                    })}
                    aria-label={t('db.designer.primaryKey')}
                  />
                </td>
                <td className="px-1 py-0.5">
                  <input
                    value={row.defaultValue ?? ''}
                    onChange={(event) => update(index, { defaultValue: event.target.value || null })}
                    className="w-full rounded bg-transparent px-1 py-0.5 font-mono outline-none focus:bg-muted/50"
                  />
                </td>
                <td className="px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                    title={t('db.designer.removeColumn')}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { ...BLANK }])}
          className="m-2 flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs hover:bg-muted"
        >
          <Plus size={11} /> {t('db.designer.addColumn')}
        </button>
      </div>

      <div className="border-t border-border/60">
        <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {t('db.designer.preview')}
        </div>
        <pre className="max-h-40 overflow-auto px-3 pb-2 font-mono text-[11px] leading-relaxed">
          {problem
            ? <span className="text-destructive">{problem}</span>
            : statements.join('\n') || <span className="text-muted-foreground">{t('db.designer.noChanges')}</span>}
        </pre>
      </div>

      {failure && (
        <div role="alert" className="border-t border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {failure}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border/60 px-2 py-1 text-xs hover:bg-muted"
        >
          {t('db.designer.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={applying || !statements.length || Boolean(problem)}
          className={cn(
            'ml-auto flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs text-primary-foreground',
            'disabled:opacity-40',
          )}
        >
          {applying && <Loader2 size={11} className="animate-spin" />}
          {applying ? t('db.designer.applying') : t('db.designer.apply')}
        </button>
      </div>
    </div>
  );
};
