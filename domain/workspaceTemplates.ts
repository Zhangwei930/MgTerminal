/**
 * Named reusable workspace recipes (hosts + split layout + optional cwd/startup).
 * Distinct from session restore: templates are user-named and create/connect
 * on apply; restore only brings back disconnected placeholders.
 */

import type { TerminalSession, Workspace, WorkspaceNode, WorkspaceViewMode } from "./models";

export type WorkspaceTemplatePaneKind = "host" | "local" | "serial";

export type WorkspaceTemplatePane = {
  id: string;
  kind: WorkspaceTemplatePaneKind;
  /** Vault host id (host/serial). Empty for pure local shells. */
  hostId?: string;
  hostLabel?: string;
  /** Optional recipe fields applied when creating the session. */
  lastCwd?: string;
  startupCommand?: string;
  localShell?: string;
  localShellArgs?: string[];
  localShellName?: string;
  localShellIcon?: string;
  localStartDir?: string;
};

export type WorkspaceTemplateNode =
  | { id: string; type: "pane"; paneId: string }
  | {
    id: string;
    type: "split";
    direction: "horizontal" | "vertical";
    children: WorkspaceTemplateNode[];
    sizes?: number[];
  };

export type WorkspaceTemplate = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  viewMode?: WorkspaceViewMode;
  focusedPaneId?: string;
  panes: WorkspaceTemplatePane[];
  root: WorkspaceTemplateNode;
};

export type WorkspaceTemplateStore = WorkspaceTemplate[];

const createId = (prefix: string): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export function normalizeWorkspaceTemplate(value: unknown): WorkspaceTemplate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  if (!Array.isArray(record.panes) || record.panes.length === 0) return null;
  if (!record.root || typeof record.root !== "object") return null;

  const panes: WorkspaceTemplatePane[] = [];
  for (const raw of record.panes) {
    const pane = normalizePane(raw);
    if (pane) panes.push(pane);
  }
  if (panes.length === 0) return null;
  const paneIds = new Set(panes.map((pane) => pane.id));
  const root = normalizeTemplateNode(record.root, paneIds);
  if (!root) return null;

  const viewMode = record.viewMode === "focus" || record.viewMode === "split"
    ? record.viewMode
    : undefined;
  const focusedPaneId = typeof record.focusedPaneId === "string" && paneIds.has(record.focusedPaneId)
    ? record.focusedPaneId
    : undefined;

  return {
    id: record.id,
    name: record.name.trim().slice(0, 120),
    createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : Date.now(),
    viewMode,
    focusedPaneId,
    panes,
    root,
  };
}

export function normalizeWorkspaceTemplateStore(value: unknown): WorkspaceTemplateStore {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeWorkspaceTemplate(item))
    .filter((item): item is WorkspaceTemplate => Boolean(item))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function normalizePane(value: unknown): WorkspaceTemplatePane | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  const kind: WorkspaceTemplatePaneKind =
    record.kind === "local" || record.kind === "serial" || record.kind === "host"
      ? record.kind
      : "host";
  if (kind !== "local" && (typeof record.hostId !== "string" || !record.hostId)) {
    return null;
  }
  return {
    id: record.id,
    kind,
    hostId: typeof record.hostId === "string" ? record.hostId : undefined,
    hostLabel: typeof record.hostLabel === "string" ? record.hostLabel : undefined,
    lastCwd: typeof record.lastCwd === "string" && record.lastCwd ? record.lastCwd : undefined,
    startupCommand: typeof record.startupCommand === "string" && record.startupCommand
      ? record.startupCommand
      : undefined,
    localShell: typeof record.localShell === "string" ? record.localShell : undefined,
    localShellArgs: Array.isArray(record.localShellArgs)
      ? record.localShellArgs.filter((item): item is string => typeof item === "string")
      : undefined,
    localShellName: typeof record.localShellName === "string" ? record.localShellName : undefined,
    localShellIcon: typeof record.localShellIcon === "string" ? record.localShellIcon : undefined,
    localStartDir: typeof record.localStartDir === "string" ? record.localStartDir : undefined,
  };
}

function normalizeTemplateNode(
  value: unknown,
  paneIds: Set<string>,
): WorkspaceTemplateNode | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (record.type === "pane") {
    if (typeof record.paneId !== "string" || !paneIds.has(record.paneId)) return null;
    return { id: record.id, type: "pane", paneId: record.paneId };
  }
  if (record.type === "split") {
    if (!Array.isArray(record.children) || record.children.length < 2) return null;
    const direction = record.direction === "horizontal" ? "horizontal" : "vertical";
    const children: WorkspaceTemplateNode[] = [];
    for (const child of record.children) {
      const node = normalizeTemplateNode(child, paneIds);
      if (!node) return null;
      children.push(node);
    }
    const sizes = Array.isArray(record.sizes)
      ? record.sizes.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : undefined;
    return {
      id: record.id,
      type: "split",
      direction,
      children,
      sizes: sizes && sizes.length === children.length ? sizes : undefined,
    };
  }
  return null;
}

/**
 * Capture a live workspace as a reusable template.
 * Maps runtime sessionIds → stable template pane ids.
 */
export function captureWorkspaceTemplate(input: {
  workspace: Workspace;
  sessions: readonly TerminalSession[];
  name: string;
  id?: string;
  now?: number;
}): WorkspaceTemplate | null {
  const sessionById = new Map(input.sessions.map((session) => [session.id, session]));
  const sessionIds = collectSessionIdsFromRoot(input.workspace.root);
  if (sessionIds.length === 0) return null;

  const panes: WorkspaceTemplatePane[] = [];
  const sessionToPane = new Map<string, string>();

  for (const sessionId of sessionIds) {
    const session = sessionById.get(sessionId);
    if (!session) continue;
    const paneId = createId("pane");
    sessionToPane.set(sessionId, paneId);
    panes.push(sessionToTemplatePane(session, paneId));
  }
  if (panes.length === 0) return null;

  const root = mapWorkspaceNodeToTemplate(input.workspace.root, sessionToPane);
  if (!root) return null;

  const focusedPaneId = input.workspace.focusedSessionId
    ? sessionToPane.get(input.workspace.focusedSessionId)
    : undefined;
  const now = input.now ?? Date.now();

  return {
    id: input.id || createId("wstpl"),
    name: input.name.trim().slice(0, 120) || "Workspace template",
    createdAt: now,
    updatedAt: now,
    viewMode: input.workspace.viewMode,
    focusedPaneId,
    panes,
    root,
  };
}

function sessionToTemplatePane(session: TerminalSession, paneId: string): WorkspaceTemplatePane {
  const protocol = session.protocol;
  const kind: WorkspaceTemplatePaneKind =
    protocol === "local" || session.hostId?.startsWith("local-")
      ? "local"
      : protocol === "serial" || session.hostId?.startsWith("serial-")
        ? "serial"
        : "host";

  return {
    id: paneId,
    kind,
    hostId: kind === "local" ? undefined : session.hostId,
    hostLabel: session.hostLabel || session.customName || session.hostname,
    lastCwd: session.lastCwd,
    startupCommand: session.startupCommand,
    localShell: session.localShell,
    localShellArgs: session.localShellArgs,
    localShellName: session.localShellName,
    localShellIcon: session.localShellIcon,
    localStartDir: session.localStartDir || session.lastCwd,
  };
}

function mapWorkspaceNodeToTemplate(
  node: WorkspaceNode,
  sessionToPane: Map<string, string>,
): WorkspaceTemplateNode | null {
  if (node.type === "pane") {
    const paneId = sessionToPane.get(node.sessionId);
    if (!paneId) return null;
    return { id: createId("node"), type: "pane", paneId };
  }
  const children: WorkspaceTemplateNode[] = [];
  for (const child of node.children) {
    const mapped = mapWorkspaceNodeToTemplate(child, sessionToPane);
    if (mapped) children.push(mapped);
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return {
    id: createId("node"),
    type: "split",
    direction: node.direction,
    children,
    sizes: node.sizes && node.sizes.length === children.length ? [...node.sizes] : undefined,
  };
}

function collectSessionIdsFromRoot(node: WorkspaceNode): string[] {
  if (node.type === "pane") return [node.sessionId];
  return node.children.flatMap((child) => collectSessionIdsFromRoot(child));
}

/**
 * Build a runtime workspace tree from a template using paneId → sessionId map.
 */
export function materializeWorkspaceFromTemplate(input: {
  template: WorkspaceTemplate;
  paneSessionIds: ReadonlyMap<string, string>;
  workspaceId?: string;
}): Workspace | null {
  const root = materializeNode(input.template.root, input.paneSessionIds);
  if (!root) return null;
  const sessionIds = collectSessionIdsFromRoot(root);
  if (sessionIds.length === 0) return null;

  const focusedSessionId = input.template.focusedPaneId
    ? input.paneSessionIds.get(input.template.focusedPaneId)
    : sessionIds[0];

  return {
    id: input.workspaceId || createId("ws"),
    title: input.template.name,
    viewMode: input.template.viewMode || "split",
    focusedSessionId: focusedSessionId || sessionIds[0],
    focusSessionOrder: sessionIds,
    root,
  };
}

function materializeNode(
  node: WorkspaceTemplateNode,
  paneSessionIds: ReadonlyMap<string, string>,
): WorkspaceNode | null {
  if (node.type === "pane") {
    const sessionId = paneSessionIds.get(node.paneId);
    if (!sessionId) return null;
    return { id: createId("node"), type: "pane", sessionId };
  }
  const children: WorkspaceNode[] = [];
  for (const child of node.children) {
    const mapped = materializeNode(child, paneSessionIds);
    if (mapped) children.push(mapped);
  }
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return {
    id: createId("node"),
    type: "split",
    direction: node.direction,
    children,
    sizes: node.sizes && node.sizes.length === children.length ? [...node.sizes] : undefined,
  };
}

export function upsertWorkspaceTemplate(
  store: WorkspaceTemplateStore,
  template: WorkspaceTemplate,
): WorkspaceTemplateStore {
  const without = store.filter((item) => item.id !== template.id);
  return [template, ...without].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function removeWorkspaceTemplate(
  store: WorkspaceTemplateStore,
  templateId: string,
): WorkspaceTemplateStore {
  return store.filter((item) => item.id !== templateId);
}

export function renameWorkspaceTemplate(
  store: WorkspaceTemplateStore,
  templateId: string,
  name: string,
  now = Date.now(),
): WorkspaceTemplateStore {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return store;
  return store.map((item) => (
    item.id === templateId
      ? { ...item, name: trimmed, updatedAt: now }
      : item
  )).sort((a, b) => b.updatedAt - a.updatedAt);
}
