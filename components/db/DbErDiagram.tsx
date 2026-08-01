import { Loader2, X } from 'lucide-react';
import React, { useMemo } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { layoutErDiagram, type ErRelation } from '../../domain/db/erLayout';

interface DbErDiagramProps {
  tables: string[];
  relations: ErRelation[];
  loading: boolean;
  onClose: () => void;
  /** Clicking a table loads its preview query. */
  onPickTable: (table: string) => void;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 34;
const PADDING = 40;

export const DbErDiagram: React.FC<DbErDiagramProps> = ({
  tables,
  relations,
  loading,
  onClose,
  onPickTable,
}) => {
  const { t } = useI18n();
  const { nodes, edges } = useMemo(() => layoutErDiagram(tables, relations), [tables, relations]);

  const positions = useMemo(
    () => new Map(nodes.map((node) => [node.table, node])),
    [nodes],
  );

  const width = Math.max(...nodes.map((n) => n.x + NODE_WIDTH), 0) + PADDING * 2;
  const height = Math.max(...nodes.map((n) => n.y + NODE_HEIGHT), 0) + PADDING * 2;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-medium">{t('db.er.title')}</span>
        <span className="text-xs text-muted-foreground">
          {t('db.er.summary', { tables: nodes.length, relations: edges.length })}
        </span>
        {loading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        <button
          type="button"
          onClick={onClose}
          title={t('db.er.close')}
          className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {nodes.length === 0 && !loading && (
          <div className="p-4 text-xs text-muted-foreground">{t('db.er.empty')}</div>
        )}
        <svg width={width} height={height} className="min-w-full">
          <defs>
            <marker
              id="er-arrow" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
            </marker>
          </defs>

          {edges.map((edge, i) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;

            // A self-reference has nowhere to go, so it loops out and back.
            if (edge.from === edge.to) {
              const x = from.x + PADDING + NODE_WIDTH;
              const y = from.y + PADDING + NODE_HEIGHT / 2;
              return (
                <path
                  key={`${edge.name}-${i}`}
                  d={`M ${x} ${y} c 30 -20 30 20 0 0`}
                  className="fill-none stroke-muted-foreground/50"
                  markerEnd="url(#er-arrow)"
                />
              );
            }

            // Referenced tables sit to the left, so the line leaves the source's
            // left edge and arrives at the target's right edge.
            const x1 = from.x + PADDING;
            const y1 = from.y + PADDING + NODE_HEIGHT / 2;
            const x2 = to.x + PADDING + NODE_WIDTH;
            const y2 = to.y + PADDING + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;

            return (
              <path
                key={`${edge.name}-${edge.from}-${edge.fromColumn}-${i}`}
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                className="fill-none stroke-muted-foreground/50"
                markerEnd="url(#er-arrow)"
              >
                <title>{`${edge.from}.${edge.fromColumn} → ${edge.to}.${edge.toColumn}`}</title>
              </path>
            );
          })}

          {nodes.map((node) => (
            <g
              key={node.table}
              transform={`translate(${node.x + PADDING}, ${node.y + PADDING})`}
              onClick={() => onPickTable(node.table)}
              className="cursor-pointer"
            >
              <rect
                width={NODE_WIDTH} height={NODE_HEIGHT} rx={4}
                className="fill-muted stroke-border hover:fill-muted/70"
              />
              <text
                x={NODE_WIDTH / 2} y={NODE_HEIGHT / 2 + 4}
                textAnchor="middle"
                className="fill-foreground text-xs"
                style={{ fontSize: 12 }}
              >
                {node.table}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};
