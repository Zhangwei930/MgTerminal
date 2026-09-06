import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleDatabaseDump, dumpFileName } from './databaseDump';

const table = (name: string) => ({ schema: 'app', name });

test('a dump carries a header saying what it is and when', () => {
  const sql = assembleDatabaseDump({
    engine: 'postgres',
    database: 'shop',
    generatedAt: new Date(2026, 0, 2, 3, 4, 5),
    tables: [{ table: table('t'), ddl: 'CREATE TABLE "app"."t" (id int);', inserts: [] }],
  });
  assert.match(sql, /^-- MagiesTerminal database dump/m);
  assert.match(sql, /-- Database: shop/);
  assert.match(sql, /2026-01-02 03:04:05/);
});

test('each table contributes its DDL then its rows', () => {
  const sql = assembleDatabaseDump({
    engine: 'mysql',
    database: 'shop',
    generatedAt: new Date(2026, 0, 2),
    tables: [{
      table: table('orders'),
      ddl: 'CREATE TABLE `app`.`orders` (id int);',
      inserts: ['INSERT INTO `app`.`orders` (`id`) VALUES\n  (1);'],
    }],
  });
  const ddlAt = sql.indexOf('CREATE TABLE');
  const insertAt = sql.indexOf('INSERT INTO');
  assert.ok(ddlAt > -1 && insertAt > ddlAt, 'the table must exist before rows go into it');
  assert.match(sql, /-- Table: app\.orders/);
});

test('tables come out in the order given, so a restore replays them in it', () => {
  const sql = assembleDatabaseDump({
    engine: 'mysql',
    database: 'd',
    generatedAt: new Date(2026, 0, 2),
    tables: [
      { table: table('a'), ddl: 'CREATE TABLE a (id int);', inserts: [] },
      { table: table('b'), ddl: 'CREATE TABLE b (id int);', inserts: [] },
    ],
  });
  assert.ok(sql.indexOf('-- Table: app.a') < sql.indexOf('-- Table: app.b'));
});

// A restore that hits a foreign key before its target has rows fails halfway.
// The dump cannot reorder tables safely, so it disables the checks instead.
test('MySQL dumps wrap the body in a foreign key check toggle', () => {
  const sql = assembleDatabaseDump({
    engine: 'mysql',
    database: 'd',
    generatedAt: new Date(2026, 0, 2),
    tables: [{ table: table('t'), ddl: 'CREATE TABLE t (id int);', inserts: [] }],
  });
  assert.match(sql, /SET FOREIGN_KEY_CHECKS\s*=\s*0;/);
  assert.match(sql, /SET FOREIGN_KEY_CHECKS\s*=\s*1;/);
  assert.ok(
    sql.lastIndexOf('SET FOREIGN_KEY_CHECKS = 1') > sql.indexOf('CREATE TABLE'),
    'the checks come back on after the body',
  );
});

test('SQLite uses its own pragma for the same job', () => {
  const sql = assembleDatabaseDump({
    engine: 'sqlite',
    database: 'd',
    generatedAt: new Date(2026, 0, 2),
    tables: [{ table: table('t'), ddl: 'CREATE TABLE t (id int);', inserts: [] }],
  });
  assert.match(sql, /PRAGMA foreign_keys\s*=\s*OFF;/);
  assert.match(sql, /PRAGMA foreign_keys\s*=\s*ON;/);
});

test('engines with no such switch get no invented one', () => {
  // Postgres and SQL Server have nothing portable here; emitting a guess would
  // put a statement the server rejects at the top of every dump.
  const sql = assembleDatabaseDump({
    engine: 'postgres',
    database: 'd',
    generatedAt: new Date(2026, 0, 2),
    tables: [{ table: table('t'), ddl: 'CREATE TABLE t (id int);', inserts: [] }],
  });
  assert.ok(!/FOREIGN_KEY_CHECKS|PRAGMA/.test(sql));
});

test('a table whose DDL could not be read is recorded, not silently dropped', () => {
  const sql = assembleDatabaseDump({
    engine: 'postgres',
    database: 'd',
    generatedAt: new Date(2026, 0, 2),
    tables: [{ table: table('t'), ddl: null, error: 'permission denied', inserts: [] }],
  });
  assert.match(sql, /-- Table: app\.t/);
  assert.match(sql, /permission denied/);
  assert.ok(!sql.includes('CREATE TABLE'), 'nothing is invented in its place');
});

test('an empty database still produces a valid, self-describing file', () => {
  const sql = assembleDatabaseDump({
    engine: 'postgres', database: 'd', generatedAt: new Date(2026, 0, 2), tables: [],
  });
  assert.match(sql, /MagiesTerminal database dump/);
  assert.match(sql, /no tables/i);
});

// ── file name ───────────────────────────────────────────────────────────────

test('the file name carries the database and the timestamp', () => {
  assert.equal(
    dumpFileName('shop', new Date(2026, 0, 2, 3, 4, 5)),
    'shop-2026-01-02-030405.sql',
  );
});

test('a name that is not filesystem-safe is made safe', () => {
  assert.equal(dumpFileName('my/db name', new Date(2026, 0, 2)), 'my_db_name-2026-01-02-000000.sql');
});

test('a missing database name still yields a usable file name', () => {
  assert.match(dumpFileName('', new Date(2026, 0, 2)), /^database-2026-01-02/);
});
