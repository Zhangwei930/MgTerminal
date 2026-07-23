const test = require("node:test");
const assert = require("node:assert/strict");

const mysql = require("mysql2/promise");
const { createMysqlAdapter } = require("./mysqlAdapter.cjs");

function withFakeConnection(fakeConnection, fn) {
  const original = mysql.createConnection;
  mysql.createConnection = async () => fakeConnection;
  return fn().finally(() => {
    mysql.createConnection = original;
  });
}

test("connect resolves the server version from SELECT VERSION()", async () => {
  const fakeConnection = {
    threadId: 42,
    config: { host: "127.0.0.1", port: 3306, user: "root", password: "" },
    query: async (sql) => {
      assert.match(sql, /SELECT VERSION/);
      return [[{ version: "8.0.36" }]];
    },
    end: async () => {},
  };

  await withFakeConnection(fakeConnection, async () => {
    const adapter = createMysqlAdapter();
    const result = await adapter.connect({ host: "127.0.0.1", port: 3306, username: "root" });
    assert.equal(result.serverVersion, "8.0.36");
  });
});

test("query normalizes rows into row-major arrays matching column order", async () => {
  const fakeConnection = {
    threadId: 1,
    config: {},
    query: async (sql) => {
      if (/SELECT VERSION/.test(sql)) return [[{ version: "8.0" }]];
      return [
        [{ id: 1, name: "a" }, { id: 2, name: "b" }],
        [{ name: "id", type: mysql.Types.LONG }, { name: "name", type: mysql.Types.VARCHAR }],
      ];
    },
    end: async () => {},
  };

  await withFakeConnection(fakeConnection, async () => {
    const adapter = createMysqlAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 3306 });

    const batches = [];
    const result = await adapter.query("SELECT * FROM t", {
      maxRows: 10,
      onRowBatch: (batch) => batches.push(batch),
    });

    assert.equal(result.rowCount, 2);
    assert.equal(result.truncated, false);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].columns, [
      { name: "id", type: "number" },
      { name: "name", type: "string" },
    ]);
    assert.deepEqual(batches[0].rows, [[1, "a"], [2, "b"]]);
  });
});

test("query truncates results past maxRows and reports affectedRows for DML", async () => {
  const fakeConnection = {
    threadId: 1,
    config: {},
    query: async (sql) => {
      if (/SELECT VERSION/.test(sql)) return [[{ version: "8.0" }]];
      if (/UPDATE/.test(sql)) return [{ affectedRows: 5 }];
      const rows = Array.from({ length: 3 }, (_, i) => ({ id: i }));
      return [rows, [{ name: "id", type: mysql.Types.LONG }]];
    },
    end: async () => {},
  };

  await withFakeConnection(fakeConnection, async () => {
    const adapter = createMysqlAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 3306 });

    const batches = [];
    const result = await adapter.query("SELECT * FROM t", {
      maxRows: 2,
      onRowBatch: (batch) => batches.push(batch),
    });
    assert.equal(result.rowCount, 2);
    assert.equal(result.truncated, true);

    const dmlBatches = [];
    const dmlResult = await adapter.query("UPDATE t SET x = 1", {
      maxRows: 100,
      onRowBatch: (batch) => dmlBatches.push(batch),
    });
    assert.equal(dmlResult.affectedRows, 5);
    assert.equal(dmlResult.rowCount, 0);
  });
});
