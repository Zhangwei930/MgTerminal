"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveSslOptions } = require("./sslOptions.cjs");

// A direct connection — no SSH leg — used to send the database password and
// every row in clear text, because no adapter had a TLS option at all and the
// SQL Server one hard-coded encrypt:false.

test("TLS is off by default, which is what a tunnelled connection wants", () => {
  for (const engine of ["mysql", "postgres", "mssql", "oracle"]) {
    assert.deepEqual(resolveSslOptions(engine, undefined), {}, engine);
    assert.deepEqual(resolveSslOptions(engine, { mode: "disable" }), {}, engine);
  }
});

test("MySQL verifies the server certificate when asked to", () => {
  assert.deepEqual(resolveSslOptions("mysql", { mode: "verify" }), {
    ssl: { rejectUnauthorized: true },
  });
});

test("Postgres verifies the server certificate when asked to", () => {
  assert.deepEqual(resolveSslOptions("postgres", { mode: "verify" }), {
    ssl: { rejectUnauthorized: true },
  });
});

// "require" is encryption without identity: it stops passive capture but not
// an active man in the middle. It exists because self-signed certificates on
// internal servers are the common case, and refusing them outright would push
// people back to no TLS at all.
test("require encrypts without checking who is on the other end", () => {
  assert.deepEqual(resolveSslOptions("mysql", { mode: "require" }), {
    ssl: { rejectUnauthorized: false },
  });
  assert.deepEqual(resolveSslOptions("postgres", { mode: "require" }), {
    ssl: { rejectUnauthorized: false },
  });
});

test("SQL Server spells both settings under options", () => {
  assert.deepEqual(resolveSslOptions("mssql", { mode: "verify" }), {
    options: { encrypt: true, trustServerCertificate: false },
  });
  assert.deepEqual(resolveSslOptions("mssql", { mode: "require" }), {
    options: { encrypt: true, trustServerCertificate: true },
  });
});

test("a CA certificate is passed through and implies verification", () => {
  const ca = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----";
  assert.deepEqual(resolveSslOptions("postgres", { mode: "verify", ca }), {
    ssl: { rejectUnauthorized: true, ca },
  });
});

test("Oracle reports that it is not configured here rather than pretending", () => {
  // oracledb negotiates TLS through the connect string / sqlnet.ora, not a
  // client option, so silently accepting a mode would claim protection that
  // was never applied.
  assert.throws(() => resolveSslOptions("oracle", { mode: "verify" }), /connect string|sqlnet/i);
});

test("an unknown mode is refused rather than quietly meaning disable", () => {
  assert.throws(() => resolveSslOptions("mysql", { mode: "sorta" }), /unknown/i);
});
