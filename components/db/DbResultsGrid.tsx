import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { FixedSizeVirtualList } from '../ui/FixedSizeVirtualList';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '../ui/context-menu';

interface DbResultsGridColumn {
  name: string;
  type: string;
}

export interface DbCellEdit {
  column: string;
  /**
   * The new value. `null` is SQL NULL — the "set null" action, distinct from
   * the four-character string a user can also type into a text column.
   */
  value: string | null;
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
  /** Absent means rows cannot be removed even when cells are editable. */
  onDeleteRow?: (target: { row: unknown[] }) => Promise<string | null>;
  /** Why editing is unavailable, shown on hover. */
  readOnlyReason?: string;
  /** Placeholder for the row filter box. */
  filterPlaceholder?: string;
}

const ROW_HEIGHT = 28;
const CELL_MIN_WIDTH = 140;

/** Stands in for SQL NULL in the overlay, so it renders as NULL and not ''. */
const NULL_VALUE = Symbol('sql-null');

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === NULL_VALUE) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value)) {
    // A BLOB/bytea column. JSON.stringify would render it as {"0":170,...},
    // which is neither readable nor what the column holds.
    const bytes = new Uint8Array(
      (value as ArrayBufferView).buffer,
      (value as ArrayBufferView).byteOffset,
      (value as ArrayBufferView).byteLength,
    );
    const hex = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
    return `0x${hex}${bytes.length > 16 ? `… (${bytes.length} bytes)` : ''}`;
  }
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
  onDeleteRow,
  readOnlyReason,
  filterPlaceholder = 'Filter rows…',
}) => {
  const [sort, setSort] = useState<{ columnIndex: number; direction: 'asc' | 'desc' } | null>(null);
  const [editing, setEditing] = useState<{ rowIndex: number; columnIndex: number; draft: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** Committed values overlay the fetched rows so an edit shows without a refetch. */
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  /** Rows removed by a committed DELETE, by their index in `rows`. */
  const [deleted, setDeleted] = useState<Set<number>>(() => new Set());
  /** Client-side row filter over what is already fetched. */
  const [filter, setFilter] = useState('');

  const sortedRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const withIndex = rows
      .map((row, i) => [row, i] as const)
      .filter(([, i]) => !deleted.has(i))
      // Matches any cell, on the rows already on screen. It does not re-query:
      // narrowing a result the server truncated would otherwise look like it
      // had searched the whole table.
      .filter(([row]) => !needle
        || row.some((cell) => formatCellValue(cell).toLowerCase().includes(needle)));
    if (!sort) return withIndex;
    const { columnIndex, direction } = sort;
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
  }, [deleted, filter, rows, sort]);

  const toggleSort = (columnIndex: number) => {
    setSort((prev) => {
      if (!prev || prev.columnIndex !== columnIndex) return { columnIndex, direction: 'asc' };
      if (prev.direction === 'asc') return { columnIndex, direction: 'desc' };
      return null;
    });
  };

  /** Sends one cell edit. `value` of null is SQL NULL. */
  const send = useCallback(
    async (rowIndex: number, columnIndex: number, value: string | null) => {
      if (!onCommitEdit) return;
      setSaving(true);
      setFailure(null);
      const problem = await onCommitEdit({
        column: columns[columnIndex].name,
        value,
        row: rows[rowIndex],
      });
      setSaving(false);
      if (problem) {
        // The cell stays open with the typed value, so the edit is not lost to
        // an error the user still has to read.
        setFailure(problem);
        return;
      }
      setOverrides((prev) => ({ ...prev, [`${rowIndex}:${columnIndex}`]: value === null ? NULL_VALUE : value }));
      setEditing(null);
    },
    [columns, onCommitEdit, rows],
  );

  const commit = useCallback(async () => {
    if (!editing) return;
    const { rowIndex, columnIndex, draft } = editing;
    const original = formatCellValue(rows[rowIndex]?.[columnIndex]);
    if (draft === original) {
      setEditing(null);
      return;
    }
    await send(rowIndex, columnIndex, draft);
  }, [editing, rows, send]);

  const setNull = useCallback(
    async (rowIndex: number, columnIndex: number) => {
      await send(rowIndex, columnIndex, null);
    },
    [send],
  );

  const removeRow = useCallback(
    async (rowIndex: number) => {
      if (!onDeleteRow) return;
      setSaving(true);
      setFailure(null);
      const problem = await onDeleteRow({ row: rows[rowIndex] });
      setSaving(false);
      if (problem) {
        setFailure(problem);
        return;
      }
      setDeleted((prev) => new Set(prev).add(rowIndex));
      setEditing(null);
    },
    [onDeleteRow, rows],
  );

  /**
   * Drops everything tied to the rows that were on screen when a new result
   * arrives.
   *
   * This component is not remounted between queries, so without this the
   * overlay from a committed edit stayed and was painted over whatever row now
   * sat at that index — showing a value the new result does not contain. Rows
   * hidden by a delete stayed hidden, and an open editor pointed at a row that
   * had been replaced. Paging hits this too: every page is a new result.
   *
   * Sort and filter are deliberately kept: they are the user's view of the
   * data rather than a claim about a particular row, and losing the filter on
   * every page turn would be its own bug.
   */
  useEffect(() => {
    setOverrides({});
    setDeleted(new Set());
    setEditing(null);
    setFailure(null);
  }, [rows]);

  // A different shape means the sort column no longer refers to what it did.
  useEffect(() => {
    setSort(null);
  }, [columns]);

  const cellValue = (rowIndex: number, columnIndex: number, raw: unknown) => {
    const key = `${rowIndex}:${columnIndex}`;
    return key in overrides ? overrides[key] : raw;
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-x-auto', className)}>
      {failure && (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 border-b border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
        >
          <span className="flex-1">{failure}</span>
          <button type="button" onClick={() => setFailure(null)} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={filterPlaceholder}
          className="w-56 rounded border border-border/60 bg-background px-2 py-0.5 text-xs outline-none focus:border-primary/60"
        />
        {filter && (
          <span className="text-[11px] text-muted-foreground">
            {sortedRows.length}/{rows.length}
          </span>
        )}
      </div>
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
                          // Navicat's shortcut for writing NULL into a cell.
                          if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            void setNull(rowIndex, i);
                          }
                        }}
                        className="shrink-0 border border-primary/60 bg-background px-2 py-0.5 text-xs font-mono outline-none"
                        style={{ minWidth: CELL_MIN_WIDTH }}
                      />
                    );
                  }

                  const cell = (
                    <span
                      onDoubleClick={() => {
                        if (!onCommitEdit) return;
                        setEditing({ rowIndex, columnIndex: i, draft: formatCellValue(value) });
                      }}
                      title={onCommitEdit ? undefined : readOnlyReason}
                      className={cn(
                        'shrink-0 truncate px-2.5',
                        onCommitEdit ? 'cursor-text' : '',
                        value === null || value === undefined || value === NULL_VALUE
                          ? 'text-muted-foreground/60 italic'
                          : '',
                      )}
                      style={{ minWidth: CELL_MIN_WIDTH }}
                    >
                      {formatCellValue(value)}
                    </span>
                  );

                  if (!onCommitEdit && !onDeleteRow) return <React.Fragment key={i}>{cell}</React.Fragment>;

                  return (
                    <ContextMenu key={i}>
                      <ContextMenuTrigger asChild>{cell}</ContextMenuTrigger>
                      <ContextMenuContent>
                        {onCommitEdit && (
                          <ContextMenuItem
                            disabled={saving}
                            onSelect={() => { void setNull(rowIndex, i); }}
                          >
                            Set NULL
                            <ContextMenuShortcut>⌘0</ContextMenuShortcut>
                          </ContextMenuItem>
                        )}
                        {onDeleteRow && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={saving}
                              onSelect={() => { void removeRow(rowIndex); }}
                            >
                              Delete row
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
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
