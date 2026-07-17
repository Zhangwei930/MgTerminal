import test from "node:test";
import assert from "node:assert/strict";

import type { TerminalSession, Workspace } from "./models.ts";
import {
  captureWorkspaceTemplate,
  materializeWorkspaceFromTemplate,
  normalizeWorkspaceTemplateStore,
  removeWorkspaceTemplate,
  upsertWorkspaceTemplate,
} from "./workspaceTemplates.ts";

const sessions: TerminalSession[] = [
  {
    id: "s1",
    hostId: "h1",
    hostLabel: "web",
    username: "u",
    hostname: "web.example",
    status: "connected",
    protocol: "ssh",
    lastCwd: "/var/www",
  },
  {
    id: "s2",
    hostId: "h2",
    hostLabel: "db",
    username: "u",
    hostname: "db.example",
    status: "connected",
    protocol: "ssh",
  },
];

const workspace: Workspace = {
  id: "ws-1",
  title: "Prod pair",
  viewMode: "split",
  focusedSessionId: "s1",
  root: {
    id: "split",
    type: "split",
    direction: "vertical",
    sizes: [0.5, 0.5],
    children: [
      { id: "p1", type: "pane", sessionId: "s1" },
      { id: "p2", type: "pane", sessionId: "s2" },
    ],
  },
};

test("captureWorkspaceTemplate freezes host layout and cwd", () => {
  const template = captureWorkspaceTemplate({
    workspace,
    sessions,
    name: "Prod pair",
    now: 1000,
  });
  assert.ok(template);
  assert.equal(template!.name, "Prod pair");
  assert.equal(template!.panes.length, 2);
  assert.equal(template!.panes[0]?.lastCwd, "/var/www");
  assert.equal(template!.root.type, "split");
  assert.ok(template!.focusedPaneId);
});

test("materializeWorkspaceFromTemplate rehydrates session tree", () => {
  const template = captureWorkspaceTemplate({
    workspace,
    sessions,
    name: "Prod pair",
  })!;
  const paneSessionIds = new Map(
    template.panes.map((pane, index) => [pane.id, `new-${index}`]),
  );
  const next = materializeWorkspaceFromTemplate({ template, paneSessionIds });
  assert.ok(next);
  assert.equal(next!.title, "Prod pair");
  assert.equal(next!.root.type, "split");
  if (next!.root.type === "split") {
    assert.equal(next!.root.children.length, 2);
  }
});

test("store helpers upsert/remove and normalize", () => {
  const template = captureWorkspaceTemplate({
    workspace,
    sessions,
    name: "A",
    id: "t1",
    now: 1,
  })!;
  let store = upsertWorkspaceTemplate([], template);
  assert.equal(store.length, 1);
  store = upsertWorkspaceTemplate(store, { ...template, name: "B", updatedAt: 2 });
  assert.equal(store[0]?.name, "B");
  store = removeWorkspaceTemplate(store, "t1");
  assert.equal(store.length, 0);
  assert.equal(normalizeWorkspaceTemplateStore([null, template]).length, 1);
});
