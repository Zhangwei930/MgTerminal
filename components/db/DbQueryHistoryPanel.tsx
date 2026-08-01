import { AlertTriangle, Star, Trash2, X } from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import type { QueryHistoryEntry } from '../../domain/db/queryHistory';
import { cn } from '../../lib/utils';

interface DbQueryHistoryPanelProps {
  history: readonly QueryHistoryEntry[];
  /** Only this connection's entries — another tab's queries are not relevant here. */
  connectionId: string;
  onPick: (sql: string) => void;
  onToggleFavourite: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleString();
}

export const DbQueryHistoryPanel: React.FC<DbQueryHistoryPanelProps> = ({
  history,
  connectionId,
  onPick,
  onToggleFavourite,
  onClear,
  onClose,
}) => {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const needle = filter.trim().toLowerCase();
  const visible = history.filter((entry) =>
    entry.connectionId === connectionId
    && (!favouritesOnly || entry.favourite)
    && (!needle || entry.sql.toLowerCase().includes(needle)));

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border/60 bg-muted/20">
      <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('db.history.title')}</span>
        <button
          type="button"
          onClick={() => setFavouritesOnly((prev) => !prev)}
          title={t('db.history.favouritesOnly')}
          className={cn(
            'ml-auto rounded p-1 hover:bg-muted',
            favouritesOnly ? 'text-amber-500' : 'text-muted-foreground',
          )}
        >
          <Star size={12} fill={favouritesOnly ? 'currentColor' : 'none'} />
        </button>
        <button
          type="button"
          onClick={onClear}
          title={t('db.history.clear')}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <Trash2 size={12} />
        </button>
        <button
          type="button"
          onClick={onClose}
          title={t('db.history.close')}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X size={12} />
        </button>
      </div>

      <div className="border-b border-border/60 px-2 py-1.5">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('db.history.filter')}
          className="w-full rounded border border-border/60 bg-background px-2 py-1 text-xs outline-none focus:border-primary/60"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t('db.history.empty')}</div>
        )}
        {visible.map((entry) => (
          <div
            key={entry.id}
            className="group border-b border-border/30 px-2 py-1.5 hover:bg-muted/50"
          >
            <div className="flex items-start gap-1">
              <button
                type="button"
                onClick={() => onToggleFavourite(entry.id)}
                title={t('db.history.favourite')}
                className={cn(
                  'mt-0.5 shrink-0 rounded p-0.5 hover:bg-muted',
                  entry.favourite ? 'text-amber-500' : 'text-muted-foreground/40',
                )}
              >
                <Star size={10} fill={entry.favourite ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                onClick={() => onPick(entry.sql)}
                title={t('db.history.reuse')}
                className="min-w-0 flex-1 text-left"
              >
                <div className="line-clamp-3 font-mono text-[11px] leading-snug">{entry.sql}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  {!entry.ok && <AlertTriangle size={9} className="shrink-0 text-destructive" />}
                  <span>{formatTime(entry.at)}</span>
                  {entry.ok && entry.rowCount !== undefined && (
                    <span className="ml-auto shrink-0">
                      {t('db.workspace.rowCount', { count: entry.rowCount })}
                      {entry.durationMs !== undefined ? ` · ${entry.durationMs}ms` : ''}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
