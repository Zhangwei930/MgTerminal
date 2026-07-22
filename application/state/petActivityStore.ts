/**
 * Module-level aggregator for the desktop pet's "is the AI busy right now" signal.
 * Each mounted AI chat panel instance (one per tab) owns its own streaming state,
 * so there is no single React tree node that can read "is anything streaming"
 * across tabs. Panels report into this store instead; usePetStatusBroadcaster
 * (mounted once in App.tsx) reads the aggregate.
 */

export interface PetFinishedSignal {
  outcome: 'done' | 'failed';
  at: number;
}

export interface PetBusyScope {
  scopeType: string;
  scopeTargetId: string | null;
}

type Listener = () => void;

const streamingByScope = new Map<string, boolean>();
const toolNameByScope = new Map<string, string>();
const busyScopeByKey = new Map<string, PetBusyScope>();
/** Most recently reported busy scope, kept even after it stops streaming — the
 *  pet click handler uses this to jump back to wherever the last activity was. */
let lastBusyScope: PetBusyScope | null = null;
let lastFinished: PetFinishedSignal | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    try { listener(); } catch { /* ignore listener errors */ }
  }
}

/** Called by an AI chat panel instance whenever its own streaming state changes. */
export function reportTabStreaming(scopeKey: string, isStreaming: boolean, scope?: PetBusyScope): void {
  const prev = streamingByScope.get(scopeKey) ?? false;
  if (scope) busyScopeByKey.set(scopeKey, scope);
  if (prev === isStreaming) return;
  if (isStreaming) {
    streamingByScope.set(scopeKey, true);
    if (scope) lastBusyScope = scope;
  } else {
    streamingByScope.delete(scopeKey);
    toolNameByScope.delete(scopeKey);
  }
  notify();
}

/** Called by an AI chat panel instance to report/clear the tool currently running for its scope. */
export function reportTabToolName(scopeKey: string, toolName: string | null): void {
  const prev = toolNameByScope.get(scopeKey) ?? null;
  if (prev === toolName) return;
  if (toolName) toolNameByScope.set(scopeKey, toolName);
  else toolNameByScope.delete(scopeKey);
  notify();
}

/** Called by an AI chat panel instance when one of its sessions just finished streaming. */
export function reportTabFinished(outcome: 'done' | 'failed'): void {
  lastFinished = { outcome, at: Date.now() };
  notify();
}

export function isAnyTabStreaming(): boolean {
  return streamingByScope.size > 0;
}

export function getLastFinished(): PetFinishedSignal | null {
  return lastFinished;
}

/** The tool name for an arbitrary busy scope, first-found (the pet only ever shows one at a time). */
export function getActiveToolName(): string | null {
  for (const name of toolNameByScope.values()) {
    if (name) return name;
  }
  return null;
}

/** Where to navigate on a pet click: the scope that's busy now, or was most recently. */
export function getRelevantBusyScope(): PetBusyScope | null {
  for (const [scopeKey, scope] of busyScopeByKey) {
    if (streamingByScope.get(scopeKey)) return scope;
  }
  return lastBusyScope;
}

export function subscribePetActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
