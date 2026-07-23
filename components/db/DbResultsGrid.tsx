import React, { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { FixedSizeVirtualList } from '../ui/FixedSizeVirtualList';

interface DbResultsGridColumn {
  name: string;
  type: string;
}

interface DbResultsGridProps {
  columns: DbResultsGridColumn[];
  rows: unknown[][];
  className?: string;
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

export const DbResultsGrid: React.FC<DbResultsGridProps> = ({ columns, rows, className }) => {
  const [sort, setSort] = useState<{ columnIndex: number; direction: 'asc' | 'desc' } | null>(null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
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
    return withIndex.map(([row]) => row);
  }, [rows, sort]);

  const toggleSort = (columnIndex: number) => {
    setSort((prev) => {
      if (!prev || prev.columnIndex !== columnIndex) return { columnIndex, direction: 'asc' };
      if (prev.direction === 'asc') return { columnIndex, direction: 'desc' };
      return null;
    });
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
        <FixedSizeVirtualList<unknown[]>
          items={sortedRows}
          itemHeight={ROW_HEIGHT}
          getItemKey={(_row, index) => String(index)}
          renderItem={(row) => (
            <div className="flex h-full items-center border-b border-border/30 text-xs font-mono">
              {row.map((value, i) => (
                <span
                  key={i}
                  className={cn(
                    'shrink-0 truncate px-2.5',
                    value === null || value === undefined ? 'text-muted-foreground/60 italic' : '',
                  )}
                  style={{ minWidth: CELL_MIN_WIDTH }}
                >
                  {formatCellValue(value)}
                </span>
              ))}
            </div>
          )}
        />
      </div>
    </div>
  );
};
