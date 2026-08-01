/**
 * Lays out an entity-relationship diagram from a table list and its foreign
 * keys.
 *
 * Tables are placed in columns by dependency depth: a table sits one column to
 * the right of everything it references, so the most basic tables are on the
 * left and the ones built on top of them trail off to the right.
 *
 * The depth calculation is where real schemas break naive code. A table
 * referencing itself (employees.manager_id -> employees.id) is entirely normal,
 * and two tables referencing each other is legal and does happen — either one
 * sends a plain recursive walk into an infinite loop. Both are handled by
 * treating an edge back into the current path as contributing no depth, which
 * puts a cycle's members on the same column rather than hanging.
 */

export interface ErRelation {
  from: string;
  to: string;
  fromColumn: string;
  toColumn: string;
}

export interface ErNode {
  table: string;
  depth: number;
  x: number;
  y: number;
}

export interface ErDiagram {
  nodes: ErNode[];
  edges: ErRelation[];
}

const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 140;

export function layoutErDiagram(tables: string[], relations: ErRelation[]): ErDiagram {
  if (!tables?.length) return { nodes: [], edges: [] };

  const known = new Set(tables);
  // A foreign key into another schema has no node to attach to; a
  // self-reference does, and is drawn as a loop.
  const edges = (relations ?? []).filter((r) => known.has(r.from) && known.has(r.to));

  /** table -> the tables it references */
  const references = new Map<string, Set<string>>();
  for (const table of tables) references.set(table, new Set());
  for (const edge of edges) {
    if (edge.from !== edge.to) references.get(edge.from)!.add(edge.to);
  }

  const depths = new Map<string, number>();
  const resolve = (table: string, path: Set<string>): number => {
    const cached = depths.get(table);
    if (cached !== undefined) return cached;
    // Already on the current path: following it again is the cycle. Contribute
    // nothing rather than recursing, which puts the cycle's members together.
    if (path.has(table)) return -1;

    path.add(table);
    let depth = 0;
    for (const target of references.get(table) ?? []) {
      const targetDepth = resolve(target, path);
      if (targetDepth >= 0) depth = Math.max(depth, targetDepth + 1);
    }
    path.delete(table);

    depths.set(table, depth);
    return depth;
  };
  for (const table of tables) resolve(table, new Set());

  // Sorted by name within a column so the layout does not shuffle when the
  // schema is re-read in a different order.
  const byDepth = new Map<number, string[]>();
  for (const table of [...tables].sort()) {
    const depth = depths.get(table) ?? 0;
    const column = byDepth.get(depth);
    if (column) column.push(table);
    else byDepth.set(depth, [table]);
  }

  const nodes: ErNode[] = [];
  for (const [depth, column] of byDepth) {
    column.forEach((table, row) => {
      nodes.push({ table, depth, x: depth * COLUMN_WIDTH, y: row * ROW_HEIGHT });
    });
  }

  return { nodes, edges };
}
