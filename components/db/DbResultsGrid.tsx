import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { FixedSizeVirtualList } from '../ui/FixedSizeVirtualList';

interface DbResultsGridColumn {
  name: string;
  type: string;
}

export interface DbCellEdit {
  column: string;
  value: string;
  /** The row as it came back, so the caller can build a keyed WHERE. */
  row: unknown[];
}

interface DbResultsGridProps {
  columns: DbResultsGridColumn[];
  rows: unknown[][];
  className?: string;
  /**
   * Absent means read-only. Present means the caller resolved a single source
   * table with a primary key and will turn an edit into an UPDATE.
   */
  onCommitEdit?: (edit: DbCellEdit) => Promise<string | null>;
  /** Why editing is unavailable, shown on hover. */
  readOnlyReason?: string;
}

const ROW_HEIGHT = 28;
const CELL_MIN_WIDTH = 140;

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export const DbResultsGrid: React.FC<DbResultsGridProps> = ({
  columns,
  rows,
  className,
  onCommitEdit,
  readOnlyReason,
}) => {
  const [sort, setSort] = useState<{ columnIndex: number; direction: 'asc' | 'desc' } | null>(null);
  const [editing, setEditing] = useState<{ rowIndex: number; columnIndex: number; draft: string } | null>(null);
  const [saving, setSaving] = useState(false);
  /** Committed values overlay the fetched rows so an edit shows without a refetch. */
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});

  const sortedRows = useMemo(() => {
    if (!sort) return rows.map((row, index) => [row, index] as const);
    const { columnIndex, direction } = sort;
    const withIndex = rows.map((row, i) => [row, i] as const);
    withIndex.sort(([a], [b]) => {
      const av = a[columnIndex];
      const bv = b[columnIndex];
      if (av == null && bv == null) return 0;
      if (av == null) return direction === 'asc' ? -1 : 1;
      if (bv == null) return direction === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return direction === 'asc' ? av - bv : bv - av;
      }
      const as = formatCellValue(av);
      const bs = formatCellValue(bv);
      return direction === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return withIndex;
  }, [rows, sort]);

  const toggleSort = (columnIndex: number) => {
    setSort((prev) => {
      if (!prev || prev.columnIndex !== columnIndex) return { columnIndex, direction: 'asc' };
      if (prev.direction === 'asc') return { columnIndex, direction: 'desc' };
      return null;
    });
  };

  const commit = useCallback(async () => {
    if (!editing || !onCommitEdit) return;
    const { rowIndex, columnIndex, draft } = editing;
    const original = formatCellValue(rows[rowIndex]?.[columnIndex]);
    if (draft === original) {
      setEditing(null);
      return;
    }

    setSaving(true);
    const failure = await onCommitEdit({
      column: columns[columnIndex].name,
      value: draft,
      row: rows[rowIndex],
    });
    setSaving(false);
    // On failure the cell stays open with the typed value, so the edit is not
    // lost to an error the user still has to read.
    if (!failure) {
      setOverrides((prev) => ({ ...prev, [`${rowIndex}:${columnIndex}`]: draft }));
      setEditing(null);
    }
  }, [columns, editing, onCommitEdit, rows]);

  const cellValue = (rowIndex: number, columnIndex: number, raw: unknown) => {
    const key = `${rowIndex}:${columnIndex}`;
    return key in overrides ? overrides[key] : raw;
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-x-auto', className)}>
      <div className="flex border-b border-border/60 bg-muted/30 text-xs font-medium">
        {columns.map((col, i) => (
          <button
            key={col.name + i}
            type="button"
            onClick={() => toggleSort(i)}
            className="flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-left hover:bg-muted/60"
            style={{ minWidth: CELL_MIN_WIDTH }}
          >
            <span className="truncate">{col.name}</span>
            {sort?.columnIndex === i && (
              <span className="text-muted-foreground">{sort.direction === 'asc' ? '▲' : '▼'}</span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <FixedSizeVirtualList<readonly [unknown[], number]>
          items={sortedRows}
          itemHeight={ROW_HEIGHT}
          getItemKey={(entry) => String(entry[1])}
          renderItem={(entry) => {
            const [row, rowIndex] = entry;
            return (
              <div className="flex h-full items-center border-b border-border/30 text-xs font-mono">
                {row.map((raw, i) => {
                  const value = cellValue(rowIndex, i, raw);
                  const isEditing = editing?.rowIndex === rowIndex && editing.columnIndex === i;

                  if (isEditing) {
                    return (
                      <input
                        key={i}
                        autoFocus
                        value={editing.draft}
                        disabled={saving}
                        onChange={(event) => setEditing({ rowIndex, columnIndex: i, draft: event.target.value })}
                        onBlur={() => void commit()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void commit();
                          if (event.key === 'Escape') setEditing(null);
                        }}
                        className="shrink-0 border border-primary/60 bg-background px-2 py-0.5 text-xs font-mono outline-none"
                        style={{ minWidth: CELL_MIN_WIDTH }}
                      />
                    );
                  }

                  return (
                    <span
                      key={i}
                      onDoubleClick={() => {
                        if (!onCommitEdit) return;
                        setEditing({ rowIndex, columnIndex: i, draft: formatCellValue(value) });
                      }}
                      title={onCommitEdit ? undefined : readOnlyReason}
                      className={cn(
                        'shrink-0 truncate px-2.5',
                        onCommitEdit ? 'cursor-text' : '',
                        value === null || value === undefined ? 'text-muted-foreground/60 italic' : '',
                      )}
                      style={{ minWidth: CELL_MIN_WIDTH }}
                    >
                      {formatCellValue(value)}
                    </span>
                  );
                })}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
};
