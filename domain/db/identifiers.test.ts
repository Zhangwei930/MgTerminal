import test from "node:test";
import assert from "node:assert/strict";

import {
  formatQualifiedTable,
  parseQualifiedTable,
  quoteQualifiedTable,
  quoteSqlIdentifier,
} from "./identifiers.ts";

// ── quoteSqlIdentifier ──────────────────────────────────────────────────────

test("each engine gets its own delimiter", () => {
  assert.equal(quoteSqlIdentifier("mysql", "order"), "`order`");
  assert.equal(quoteSqlIdentifier("postgres", "order"), '"order"');
  assert.equal(quoteSqlIdentifier("oracle", "order"), '"order"');
  assert.equal(quoteSqlIdentifier("mssql", "order"), "[order]");
});

test("only the engine's own closing delimiter is escaped", () => {
  assert.equal(quoteSqlIdentifier("mysql", "a`b"), "`a``b`");
  assert.equal(quoteSqlIdentifier("postgres", 'a"b'), '"a""b"');
  assert.equal(quoteSqlIdentifier("mssql", "a]b"), "[a]]b]");
  // A backtick means nothing to Postgres; escaping it would corrupt the name.
  assert.equal(quoteSqlIdentifier("postgres", "a`b"), '"a`b"');
});

test("an empty or non-string identifier is refused rather than interpolated", () => {
  assert.throws(() => quoteSqlIdentifier("mysql", ""));
  assert.throws(() => quoteSqlIdentifier("mysql", null as unknown as string));
});

// ── quoteQualifiedTable ─────────────────────────────────────────────────────

// The schema tree lists tables from every schema but used to hand back a bare
// name, so `SELECT * FROM "users"` resolved through search_path — to a
// different table than the one that was clicked, or to nothing at all.

test("a schema is quoted as its own identifier, not folded into the name", () => {
  assert.equal(
    quoteQualifiedTable("postgres", { schema: "tenant_a", name: "users" }),
    '"tenant_a"."users"',
  );
  assert.equal(
    quoteQualifiedTable("mssql", { schema: "dbo", name: "users" }),
    "[dbo].[users]",
  );
  assert.equal(
    quoteQualifiedTable("mysql", { schema: "shop", name: "order" }),
    "`shop`.`order`",
  );
});

test("a table with no schema is quoted bare", () => {
  assert.equal(quoteQualifiedTable("postgres", { name: "users" }), '"users"');
  assert.equal(quoteQualifiedTable("postgres", "users"), '"users"');
});

test("a dotted string is split before quoting, never quoted whole", () => {
  // The old code produced "public.users" — one identifier, which no server has.
  assert.equal(quoteQualifiedTable("postgres", "public.users"), '"public"."users"');
});

test("delimiters inside a schema name are escaped too", () => {
  assert.equal(
    quoteQualifiedTable("postgres", { schema: 'we"ird', name: "users" }),
    '"we""ird"."users"',
  );
});

// ── parseQualifiedTable ─────────────────────────────────────────────────────

test("an unqualified name parses to a name with no schema", () => {
  assert.deepEqual(parseQualifiedTable("users"), { name: "users" });
});

test("a dotted name splits into schema and name", () => {
  assert.deepEqual(parseQualifiedTable("public.users"), { schema: "public", name: "users" });
});

test("only the first dot separates — the rest belongs to the name", () => {
  // Nothing in this app produces a three-part name, and treating the tail as
  // the table is safer than silently dropping part of it.
  assert.deepEqual(parseQualifiedTable("db.public.users"), { schema: "db", name: "public.users" });
});

test("surrounding quotes are stripped so a quoted SQL name round-trips", () => {
  assert.deepEqual(parseQualifiedTable('"public"."users"'), { schema: "public", name: "users" });
  assert.deepEqual(parseQualifiedTable("`shop`.`order`"), { schema: "shop", name: "order" });
  assert.deepEqual(parseQualifiedTable("[dbo].[users]"), { schema: "dbo", name: "users" });
});

// ── formatQualifiedTable ────────────────────────────────────────────────────

test("formatting is the inverse of parsing, and is stable as a map key", () => {
  assert.equal(formatQualifiedTable({ schema: "public", name: "users" }), "public.users");
  assert.equal(formatQualifiedTable({ name: "users" }), "users");
  assert.deepEqual(
    parseQualifiedTable(formatQualifiedTable({ schema: "public", name: "users" })),
    { schema: "public", name: "users" },
  );
});
