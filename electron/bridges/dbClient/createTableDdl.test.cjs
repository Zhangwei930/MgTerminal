const test = require("node:test");
const assert = require("node:assert/strict");

const { DDL_IS_RECONSTRUCTED, buildCreateTableDdl } = require("./createTableDdl.cjs");

const columns = [
  { name: 'id', dataType: 'integer', nullable: false, position: 1 },
  { name: 'full_name', dataType: 'text', nullable: true, position: 2 },
];

const build = (engine, overrides = {}) =>
  buildCreateTableDdl({
    engine,
    table: 'patients',
    columns,
    primaryKey: ['id'],
    foreignKeys: [],
    ...overrides,
  });

test('the statement names the table and every column', () => {
  const ddl = build('postgres');
  // Line-anchored: the reconstruction warning precedes the statement.
  assert.match(ddl, /^CREATE TABLE/m);
  assert.ok(ddl.includes('"patients"'));
  assert.ok(ddl.includes('"id"'));
  assert.ok(ddl.includes('"full_name"'));
});

test('identifiers are quoted for the engine', () => {
  assert.ok(build('mysql').includes('`patients`'));
  assert.ok(build('mssql').includes('[patients]'));
  assert.ok(build('oracle').includes('"patients"'));
});

test('columns keep their declared order', () => {
  const ddl = build('postgres', {
    // Given out of order, as a catalog with an unsorted result would.
    columns: [columns[1], columns[0]],
  });
  assert.ok(ddl.indexOf('"id"') < ddl.indexOf('"full_name"'), 'position must decide the order');
});

test('NOT NULL is emitted only where the column says so', () => {
  const ddl = build('postgres');
  const idLine = ddl.split('\n').find((line) => line.includes('"id"')) ?? '';
  const nameLine = ddl.split('\n').find((line) => line.includes('"full_name"')) ?? '';
  assert.match(idLine, /NOT NULL/);
  assert.ok(!/NOT NULL/.test(nameLine), 'a nullable column must not be constrained');
});

test('the primary key becomes a constraint, not a column flag', () => {
  // A composite key cannot be expressed per column.
  const ddl = build('postgres', { primaryKey: ['tenant_id', 'id'] });
  assert.match(ddl, /PRIMARY KEY \("tenant_id", "id"\)/);
});

test('a table with no primary key gets no constraint line', () => {
  assert.ok(!/PRIMARY KEY/.test(build('postgres', { primaryKey: [] })));
});

test('foreign keys are emitted with their target', () => {
  const ddl = build('postgres', {
    foreignKeys: [
      { name: 'fk_doc', column: 'doctor_id', referencedTable: 'doctors', referencedColumn: 'id' },
    ],
  });
  assert.match(ddl, /FOREIGN KEY \("doctor_id"\) REFERENCES "doctors" \("id"\)/);
});

test('a composite foreign key is emitted as one constraint', () => {
  // Two rows of the same constraint are one FOREIGN KEY over two columns, not
  // two separate constraints.
  const ddl = build('postgres', {
    foreignKeys: [
      { name: 'fk_v', column: 'a', referencedTable: 't', referencedColumn: 'x' },
      { name: 'fk_v', column: 'b', referencedTable: 't', referencedColumn: 'y' },
    ],
  });
  assert.match(ddl, /FOREIGN KEY \("a", "b"\) REFERENCES "t" \("x", "y"\)/);
  assert.equal(ddl.match(/FOREIGN KEY/g)?.length, 1);
});

test('the statement carries a warning that it is reconstructed', () => {
  // Defaults, identity/auto-increment, check constraints, collations and
  // partitioning are not in what we read. Handing this to someone as a
  // faithful CREATE TABLE would silently drop them.
  assert.ok(build('postgres').includes(DDL_IS_RECONSTRUCTED));
});

test('a table with no columns is refused', () => {
  assert.throws(() => build('postgres', { columns: [] }), /column/i);
});

test('an injection payload in a column name cannot escape the identifier', () => {
  const ddl = build('mysql', {
    columns: [{ name: 'a`; DROP TABLE t; --', dataType: 'int', nullable: true, position: 1 }],
  });
  assert.ok(ddl.includes('`a``; DROP TABLE t; --`'), 'the backtick must be doubled');
});
