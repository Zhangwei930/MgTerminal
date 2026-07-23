const test = require("node:test");
const assert = require("node:assert/strict");

const sql = require("mssql");
const { createMssqlAdapter } = require("./mssqlAdapter.cjs");

function withFakePool(fakePool, fn) {
  const originalConnect = sql.ConnectionPool.prototype.connect;
  const originalClose = sql.ConnectionPool.prototype.close;
  const originalRequest = sql.ConnectionPool.prototype.request;
  sql.ConnectionPool.prototype.connect = fakePool.connect;
  sql.ConnectionPool.prototype.close = fakePool.close;
  sql.ConnectionPool.prototype.request = fakePool.request;
  return fn().finally(() => {
    sql.ConnectionPool.prototype.connect = originalConnect;
    sql.ConnectionPool.prototype.close = originalClose;
    sql.ConnectionPool.prototype.request = originalRequest;
  });
}

function makeRequest(queryImpl) {
  return { query: queryImpl, cancel: () => {} };
}

test("connect resolves the server version from SELECT @@VERSION", async () => {
  const fakePool = {
    connect: async () => {},
    close: async () => {},
    request: () => makeRequest(async (sqlText) => {
      assert.match(sqlText, /@@VERSION/);
      return { recordset: [{ version: "Microsoft SQL Server 2022" }] };
    }),
  };

  await withFakePool(fakePool, async () => {
    const adapter = createMssqlAdapter();
    const result = await adapter.connect({ host: "127.0.0.1", port: 1433 });
    assert.equal(result.serverVersion, "Microsoft SQL Server 2022");
  });
});

test("query normalizes rows into row-major arrays matching column order", async () => {
  const fakePool = {
    connect: async () => {},
    close: async () => {},
    request: () => makeRequest(async (sqlText) => {
      if (/@@VERSION/.test(sqlText)) return { recordset: [{ version: "SQL" }] };
      return {
        recordset: Object.assign(
          [{ id: 1, name: "a" }, { id: 2, name: "b" }],
          { columns: { id: { name: "id", type: sql.Int }, name: { name: "name", type: sql.VarChar } } },
        ),
        rowsAffected: [2],
      };
    }),
  };

  await withFakePool(fakePool, async () => {
    const adapter = createMssqlAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 1433 });

    const batches = [];
    const result = await adapter.query("SELECT * FROM t", {
      maxRows: 10,
      onRowBatch: (batch) => batches.push(batch),
    });

    assert.equal(result.rowCount, 2);
    assert.deepEqual(batches[0].columns, [
      { name: "id", type: "number" },
      { name: "name", type: "string" },
    ]);
    assert.deepEqual(batches[0].rows, [[1, "a"], [2, "b"]]);
  });
});

test("query reports affectedRows for DML with no columns", async () => {
  const fakePool = {
    connect: async () => {},
    close: async () => {},
    request: () => makeRequest(async (sqlText) => {
      if (/@@VERSION/.test(sqlText)) return { recordset: [{ version: "SQL" }] };
      return { recordset: Object.assign([], { columns: {} }), rowsAffected: [4] };
    }),
  };

  await withFakePool(fakePool, async () => {
    const adapter = createMssqlAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 1433 });
    const result = await adapter.query("UPDATE t SET x = 1", { maxRows: 100, onRowBatch: () => {} });
    assert.equal(result.affectedRows, 4);
    assert.equal(result.rowCount, 0);
  });
});

test("cancel calls the active request's cancel method", async () => {
  let cancelCalled = false;
  const fakePool = {
    connect: async () => {},
    close: async () => {},
    request: () => ({
      query: async () => new Promise((resolve) => setTimeout(() => resolve({ recordset: Object.assign([], { columns: {} }), rowsAffected: [0] }), 20)),
      cancel: () => { cancelCalled = true; },
    }),
  };

  await withFakePool(fakePool, async () => {
    const adapter = createMssqlAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 1433 });
    const queryPromise = adapter.query("WAITFOR DELAY '00:00:05'", { maxRows: 10, onRowBatch: () => {} });
    await adapter.cancel();
    await queryPromise;
    assert.equal(cancelCalled, true);
  });
});
