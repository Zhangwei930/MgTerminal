import test from "node:test";
import assert from "node:assert/strict";

import {
  createEnabledBroadcastConfig,
  normalizeBroadcastConfig,
  resolveBroadcastTargets,
  type BroadcastSessionRef,
} from "./broadcastTargets.ts";

const sessions: BroadcastSessionRef[] = [
  { id: "s1", workspaceId: "ws-a", groupPath: "prod" },
  { id: "s2", workspaceId: "ws-a", groupPath: "prod" },
  { id: "s3", workspaceId: "ws-a", groupPath: "staging" },
  { id: "s4", workspaceId: "ws-b", groupPath: "prod" },
  { id: "s5", groupPath: "prod" }, // orphan tab, no workspace
];

test("disabled config yields no targets", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: { enabled: false, scope: "workspace", selectedSessionIds: [], excludeSessionIds: [] },
    }),
    [],
  );
});

test("workspace scope matches current default: peers in same workspace", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({ scope: "workspace" }),
    }),
    ["s2", "s3"],
  );
});

test("workspace scope with includeSource includes the source session", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({ scope: "workspace" }),
      includeSource: true,
    }),
    ["s1", "s2", "s3"],
  );
});

test("workspace scope with excludeSessionIds skips excluded peers", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({
        scope: "workspace",
        excludeSessionIds: ["s3", "s2"],
      }),
    }),
    [],
  );
});

test("selected scope only includes listed sessions (minus source by default)", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({
        scope: "selected",
        selectedSessionIds: ["s1", "s3", "s4", "missing"],
      }),
    }),
    ["s3", "s4"],
  );
});

test("selected scope with includeSource keeps source when selected", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({
        scope: "selected",
        selectedSessionIds: ["s1", "s2"],
      }),
      includeSource: true,
    }),
    ["s1", "s2"],
  );
});

test("group scope matches same workspace + same group path", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({ scope: "group" }),
      sourceGroupPath: "prod",
    }),
    ["s2"],
  );
});

test("group scope uses config.groupPath override", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({ scope: "group", groupPath: "staging" }),
      sourceGroupPath: "prod",
    }),
    ["s3"],
  );
});

test("group scope with empty path matches ungrouped peers only", () => {
  const mixed: BroadcastSessionRef[] = [
    { id: "a", workspaceId: "ws", groupPath: "" },
    { id: "b", workspaceId: "ws" },
    { id: "c", workspaceId: "ws", groupPath: "prod" },
  ];
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "a",
      sessions: mixed,
      config: createEnabledBroadcastConfig({ scope: "group" }),
      sourceGroupPath: "",
    }),
    ["b"],
  );
});

test("window scope includes all sessions across workspaces", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({ scope: "window" }),
    }),
    ["s2", "s3", "s4", "s5"],
  );
});

test("window scope respects exclude list", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "s1",
      sessions,
      config: createEnabledBroadcastConfig({
        scope: "window",
        excludeSessionIds: ["s4", "s5"],
      }),
    }),
    ["s2", "s3"],
  );
});

test("unknown source yields no targets", () => {
  assert.deepEqual(
    resolveBroadcastTargets({
      sourceSessionId: "missing",
      sessions,
      config: createEnabledBroadcastConfig(),
    }),
    [],
  );
});

test("normalizeBroadcastConfig fills defaults and drops invalid scope", () => {
  assert.deepEqual(
    normalizeBroadcastConfig({ enabled: true, scope: "nope" as never, selectedSessionIds: ["a", "a", ""] }),
    {
      enabled: true,
      scope: "workspace",
      selectedSessionIds: ["a"],
      excludeSessionIds: [],
      groupPath: undefined,
    },
  );
});
