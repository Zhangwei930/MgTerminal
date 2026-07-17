/**
 * onOutput trigger side-effects beyond running a script.
 * When `triggerActions` is omitted, legacy behavior is `[{ type: 'runScript' }]`.
 */

export type TriggerActionType =
  | "runScript"
  | "notify"
  | "sound"
  | "markTab"
  | "startSessionLog";

export type TriggerAction =
  | { type: "runScript" }
  | { type: "notify"; title?: string; body?: string }
  | { type: "sound" }
  | { type: "markTab" }
  | { type: "startSessionLog" };

export const DEFAULT_TRIGGER_ACTIONS: TriggerAction[] = [{ type: "runScript" }];

const VALID_TYPES = new Set<TriggerActionType>([
  "runScript",
  "notify",
  "sound",
  "markTab",
  "startSessionLog",
]);

export function isTriggerActionType(value: unknown): value is TriggerActionType {
  return typeof value === "string" && VALID_TYPES.has(value as TriggerActionType);
}

export function normalizeTriggerAction(value: unknown): TriggerAction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isTriggerActionType(record.type)) return null;

  if (record.type === "notify") {
    const action: Extract<TriggerAction, { type: "notify" }> = { type: "notify" };
    if (typeof record.title === "string" && record.title.trim()) {
      action.title = record.title.trim().slice(0, 120);
    }
    if (typeof record.body === "string" && record.body.trim()) {
      action.body = record.body.trim().slice(0, 500);
    }
    return action;
  }

  return { type: record.type };
}

/** Deduped, validated action list. Empty input → []. */
export function normalizeTriggerActions(value: unknown): TriggerAction[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<TriggerActionType>();
  const out: TriggerAction[] = [];
  for (const item of value) {
    const action = normalizeTriggerAction(item);
    if (!action || seen.has(action.type)) continue;
    seen.add(action.type);
    out.push(action);
  }
  return out;
}

/**
 * Effective actions for an onOutput match.
 * - `triggerActions` omitted/null → legacy default `[{ type: 'runScript' }]`
 * - explicit `[]` → no side effects
 */
export function resolveTriggerActions(
  snippet: { triggerActions?: TriggerAction[] | null },
): TriggerAction[] {
  if (snippet.triggerActions === undefined || snippet.triggerActions === null) {
    return [...DEFAULT_TRIGGER_ACTIONS];
  }
  return normalizeTriggerActions(snippet.triggerActions);
}

export function triggerActionsIncludeRunScript(actions: readonly TriggerAction[]): boolean {
  return actions.some((action) => action.type === "runScript");
}

export function toggleTriggerAction(
  current: TriggerAction[] | undefined,
  type: TriggerActionType,
  enabled: boolean,
): TriggerAction[] {
  const base = normalizeTriggerActions(current);
  const without = base.filter((action) => action.type !== type);
  if (!enabled) return without;
  if (type === "notify") return [...without, { type: "notify" }];
  return [...without, { type }];
}

export function isTriggerActionEnabled(
  current: TriggerAction[] | null | undefined,
  type: TriggerActionType,
): boolean {
  // Legacy: missing triggerActions means runScript is on.
  if (current === undefined || current === null) {
    return type === "runScript";
  }
  return normalizeTriggerActions(current).some((action) => action.type === type);
}
