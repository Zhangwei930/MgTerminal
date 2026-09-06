# Running the database client against real servers

`electron/bridges/dbClient/liveEngine.integration.test.cjs` runs the SQL this
app generates against a live server. Every other test in that directory asserts
the *text* a builder produces, which catches a wrong alias and misses
everything a server actually rejects — a keyword that needed quoting, clauses
in the wrong order, a function that engine does not have.

SQLite runs in memory and is always exercised. The others are skipped unless
their URL is in the environment, so `npm test` is unaffected by default:

```bash
MAGIES_TEST_POSTGRES=postgres://user:pass@127.0.0.1:5432/postgres \
MAGIES_TEST_MYSQL=mysql://user:pass@127.0.0.1:3306/mysql \
MAGIES_TEST_MARIADB=mysql://user:pass@127.0.0.1:3307/mysql \
  node --test --import tsx electron/bridges/dbClient/liveEngine.integration.test.cjs
```

Each engine gets its own schema (`magies_it`), created and dropped around the
run, so it will not touch anything else in the database you point it at. Point
it at a throwaway server all the same.

## What it covers

- Schema-qualified catalog reads: tables with their schema, columns, primary
  key, indexes, foreign keys — and that a same-named table in a second schema
  does not leak into any of them.
- Designer DDL: CREATE TABLE, ADD/ALTER/RENAME/DROP COLUMN, CREATE/DROP INDEX,
  RENAME TABLE, DROP TABLE — executed, not just generated.
- Preview and paging: consecutive pages are disjoint and in order.
- Row edits: UPDATE, writing NULL, DELETE reporting one affected row.
- Value round trips: a BLOB comes back as the same bytes (and matches as a
  WHERE key), a timestamp keeps its wall clock rather than shifting to UTC,
  and a boolean survives on engines that have no boolean type.
- Reserved words (`order`, `select`, `from`) as table and column names.

## Not covered

**SQL Server and Oracle.** Neither has a way to run locally on macOS without
Docker, so their dialect — `sp_rename`, `HEXTORAW`, `OFFSET … FETCH NEXT`,
`IDENTITY(1,1)`, the `sys.*` catalog reads — is still only asserted as strings.
Both are in the `ENGINES` list in that file: give them a URL and add an adapter
case, and they run with everything else.

## A note on writing these

MySQL's InnoDB parses a column-level `REFERENCES` and silently creates no
constraint. Foreign keys in these tests are declared as table-level
`CONSTRAINT … FOREIGN KEY` clauses, which all four engines honour. The inline
form passes on PostgreSQL and SQLite and quietly tests nothing on MySQL.
