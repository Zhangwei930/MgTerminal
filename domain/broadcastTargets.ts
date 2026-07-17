/**
 * Precise broadcast target resolution (Xshell-style scopes).
 * Default scope remains "workspace" for backward compatibility.
 */

export type BroadcastScope = "workspace" | "selected" | "group" | "window";

export type BroadcastConfig = {
  enabled: boolean;
  scope: BroadcastScope;
  /** Used when scope === "selected". */
  selectedSessionIds: string[];
  /** Always applied after scope filtering. */
  excludeSessionIds: string[];
  /**
   * Optional explicit group path for scope === "group".
   * When omitted, callers should pass sourceGroupPath from the source host.
   */
  groupPath?: string;
};

export type BroadcastSessionRef = {
  id: string;
  workspaceId?: string;
  /** Host group path (Host.group); empty string = ungrouped. */
  groupPath?: string;
};

export const DEFAULT_BROADCAST_CONFIG: BroadcastConfig = {
  enabled: false,
  scope: "workspace",
  selectedSessionIds: [],
  excludeSessionIds: [],
};

export const createEnabledBroadcastConfig = (
  partial?: Partial<Omit<BroadcastConfig, "enabled">>,
): BroadcastConfig => ({
  ...DEFAULT_BROADCAST_CONFIG,
  ...partial,
  enabled: true,
  selectedSessionIds: partial?.selectedSessionIds
    ? [...partial.selectedSessionIds]
    : [],
  excludeSessionIds: partial?.excludeSessionIds
    ? [...partial.excludeSessionIds]
    : [],
});

export const normalizeBroadcastConfig = (
  value: Partial<BroadcastConfig> | null | undefined,
): BroadcastConfig => {
  const scope = value?.scope;
  const normalizedScope: BroadcastScope =
    scope === "selected" || scope === "group" || scope === "window" || scope === "workspace"
      ? scope
      : "workspace";

  const selectedSessionIds = Array.isArray(value?.selectedSessionIds)
    ? uniqueStrings(value.selectedSessionIds)
    : [];
  const excludeSessionIds = Array.isArray(value?.excludeSessionIds)
    ? uniqueStrings(value.excludeSessionIds)
    : [];

  return {
    enabled: Boolean(value?.enabled),
    scope: normalizedScope,
    selectedSessionIds,
    excludeSessionIds,
    groupPath: typeof value?.groupPath === "string" ? value.groupPath : undefined,
  };
};

export type ResolveBroadcastTargetsInput = {
  sourceSessionId: string;
  sessions: readonly BroadcastSessionRef[];
  config: BroadcastConfig;
  /**
   * Group path of the source session's host. Used when scope is "group"
   * and config.groupPath is not set.
   */
  sourceGroupPath?: string | null;
  /**
   * When false (default), the source session is omitted (keyboard fan-out:
   * source already received local input). When true, include source if it
   * matches the scope (compose bar writes to every target explicitly).
   */
  includeSource?: boolean;
};

/**
 * Resolve session IDs that should receive broadcast input.
 * Returns [] when broadcast is disabled.
 */
export const resolveBroadcastTargets = (
  input: ResolveBroadcastTargetsInput,
): string[] => {
  const config = normalizeBroadcastConfig(input.config);
  if (!config.enabled) return [];

  const source = input.sessions.find((session) => session.id === input.sourceSessionId);
  if (!source) return [];

  const exclude = new Set(config.excludeSessionIds);
  const candidates = collectScopeCandidates({
    source,
    sessions: input.sessions,
    scope: config.scope,
    selectedSessionIds: config.selectedSessionIds,
    groupPath: config.groupPath,
    sourceGroupPath: input.sourceGroupPath,
  });

  const includeSource = Boolean(input.includeSource);
  const targets: string[] = [];
  for (const sessionId of candidates) {
    if (!includeSource && sessionId === input.sourceSessionId) continue;
    if (exclude.has(sessionId)) continue;
    targets.push(sessionId);
  }
  return targets;
};

const collectScopeCandidates = (params: {
  source: BroadcastSessionRef;
  sessions: readonly BroadcastSessionRef[];
  scope: BroadcastScope;
  selectedSessionIds: readonly string[];
  groupPath?: string;
  sourceGroupPath?: string | null;
}): string[] => {
  const { source, sessions, scope, selectedSessionIds, groupPath, sourceGroupPath } = params;

  if (scope === "selected") {
    const selected = new Set(selectedSessionIds);
    return sessions.filter((session) => selected.has(session.id)).map((session) => session.id);
  }

  if (scope === "window") {
    return sessions.map((session) => session.id);
  }

  if (scope === "group") {
    const workspaceId = source.workspaceId;
    if (!workspaceId) return [];
    const targetGroup = normalizeGroupPath(
      groupPath !== undefined ? groupPath : (sourceGroupPath ?? source.groupPath),
    );
    return sessions
      .filter((session) => {
        if (session.workspaceId !== workspaceId) return false;
        return normalizeGroupPath(session.groupPath) === targetGroup;
      })
      .map((session) => session.id);
  }

  // workspace (default)
  const workspaceId = source.workspaceId;
  if (!workspaceId) return [];
  return sessions
    .filter((session) => session.workspaceId === workspaceId)
    .map((session) => session.id);
};

const normalizeGroupPath = (value: string | null | undefined): string =>
  typeof value === "string" ? value : "";

const uniqueStrings = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};
