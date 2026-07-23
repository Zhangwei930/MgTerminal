const test = require("node:test");
const assert = require("node:assert/strict");

const { Client, types } = require("pg");
const { createPostgresAdapter } = require("./postgresAdapter.cjs");

function withFakeClient(fakeClient, fn) {
  const original = Client.prototype.connect;
  const originalQuery = Client.prototype.query;
  const originalEnd = Client.prototype.end;
  Client.prototype.connect = fakeClient.connect;
  Client.prototype.query = fakeClient.query;
  Client.prototype.end = fakeClient.end;
  return fn().finally(() => {
    Client.prototype.connect = original;
    Client.prototype.query = originalQuery;
    Client.prototype.end = originalEnd;
  });
}

test("connect resolves the server version from SELECT version()", async () => {
  const fakeClient = {
    connect: async () => {},
    query: async (sql) => {
      assert.match(sql, /SELECT version/);
      return { rows: [{ version: "PostgreSQL 16.2" }], fields: [{ name: "version" }] };
    },
    end: async () => {},
  };

  await withFakeClient(fakeClient, async () => {
    const adapter = createPostgresAdapter();
    const result = await adapter.connect({ host: "127.0.0.1", port: 5432 });
    assert.equal(result.serverVersion, "PostgreSQL 16.2");
  });
});

test("query normalizes rows into row-major arrays matching column order", async () => {
  const fakeClient = {
    connect: async () => {},
    query: async (sql) => {
      if (/SELECT version/.test(sql)) {
        return { rows: [{ version: "PG" }], fields: [{ name: "version" }] };
      }
      return {
        rows: [{ id: 1, active: true }, { id: 2, active: false }],
        fields: [
          { name: "id", dataTypeID: types.builtins.INT4 },
          { name: "active", dataTypeID: types.builtins.BOOL },
        ],
        rowCount: 2,
      };
    },
    end: async () => {},
  };

  await withFakeClient(fakeClient, async () => {
    const adapter = createPostgresAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 5432 });

    const batches = [];
    const result = await adapter.query("SELECT * FROM t", {
      maxRows: 10,
      onRowBatch: (batch) => batches.push(batch),
    });

    assert.equal(result.rowCount, 2);
    assert.equal(result.truncated, false);
    assert.deepEqual(batches[0].columns, [
      { name: "id", type: "number" },
      { name: "active", type: "boolean" },
    ]);
    assert.deepEqual(batches[0].rows, [[1, true], [2, false]]);
  });
});

test("query reports affectedRows for DML with no field metadata", async () => {
  const fakeClient = {
    connect: async () => {},
    query: async (sql) => {
      if (/SELECT version/.test(sql)) return { rows: [{ version: "PG" }], fields: [{ name: "version" }] };
      return { rows: [], fields: [], rowCount: 3, command: "UPDATE" };
    },
    end: async () => {},
  };

  await withFakeClient(fakeClient, async () => {
    const adapter = createPostgresAdapter();
    await adapter.connect({ host: "127.0.0.1", port: 5432 });

    const dmlResult = await adapter.query("UPDATE t SET x = 1", {
      maxRows: 100,
      onRowBatch: () => {},
    });
    assert.equal(dmlResult.affectedRows, 3);
    assert.equal(dmlResult.rowCount, 0);
  });
});
