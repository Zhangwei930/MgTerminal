import { useCallback, useEffect, useRef, useState } from "react";

import type { Host, ManagedSource } from "../../domain/models";
import {
  createJsonManagedSource,
  hashInventoryContent,
  isHttpInventoryUrl,
  isJsonManagedSourceType,
  listDueHostDataSources,
  normalizeAutoSyncIntervalMs,
  parseInventoryDocument,
  syncHostsFromInventory,
  withHostDataSourceSyncOutcome,
  type HostDataSourceSyncStats,
} from "../../domain/hostDataSource";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";

const MAX_INVENTORY_BYTES = 5 * 1024 * 1024;
/** Background poll frequency; actual source cadence is per-source autoSyncIntervalMs. */
const AUTO_SYNC_TICK_MS = 30_000;

export type HostDataSourceSyncOutcome = {
  sourceId: string;
  success: boolean;
  stats?: HostDataSourceSyncStats;
  error?: string;
  unchanged?: boolean;
};

export interface UseHostDataSourceSyncOptions {
  hosts: Host[];
  customGroups: string[];
  managedSources: ManagedSource[];
  onUpdateHosts: (hosts: Host[]) => void;
  onUpdateCustomGroups: (groups: string[]) => void;
  onUpdateManagedSources: (sources: ManagedSource[]) => void;
}

async function readLocalInventoryText(filePath: string): Promise<string> {
  const bridge = magiesTerminalBridge.get();
  if (!bridge?.readLocalFile) {
    throw new Error("Local file read is unavailable.");
  }
  const buffer = await bridge.readLocalFile(filePath, { maxBytes: MAX_INVENTORY_BYTES });
  return new TextDecoder().decode(buffer);
}

async function fetchHttpInventoryText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json, text/plain, text/*, */*" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
    }
    const text = await response.text();
    if (text.length > MAX_INVENTORY_BYTES) {
      throw new Error("Inventory payload exceeds 5MB limit.");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadInventoryRawText(source: Pick<ManagedSource, "type" | "filePath">): Promise<string> {
  if (source.type === "json_file") {
    return readLocalInventoryText(source.filePath);
  }
  if (source.type === "json_http") {
    return fetchHttpInventoryText(source.filePath);
  }
  throw new Error("Source is not a JSON inventory.");
}

export function useHostDataSourceSync({
  hosts,
  customGroups,
  managedSources,
  onUpdateHosts,
  onUpdateCustomGroups,
  onUpdateManagedSources,
}: UseHostDataSourceSyncOptions) {
  const [syncingSourceId, setSyncingSourceId] = useState<string | null>(null);
  const hostsRef = useRef(hosts);
  const customGroupsRef = useRef(customGroups);
  const managedSourcesRef = useRef(managedSources);
  hostsRef.current = hosts;
  customGroupsRef.current = customGroups;
  managedSourcesRef.current = managedSources;

  const applyInventoryToSource = useCallback(
    async (
      source: ManagedSource,
      options?: { force?: boolean },
    ): Promise<HostDataSourceSyncOutcome> => {
      if (!isJsonManagedSourceType(source.type)) {
        return { sourceId: source.id, success: false, error: "Not a JSON inventory source." };
      }
      if (source.enabled === false) {
        return { sourceId: source.id, success: false, error: "Source is disabled." };
      }

      try {
        const raw = await loadInventoryRawText(source);
        const contentHash = hashInventoryContent(raw);
        if (!options?.force && source.lastFileHash && source.lastFileHash === contentHash) {
          const now = Date.now();
          const updatedSources = managedSourcesRef.current.map((entry) =>
            entry.id === source.id
              ? withHostDataSourceSyncOutcome(entry, { success: true, unchanged: true, now })
              : entry,
          );
          managedSourcesRef.current = updatedSources;
          onUpdateManagedSources(updatedSources);
          return {
            sourceId: source.id,
            success: true,
            unchanged: true,
            stats: { added: 0, updated: 0, removed: 0, skipped: 0, totalInventory: 0 },
          };
        }

        const inventory = parseInventoryDocument(raw);
        const result = syncHostsFromInventory({
          existingHosts: hostsRef.current,
          customGroups: customGroupsRef.current,
          inventory,
          source,
        });

        onUpdateHosts(result.hosts);
        onUpdateCustomGroups(result.customGroups);

        const now = Date.now();
        const updatedSources = managedSourcesRef.current.map((entry) =>
          entry.id === source.id
            ? withHostDataSourceSyncOutcome(entry, {
              success: true,
              now,
              contentHash,
            })
            : entry,
        );
        onUpdateManagedSources(updatedSources);
        hostsRef.current = result.hosts;
        customGroupsRef.current = result.customGroups;
        managedSourcesRef.current = updatedSources;

        return {
          sourceId: source.id,
          success: true,
          stats: result.stats,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const now = Date.now();
        const updatedSources = managedSourcesRef.current.map((entry) =>
          entry.id === source.id
            ? withHostDataSourceSyncOutcome(entry, { success: false, error: message, now })
            : entry,
        );
        managedSourcesRef.current = updatedSources;
        onUpdateManagedSources(updatedSources);
        return { sourceId: source.id, success: false, error: message };
      }
    },
    [onUpdateCustomGroups, onUpdateHosts, onUpdateManagedSources],
  );

  const syncSource = useCallback(
    async (sourceId: string, options?: { force?: boolean }): Promise<HostDataSourceSyncOutcome> => {
      const source = managedSourcesRef.current.find((entry) => entry.id === sourceId);
      if (!source) {
        return { sourceId, success: false, error: "Source not found." };
      }
      setSyncingSourceId(sourceId);
      try {
        return await applyInventoryToSource(source, options);
      } finally {
        setSyncingSourceId((current) => (current === sourceId ? null : current));
      }
    },
    [applyInventoryToSource],
  );

  const syncAllJsonSources = useCallback(
    async (options?: { force?: boolean }): Promise<HostDataSourceSyncOutcome[]> => {
      const sources = managedSourcesRef.current.filter(
        (source) => isJsonManagedSourceType(source.type) && source.enabled !== false,
      );
      const outcomes: HostDataSourceSyncOutcome[] = [];
      for (const source of sources) {
        setSyncingSourceId(source.id);
        outcomes.push(await applyInventoryToSource(source, options));
      }
      setSyncingSourceId(null);
      return outcomes;
    },
    [applyInventoryToSource],
  );

  const addJsonSource = useCallback(
    async (input: {
      type: "json_file" | "json_http";
      filePath: string;
      groupName: string;
      label?: string;
      syncMode?: "merge" | "replace_group";
      autoSyncIntervalMs?: number;
      syncNow?: boolean;
    }): Promise<{ source: ManagedSource; outcome?: HostDataSourceSyncOutcome }> => {
      const path = input.filePath.trim();
      if (!path) {
        throw new Error("Path or URL is required.");
      }
      if (input.type === "json_http" && !isHttpInventoryUrl(path)) {
        throw new Error("URL must start with http:// or https://");
      }
      if (input.type === "json_file" && isHttpInventoryUrl(path)) {
        throw new Error("Use the HTTP source type for URLs.");
      }

      const groupName = input.groupName.trim().replace(/\\/g, "/") || "Inventory";
      const existing = managedSourcesRef.current.find(
        (source) => source.filePath === path && isJsonManagedSourceType(source.type),
      );
      if (existing) {
        throw new Error(`This inventory is already managed as "${existing.groupName}".`);
      }

      const source = createJsonManagedSource({
        type: input.type,
        filePath: path,
        groupName,
        label: input.label,
        syncMode: input.syncMode,
        autoSyncIntervalMs: input.autoSyncIntervalMs,
      });

      const nextSources = [...managedSourcesRef.current, source];
      managedSourcesRef.current = nextSources;
      onUpdateManagedSources(nextSources);

      if (input.syncNow === false) {
        return { source };
      }

      setSyncingSourceId(source.id);
      try {
        const outcome = await applyInventoryToSource(source, { force: true });
        return { source, outcome };
      } finally {
        setSyncingSourceId((current) => (current === source.id ? null : current));
      }
    },
    [applyInventoryToSource, onUpdateManagedSources],
  );

  /**
   * Detach a JSON inventory source. Hosts remain in the vault as unmanaged
   * (credentials / local edits preserved). Optionally delete managed hosts.
   */
  const removeJsonSource = useCallback(
    (sourceId: string, options?: { deleteHosts?: boolean }) => {
      const source = managedSourcesRef.current.find((entry) => entry.id === sourceId);
      if (!source || !isJsonManagedSourceType(source.type)) {
        return false;
      }

      let nextHosts = hostsRef.current;
      if (options?.deleteHosts) {
        nextHosts = hostsRef.current.filter((host) => host.managedSourceId !== sourceId);
      } else {
        nextHosts = hostsRef.current.map((host) =>
          host.managedSourceId === sourceId
            ? { ...host, managedSourceId: undefined, managedExternalId: undefined }
            : host,
        );
      }
      onUpdateHosts(nextHosts);
      hostsRef.current = nextHosts;

      const nextSources = managedSourcesRef.current.filter((entry) => entry.id !== sourceId);
      onUpdateManagedSources(nextSources);
      managedSourcesRef.current = nextSources;
      return true;
    },
    [onUpdateHosts, onUpdateManagedSources],
  );

  const setSourceEnabled = useCallback(
    (sourceId: string, enabled: boolean) => {
      const nextSources = managedSourcesRef.current.map((entry) =>
        entry.id === sourceId ? { ...entry, enabled } : entry,
      );
      managedSourcesRef.current = nextSources;
      onUpdateManagedSources(nextSources);
    },
    [onUpdateManagedSources],
  );

  const setAutoSyncInterval = useCallback(
    (sourceId: string, autoSyncIntervalMs: number | undefined) => {
      const interval = normalizeAutoSyncIntervalMs(autoSyncIntervalMs);
      const nextSources = managedSourcesRef.current.map((entry) =>
        entry.id === sourceId
          ? { ...entry, autoSyncIntervalMs: interval }
          : entry,
      );
      managedSourcesRef.current = nextSources;
      onUpdateManagedSources(nextSources);
    },
    [onUpdateManagedSources],
  );

  // Background auto-sync for inventory sources that opted into an interval.
  // Uses content-hash short-circuit (force: false) to avoid vault churn.
  // Timer is long-lived (does not restart on each lastSyncedAt write).
  const autoSyncInFlightRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || autoSyncInFlightRef.current) return;
      const due = listDueHostDataSources(managedSourcesRef.current);
      if (due.length === 0) return;
      autoSyncInFlightRef.current = true;
      try {
        for (const source of due) {
          if (cancelled) break;
          await applyInventoryToSource(source, { force: false });
        }
      } finally {
        autoSyncInFlightRef.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => {
      void tick();
    }, AUTO_SYNC_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applyInventoryToSource]);

  return {
    syncingSourceId,
    syncSource,
    syncAllJsonSources,
    addJsonSource,
    removeJsonSource,
    setSourceEnabled,
    setAutoSyncInterval,
  };
}
