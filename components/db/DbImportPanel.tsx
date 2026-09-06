import { FileUp, Loader2, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { useLocalTextFile } from '../../application/state/useLocalTextFile';
import {
  buildImportStatements,
  inferColumnType,
  parseDelimited,
  parseJsonRows,
  type ParsedRows,
} from '../../domain/db/dataImport';
import { parseQualifiedTable } from '../../domain/db/identifiers';
import type { DbEngine } from '../../domain/models';

interface DbImportPanelProps {
  engine: DbEngine;
  /** Runs the generated statements in order; resolves with a failure message. */
  onApply: (statements: string[]) => Promise<string | null>;
  onClose: () => void;
}

/** How many rows the preview shows — the file itself can be far larger. */
const PREVIEW_ROWS = 8;

/**
 * Reads a CSV or JSON file into a table.
 *
 * The file is parsed in the renderer and turned into CREATE TABLE + INSERTs,
 * which are shown before anything runs. Inferred types are a guess from the
 * data and the preview is where a wrong one gets caught — see dataImport.
 */
export const DbImportPanel: React.FC<DbImportPanelProps> = ({ engine, onApply, onClose }) => {
  const { t } = useI18n();
  const { pickAndRead } = useLocalTextFile();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRows | null>(null);
  const [tableName, setTableName] = useState('');
  const [createTable, setCreateTable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const choose = useCallback(async () => {
    setFailure(null);
    try {
      const picked = await pickAndRead(t('db.import.chooseFile'), [
        { name: 'Data', extensions: ['csv', 'tsv', 'txt', 'json'] },
      ]);
      if (!picked) return;

      const { path, text } = picked;
      const rows = path.toLowerCase().endsWith('.json') ? parseJsonRows(text) : parseDelimited(text);

      setParsed(rows);
      setFileName(path);
      const base = path.split(/[\\/]/).pop() ?? 'imported';
      setTableName(base.replace(/\.[^.]+$/, '').replace(/[^\w]/g, '_'));
    } catch (err) {
      setParsed(null);
      setFailure(err instanceof Error ? err.message : String(err));
    }
  }, [pickAndRead, t]);

  const statements = useMemo(() => {
    if (!parsed?.headers.length || !tableName.trim()) return [];
    try {
      return buildImportStatements({
        engine,
        table: parseQualifiedTable(tableName.trim()),
        headers: parsed.headers,
        rows: parsed.rows,
        createTable,
      });
    } catch {
      return [];
    }
  }, [createTable, engine, parsed, tableName]);

  const run = useCallback(async () => {
    if (!statements.length) return;
    setBusy(true);
    setFailure(null);
    const failed = await onApply(statements);
    setBusy(false);
    if (failed) setFailure(failed);
    else onClose();
  }, [onApply, onClose, statements]);

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border/60 bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium">{t('db.import.title')}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={t('db.import.cancel')}
        >
          <X size={12} />
        </button>
      </div>

      <div className="space-y-2 border-b border-border/60 px-3 py-2">
        <button
          type="button"
          onClick={() => void choose()}
          className="flex w-full items-center gap-1.5 rounded border border-border/60 px-2 py-1.5 text-xs hover:bg-muted"
        >
          <FileUp size={12} />
          <span className="truncate">{fileName ?? t('db.import.chooseFile')}</span>
        </button>

        {parsed && (
          <>
            <div className="text-[11px] text-muted-foreground">
              {t('db.import.rowsFound', { count: parsed.rows.length, columns: parsed.headers.length })}
            </div>
            <input
              value={tableName}
              onChange={(event) => setTableName(event.target.value)}
              placeholder={t('db.import.targetTable')}
              className="w-full rounded border border-border/60 bg-background px-2 py-1 font-mono text-xs outline-none focus:border-primary/60"
            />
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={createTable}
                onChange={(event) => setCreateTable(event.target.checked)}
              />
              {t('db.import.createTable')}
            </label>
          </>
        )}
      </div>

      {parsed && parsed.headers.length > 0 && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('db.import.preview')}
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40">
              <tr>
                {parsed.headers.map((header, i) => (
                  <th key={i} className="px-2 py-1 text-left font-medium">
                    <div className="truncate">{header}</div>
                    <div className="font-mono text-[9px] font-normal text-muted-foreground">
                      {createTable
                        ? inferColumnType(parsed.rows.map((row) => row[i] ?? ''), engine)
                        : ''}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.slice(0, PREVIEW_ROWS).map((row, r) => (
                <tr key={r} className="border-b border-border/30">
                  {row.map((cell, c) => (
                    <td key={c} className="max-w-40 truncate px-2 py-0.5 font-mono">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
          {t('db.import.cancel')}
        </button>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !statements.length}
          className="ml-auto flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-40"
        >
          {busy && <Loader2 size={11} className="animate-spin" />}
          {busy ? t('db.import.running') : t('db.import.run')}
        </button>
      </div>
    </div>
  );
};
