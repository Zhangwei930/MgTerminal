import test from "node:test";
import assert from "node:assert/strict";

import { attemptDbConnection } from "./dbConnectAttempt.ts";

const params = {
  connectionId: "c1",
  engine: "postgres" as const,
  sshOptions: {},
  remoteHost: "127.0.0.1",
  remotePort: 55432,
  database: "mgtest",
  dbUsername: "postgres",
  dbPassword: "testpass",
};

test("a successful connect reports connected", async () => {
  const outcome = await attemptDbConnection(async () => ({ connectionId: "c1", success: true }), params);
  assert.deepEqual(outcome, { status: "connected" });
});

test("a resolved failure surfaces the reported error", async () => {
  const outcome = await attemptDbConnection(
    async () => ({ connectionId: "c1", success: false, error: "password authentication failed" }),
    params,
  );
  assert.deepEqual(outcome, { status: "error", error: "password authentication failed" });
});

test("a resolved failure with no message still reports an error", async () => {
  const outcome = await attemptDbConnection(async () => ({ connectionId: "c1", success: false }), params);
  assert.equal(outcome.status, "error");
  assert.match((outcome as { error: string }).error, /failed/i);
});

// dbBridge.connect throws rather than resolving {success:false} when the SSH
// tunnel cannot be established. Without a catch here the promise rejects, the
// then-branch never runs, and the UI sits on "connecting" forever with no clue
// why — which is exactly what a wrong port or an unreachable host produces.
test("a thrown tunnel failure becomes an error outcome, not a hang", async () => {
  const outcome = await attemptDbConnection(async () => {
    throw new Error("Failed to establish SSH tunnel");
  }, params);

  assert.equal(outcome.status, "error");
  assert.match((outcome as { error: string }).error, /SSH tunnel/);
});

test("a thrown non-Error is still reported rather than swallowed", async () => {
  const outcome = await attemptDbConnection(async () => {
    throw "boom";
  }, params);

  assert.equal(outcome.status, "error");
  assert.match((outcome as { error: string }).error, /boom/);
});

test("a rejection with an empty message still yields a usable error", async () => {
  const outcome = await attemptDbConnection(async () => {
    throw new Error("");
  }, params);

  assert.equal(outcome.status, "error");
  assert.ok((outcome as { error: string }).error.length > 0, "an empty message must not render a blank error");
});

test("the connect parameters are forwarded untouched", async () => {
  let seen: unknown = null;
  await attemptDbConnection(async (p) => { seen = p; return { connectionId: "c1", success: true }; }, params);
  assert.deepEqual(seen, params);
});
