"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCapabilityRpcDispatcher, UNROUTED } = require("./capabilityRpcDispatch.cjs");
const { CAPABILITY_SURFACES, PERMISSION_MODES } = require("../../capabilities/constants.cjs");

function createTestDispatcher(overrides = {}) {
  const invokeVaultAgent = overrides.invokeVaultAgent || (async (op, params) => ({
    ok: true,
    op,
    params,
  }));
  const requestApprovalFromRenderer = overrides.requestApprovalFromRenderer
    || (async () => true);

  return createCapabilityRpcDispatcher({
    invokeVaultAgent,
    evaluatePermissionWithGrants: overrides.evaluatePermissionWithGrants || ((input, grants) => ({
      allowed: true,
      requiresApproval: false,
      grants,
      ...input,
    })),
    permissionMode: overrides.permissionMode || PERMISSION_MODES.CONFIRM,
    permissionGrantsSnapshot: [],
    isChatSessionCancelled: () => false,
    requestApprovalFromRenderer,
    USER_DENIED_MESSAGE: "User denied the operation.",
    ...overrides,
  });
}

test("dispatchCapabilityRpc returns UNROUTED for magiesTerminal builtin methods", async () => {
  const dispatch = createTestDispatcher();
  const result = await dispatch("magiesTerminal/exec", { chatSessionId: "chat-1" });
  assert.equal(result, UNROUTED);
});

test("dispatchCapabilityRpc routes vault host notes get to vault service", async () => {
  let invokedOp = null;
  const dispatch = createTestDispatcher({
    invokeVaultAgent: async (op, params) => {
      invokedOp = op;
      return { ok: true, hostId: params.hostId, notes: "notes" };
    },
  });

  const result = await dispatch("vault/host/notes/get", { hostId: "host-1" });
  assert.equal(invokedOp, "host.notes.get");
  assert.equal(result.ok, true);
  assert.equal(result.notes, "notes");
});

test("dispatchCapabilityRpc routes public vault host notes set through approval", async () => {
  const approvalCalls = [];
  const dispatch = createTestDispatcher({
    evaluatePermissionWithGrants: () => ({
      allowed: true,
      requiresApproval: true,
    }),
    requestApprovalFromRenderer: async (toolName, args, chatSessionId) => {
      approvalCalls.push({ toolName, args, chatSessionId });
      return true;
    },
    invokeVaultAgent: async (op, params) => ({
      ok: true,
      op,
      hostId: params.hostId,
      notes: params.notes,
    }),
  });

  const result = await dispatch("public/vault/hostNotes/set", {
    chatSessionId: "chat-1",
    hostId: "host-1",
    notes: "updated",
  });

  assert.equal(approvalCalls.length, 1);
  assert.equal(approvalCalls[0].toolName, "host_notes_set");
  assert.equal(result.ok, true);
  assert.equal(result.notes, "updated");
});

test("dispatchCapabilityRpc denies public vault host notes set when approval rejected", async () => {
  const dispatch = createTestDispatcher({
    evaluatePermissionWithGrants: () => ({
      allowed: true,
      requiresApproval: true,
    }),
    requestApprovalFromRenderer: async () => false,
  });

  const result = await dispatch("public/vault/hostNotes/set", {
    chatSessionId: "chat-1",
    hostId: "host-1",
    notes: "updated",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /denied/i);
});

test("dispatchCapabilityRpc rejects out-of-scope public session capabilities before approval or execution", async () => {
  let approvalRequested = false;
  let sessionsRead = false;
  const dispatch = createTestDispatcher({
    validateSessionScope: (sessionId, chatSessionId, scopedSessionIds) => {
      assert.equal(sessionId, "session-foreign");
      assert.equal(chatSessionId, "chat-1");
      assert.deepEqual(scopedSessionIds, ["session-allowed"]);
      return `Session "${sessionId}" is not in the current scope.`;
    },
    requestApprovalFromRenderer: async () => {
      approvalRequested = true;
      return true;
    },
    getSessions: () => {
      sessionsRead = true;
      return new Map();
    },
  });

  const result = await dispatch("public/kubernetes/pods/list", {
    chatSessionId: "chat-1",
    scopedSessionIds: ["session-allowed"],
    sessionId: "session-foreign",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /not in the current scope/i);
  assert.equal(approvalRequested, false);
  assert.equal(sessionsRead, false);
});

test("dispatchCapabilityRpc routes vault hosts create to vault service", async () => {
  let invokedOp = null;
  const dispatch = createTestDispatcher({
    invokeVaultAgent: async (op, params) => {
      invokedOp = op;
      return { ok: true, addedCount: 1, previewHosts: [] , params };
    },
  });

  const result = await dispatch("vault/hosts/create", {
    hosts: JSON.stringify([{ hostname: "10.2.0.209", username: "root" }]),
    dryRun: "true",
  });
  assert.equal(invokedOp, "hosts.create");
  assert.equal(result.ok, true);
});

test("dispatchCapabilityRpc routes vault hosts import to vault service", async () => {
  let invokedOp = null;
  const dispatch = createTestDispatcher({
    invokeVaultAgent: async (op) => {
      invokedOp = op;
      return { ok: true, addedCount: 0 };
    },
  });

  const result = await dispatch("vault/hosts/import", {
    format: "csv",
    text: "hostname,username\n10.0.0.1,root\n",
    dryRun: "true",
  });
  assert.equal(invokedOp, "host.import");
  assert.equal(result.ok, true);
});

test("dispatchCapabilityRpc routes portforward start to portforward service", async () => {
  let invokedOp = null;
  const dispatch = createTestDispatcher({
    invokeVaultAgent: async (op, params) => {
      invokedOp = op;
      return { ok: true, ruleId: params.ruleId, status: "active" };
    },
  });

  const result = await dispatch("portforward/start", {
    chatSessionId: "chat-1",
    ruleId: "rule-1",
  });
  assert.equal(invokedOp, "portforward.start");
  assert.equal(result.ok, true);
  assert.equal(result.ruleId, "rule-1");
});

test("dispatchCapabilityRpc reads permissionMode from deps on each call", async () => {
  const seenModes = [];
  const mutableDeps = { permissionMode: PERMISSION_MODES.CONFIRM };
  const liveDispatch = createCapabilityRpcDispatcher({
    invokeVaultAgent: async () => ({ ok: true }),
    evaluatePermissionWithGrants: (input) => {
      seenModes.push(input.permissionMode);
      return { allowed: true, requiresApproval: false };
    },
    get permissionMode() {
      return mutableDeps.permissionMode;
    },
    permissionGrantsSnapshot: [],
    isChatSessionCancelled: () => false,
    requestApprovalFromRenderer: async () => true,
    USER_DENIED_MESSAGE: "User denied the operation.",
  });

  await liveDispatch("vault/host/get", { hostId: "host-1" });
  mutableDeps.permissionMode = PERMISSION_MODES.AUTO;
  await liveDispatch("vault/host/get", { hostId: "host-2" });

  assert.deepEqual(seenModes, [PERMISSION_MODES.CONFIRM, PERMISSION_MODES.AUTO]);
});

test("implemented vault capabilities do not return CAPABILITY_NOT_IMPLEMENTED", async () => {
  const dispatch = createTestDispatcher();
  const result = await dispatch("vault/host/get", { hostId: "host-1" });
  assert.notEqual(result.code, "CAPABILITY_NOT_IMPLEMENTED");
});

// ── db capabilities: policy declarations must produce real approval behaviour ─
//
// These use the *real* evaluatePermissionWithGrants rather than the permissive
// stub above, because the guarantee under test is exactly that the policy flags
// in catalog/db.cjs translate into prompting. A stub that always returns
// requiresApproval:false would pass while the real thing silently ran writes.

const { evaluatePermissionWithGrants: realEvaluate } = require("../../capabilities/policy.cjs");

function createDbDispatcher(overrides = {}) {
  const queried = [];
  const approvals = [];
  const dbBridge = {
    listConnections: () => [{ connectionId: "c1", engine: "postgres", database: "clinic" }],
    async queryOnce(payload) {
      queried.push(payload);
      return { success: true, columns: [], rows: [], rowCount: 0, truncated: false, durationMs: 1 };
    },
  };
  const dispatch = createTestDispatcher({
    dbBridge,
    evaluatePermissionWithGrants: realEvaluate,
    requestApprovalFromRenderer: async (toolName, toolArgs, chatSessionId) => {
      approvals.push({ toolName, toolArgs, chatSessionId });
      return overrides.approve !== false;
    },
    ...overrides,
  });
  return { dispatch, queried, approvals };
}

test("db write requires approval and shows the statement being approved", async () => {
  const { dispatch, queried, approvals } = createDbDispatcher();

  const result = await dispatch("db/query/write", {
    connectionId: "c1",
    sql: "DELETE FROM patients WHERE id = 1",
    chatSessionId: "chat-1",
  });

  assert.equal(result.ok, true);
  assert.equal(approvals.length, 1, "a write must prompt in confirm mode");
  assert.equal(
    approvals[0].toolArgs.sql,
    "DELETE FROM patients WHERE id = 1",
    "the user has to see the exact statement they are approving",
  );
  assert.equal(queried.length, 1);
});

test("a denied approval stops the statement from reaching the database", async () => {
  const { dispatch, queried, approvals } = createDbDispatcher({ approve: false });

  const result = await dispatch("db/query/write", {
    connectionId: "c1",
    sql: "DROP TABLE patients",
    chatSessionId: "chat-1",
  });

  assert.equal(result.ok, false);
  assert.equal(approvals.length, 1);
  assert.equal(queried.length, 0, "denial must happen before execution, not after");
});

test("db read-only runs without prompting", async () => {
  const { dispatch, queried, approvals } = createDbDispatcher();

  const result = await dispatch("db/query/readonly", {
    connectionId: "c1",
    sql: "SELECT count(*) FROM patients",
    chatSessionId: "chat-1",
  });

  assert.equal(result.ok, true);
  assert.equal(approvals.length, 0, "prompting on every read is the friction that trains click-through");
  assert.equal(queried.length, 1);
});

// The unprompted path must not become a way around the prompted one.
test("a write sent to the read-only capability is refused, not run unprompted", async () => {
  const { dispatch, queried, approvals } = createDbDispatcher();

  const result = await dispatch("db/query/readonly", {
    connectionId: "c1",
    sql: "DELETE FROM patients",
    chatSessionId: "chat-1",
  });

  assert.equal(result.ok, false);
  assert.equal(approvals.length, 0);
  assert.equal(queried.length, 0, "it must never reach the database");
  assert.match(result.error, /db_query_write/);
});

test("observer mode blocks db writes outright", async () => {
  const { dispatch, queried } = createDbDispatcher({ permissionMode: PERMISSION_MODES.OBSERVER });

  const result = await dispatch("db/query/write", {
    connectionId: "c1",
    sql: "UPDATE patients SET name = 'x'",
    chatSessionId: "chat-1",
  });

  assert.equal(result.ok, false);
  assert.equal(queried.length, 0);
});

test("observer mode still allows db reads and connection listing", async () => {
  const { dispatch, queried } = createDbDispatcher({ permissionMode: PERMISSION_MODES.OBSERVER });

  const listed = await dispatch("db/connections/list", { chatSessionId: "chat-1" });
  assert.equal(listed.ok, true);
  assert.equal(listed.connections.length, 1);

  const read = await dispatch("db/query/readonly", {
    connectionId: "c1",
    sql: "SELECT 1",
    chatSessionId: "chat-1",
  });
  assert.equal(read.ok, true);
  assert.equal(queried.length, 1);
});
