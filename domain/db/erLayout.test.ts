import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutErDiagram } from './erLayout';

const rel = (from: string, to: string) => ({
  from, to, fromColumn: `${to}_id`, toColumn: 'id',
});

const depthOf = (nodes: { table: string; depth: number }[], table: string) =>
  nodes.find((n) => n.table === table)?.depth;

test('a table with no foreign keys sits at depth zero', () => {
  const { nodes } = layoutErDiagram(['patients'], []);
  assert.equal(depthOf(nodes, 'patients'), 0);
});

test('a table is placed after the one it references', () => {
  // visits.patient_id -> patients.id, so patients is the more basic table.
  const { nodes } = layoutErDiagram(['visits', 'patients'], [rel('visits', 'patients')]);
  assert.equal(depthOf(nodes, 'patients'), 0);
  assert.equal(depthOf(nodes, 'visits'), 1);
});

test('depth follows the longest chain, not the first one found', () => {
  const { nodes } = layoutErDiagram(
    ['a', 'b', 'c'],
    [rel('c', 'b'), rel('b', 'a'), rel('c', 'a')],
  );
  // c references both a and b; it must sit past b, not beside it.
  assert.equal(depthOf(nodes, 'a'), 0);
  assert.equal(depthOf(nodes, 'b'), 1);
  assert.equal(depthOf(nodes, 'c'), 2);
});

test('a self-referencing table does not recurse forever', () => {
  // An employee.manager_id -> employee.id is entirely normal.
  const { nodes } = layoutErDiagram(['employees'], [rel('employees', 'employees')]);
  assert.equal(depthOf(nodes, 'employees'), 0, 'a self-reference adds no depth');
});

test('a circular foreign key does not hang', () => {
  // Two tables referencing each other is legal and does happen.
  const { nodes } = layoutErDiagram(['a', 'b'], [rel('a', 'b'), rel('b', 'a')]);
  assert.equal(nodes.length, 2);
  for (const node of nodes) {
    assert.ok(Number.isFinite(node.depth), `${node.table} has a non-finite depth`);
  }
});

test('a longer cycle does not hang either', () => {
  const { nodes } = layoutErDiagram(['a', 'b', 'c'], [rel('a', 'b'), rel('b', 'c'), rel('c', 'a')]);
  assert.equal(nodes.length, 3);
  assert.ok(nodes.every((n) => Number.isFinite(n.depth)));
});

test('an isolated table still appears', () => {
  // Dropping it would make the diagram quietly incomplete.
  const { nodes } = layoutErDiagram(['lonely', 'a', 'b'], [rel('a', 'b')]);
  assert.ok(nodes.some((n) => n.table === 'lonely'));
});

test('an edge to an unknown table is dropped', () => {
  // A foreign key into another schema has no node to attach to.
  const { edges } = layoutErDiagram(['visits'], [rel('visits', 'elsewhere')]);
  assert.deepEqual(edges, []);
});

test('a self-referencing edge is kept', () => {
  // It is drawn as a loop, but it is real and worth showing.
  const { edges } = layoutErDiagram(['employees'], [rel('employees', 'employees')]);
  assert.equal(edges.length, 1);
});

test('every node gets a position and nodes never overlap', () => {
  const { nodes } = layoutErDiagram(['a', 'b', 'c', 'd'], [rel('b', 'a'), rel('c', 'a')]);
  const seen = new Set<string>();
  for (const node of nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${node.table} has no position`);
    const key = `${node.x}:${node.y}`;
    assert.ok(!seen.has(key), `${node.table} overlaps another node`);
    seen.add(key);
  }
});

test('tables at the same depth share a column', () => {
  const { nodes } = layoutErDiagram(['b', 'c', 'a'], [rel('b', 'a'), rel('c', 'a')]);
  const b = nodes.find((n) => n.table === 'b');
  const c = nodes.find((n) => n.table === 'c');
  assert.equal(b?.x, c?.x, 'same depth means same column');
  assert.notEqual(b?.y, c?.y, 'and different rows');
});

test('the diagram is stable regardless of input order', () => {
  // Re-reading the schema must not shuffle the layout under the user.
  const a = layoutErDiagram(['a', 'b', 'c'], [rel('b', 'a'), rel('c', 'a')]);
  const b = layoutErDiagram(['c', 'a', 'b'], [rel('c', 'a'), rel('b', 'a')]);
  assert.deepEqual(
    a.nodes.map((n) => `${n.table}@${n.x},${n.y}`).sort(),
    b.nodes.map((n) => `${n.table}@${n.x},${n.y}`).sort(),
  );
});

test('an empty schema produces an empty diagram', () => {
  assert.deepEqual(layoutErDiagram([], []), { nodes: [], edges: [] });
});
