const test = require("node:test");
const assert = require("node:assert/strict");

const oracledb = require("oracledb");
const { createOracleAdapter } = require("./oracleAdapter.cjs");

function withFakeConnection(fakeConnection, fn) {
  const original = oracledb.getConnection;
  oracledb.getConnection = async () => fakeConnection;
  return fn().finally(() => {
    oracledb.getConnection = original;
  });
}

test("connect resolves the server version and uses a host:port/service connect string", async () => {
  let capturedConfig = null;
  const fakeConnection = {
    execute: async (sqlText) => {
      assert.match(sqlText, /v\$version/);
      return { rows: [["Oracle Database 19c"]] };
    },
    close: async () => {},
    break: async () => {},
  };

  const original = oracledb.getConnection;
  oracledb.getConnection = async (config) => {
    capturedConfig = config;
    return fakeConnection;
  };
  try {
    const adapter = createOracleAdapter();
    const result = await adapter.connect({
      host: "127.0.0.1", port: 1521, database: "ORCLPDB1", username: "sys", password: "secret",
    });
    assert.equal(result.serverVersion, "Oracle Database 19c");
    assert.equal(capturedConfig.connectString, "127.0.0.1:1521/ORCLPDB1");
  } finally {
    oracledb.getConnection = original;
  }
});

test("query normalizes rows into row-major arrays matching column order", async () => {
  const fakeConnection = {
    execute: async (sqlText) => {
      if (/v\$version/.test(sqlText)) return { rows: [["Oracle"]] };
      return {
        rows: [[1, "a"], [2, "b"]],
        metaData: [
          { name: "ID", dbType: oracledb.DB_TYPE_NUMBER },
          { name: "NAME", dbType: oracledb.DB_TYPE_VARCHAR },
        ],
      };
    },
    close: async () => {},
    break: async () => {},
  };

  await withFakeConnection(fakeConnection, async () => {
    const adapter = createOracleAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 1521, database: "ORCL" });

    const batches = [];
    const result = await adapter.query("SELECT * FROM t", {
      maxRows: 10,
      onRowBatch: (batch) => batches.push(batch),
    });

    assert.equal(result.rowCount, 2);
    assert.deepEqual(batches[0].columns, [
      { name: "ID", type: "number" },
      { name: "NAME", type: "string" },
    ]);
    assert.deepEqual(batches[0].rows, [[1, "a"], [2, "b"]]);
  });
});

test("query reports affectedRows for DML with no metaData", async () => {
  const fakeConnection = {
    execute: async (sqlText) => {
      if (/v\$version/.test(sqlText)) return { rows: [["Oracle"]] };
      return { rowsAffected: 3 };
    },
    close: async () => {},
    break: async () => {},
  };

  await withFakeConnection(fakeConnection, async () => {
    const adapter = createOracleAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 1521, database: "ORCL" });
    const result = await adapter.query("UPDATE t SET x = 1", { maxRows: 100, onRowBatch: () => {} });
    assert.equal(result.affectedRows, 3);
    assert.equal(result.rowCount, 0);
  });
});

test("cancel calls break on the active connection", async () => {
  let breakCalled = false;
  const fakeConnection = {
    execute: async (sqlText) => {
      if (/v\$version/.test(sqlText)) return { rows: [["Oracle"]] };
      return { rows: [], metaData: [] };
    },
    close: async () => {},
    break: async () => { breakCalled = true; },
  };

  await withFakeConnection(fakeConnection, async () => {
    const adapter = createOracleAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 1521, database: "ORCL" });
    await adapter.cancel();
    assert.equal(breakCalled, true);
  });
});
