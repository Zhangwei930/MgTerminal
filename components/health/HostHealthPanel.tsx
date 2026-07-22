/**
 * Host Health Panel — user-triggered batch health snapshot across saved SSH
 * hosts: online/latency, auth validity, and CPU/mem/disk summary, with an
 * "unhealthy only" filter and run-script-on-selection.
 */
import {
  Activity,
  AlertTriangle,
  Check,
  KeyRound,
  Loader2,
  Play,
  RotateCw,
  ShieldQuestion,
  ShieldX,
  WifiOff,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { useHostHealthBackend } from "../../application/state/useHostHealthBackend";
import {
  buildHostHealthRequests,
  isHealthCheckableHost,
  partitionHostsByCredentialAvailability,
  isUnhealthyStatus,
  type HostHealthResult,
} from "../../domain/hostHealth";
import { isScriptSnippet } from "../../domain/snippetScript";
import type { Host, Identity, KnownHost, Snippet, SSHKey } from "../../types";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Dropdown, DropdownContent, DropdownTrigger } from "../ui/dropdown";
import { ScrollArea } from "../ui/scroll-area";
import { Switch } from "../ui/switch";

export interface HostHealthPanelProps {
  open: boolean;
  onClose: () => void;
  hosts: Host[];
  allHosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  knownHosts?: KnownHost[];
  snippets?: Snippet[];
  onRunSnippet?: (snippet: Snippet, targetHosts: Host[]) => void;
}

const STATUS_META: Record<string, { icon: React.ReactNode; className: string }> = {
  healthy: { icon: <Check size={13} />, className: "text-emerald-500" },
  degraded: { icon: <AlertTriangle size={13} />, className: "text-amber-500" },
  "auth-failed": { icon: <ShieldX size={13} />, className: "text-red-500" },
  unreachable: { icon: <WifiOff size={13} />, className: "text-red-500" },
  // Amber, not red: nothing is wrong with the host — this device cannot
  // decrypt the stored credentials.
  "credentials-locked": { icon: <KeyRound size={13} />, className: "text-amber-500" },
  // Amber as well: the host is reachable and the credentials are fine — the
  // host key simply has not been verified yet.
  "host-key-untrusted": { icon: <ShieldQuestion size={13} />, className: "text-amber-500" },
  error: { icon: <AlertTriangle size={13} />, className: "text-red-500" },
  running: {
    icon: <Loader2 size={13} className="animate-spin" />,
    className: "text-muted-foreground",
  },
  pending: { icon: <Activity size={13} />, className: "text-muted-foreground/50" },
};

export const HostHealthPanel: React.FC<HostHealthPanelProps> = ({
  open,
  onClose,
  hosts,
  allHosts,
  keys,
  identities,
  knownHosts = [],
  snippets = [],
  onRunSnippet,
}) => {
  const { t } = useI18n();
  const { runHealthCheck, cancelHealthCheck, setProgressListener } = useHostHealthBackend();
  const [results, setResults] = useState<Map<string, HostHealthResult | "running">>(
    () => new Map(),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [showUnhealthyOnly, setShowUnhealthyOnly] = useState(false);
  const [selectedHostIds, setSelectedHostIds] = useState<Set<string>>(() => new Set());
  const runIdRef = useRef<string | null>(null);

  const checkableHosts = useMemo(
    () => hosts.filter(isHealthCheckableHost),
    [hosts],
  );

  const startRun = useCallback(async () => {
    // Hosts whose credentials are still ciphertext are answered locally: the
    // probe would drop every credential and come back with a bare auth
    // failure, which reads as "wrong password" rather than "this device
    // cannot decrypt them".
    const { checkable, credentialsLocked } = partitionHostsByCredentialAvailability({
      hosts: checkableHosts,
      keys,
      identities,
    });
    const requests = buildHostHealthRequests({
      hosts: checkable,
      keys,
      identities,
      knownHosts,
      allHosts,
    });
    if (requests.length === 0 && credentialsLocked.length === 0) return;
    const runId = `health-${crypto.randomUUID()}`;
    runIdRef.current = runId;
    setResults(new Map(credentialsLocked.map((host) => [host.id, {
      hostId: host.id,
      status: "credentials-locked" as const,
      checkedAt: Date.now(),
    }])));
    setIsRunning(true);
    try {
      const response = await runHealthCheck({ runId, hosts: requests });
      if (runIdRef.current !== runId || !response) return;
      setResults((prev) => {
        const next = new Map(prev);
        for (const result of response.results) next.set(result.hostId, result);
        return next;
      });
    } finally {
      if (runIdRef.current === runId) setIsRunning(false);
    }
  }, [checkableHosts, keys, identities, knownHosts, allHosts, runHealthCheck]);

  useEffect(() => {
    if (!open) return;
    setProgressListener((event) => {
      if (event.runId !== runIdRef.current) return;
      setResults((prev) => {
        const next = new Map(prev);
        next.set(event.hostId, event.status === "done" && event.result ? event.result : "running");
        return next;
      });
    });
    void startRun();
    return () => {
      setProgressListener(null);
      const runId = runIdRef.current;
      runIdRef.current = null;
      if (runId) void cancelHealthCheck(runId);
    };
    // Restart only when the dialog is (re)opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows = useMemo(() => {
    const mapped = checkableHosts.map((host) => {
      const entry = results.get(host.id);
      const result = entry && entry !== "running" ? entry : undefined;
      const status = entry === "running" ? "running" : (result?.status ?? "pending");
      return { host, status, result };
    });
    if (!showUnhealthyOnly) return mapped;
    return mapped.filter(
      ({ status }) =>
        status !== "pending" &&
        status !== "running" &&
        isUnhealthyStatus(status as HostHealthResult["status"]),
    );
  }, [checkableHosts, results, showUnhealthyOnly]);

  const toggleSelected = useCallback((hostId: string) => {
    setSelectedHostIds((prev) => {
      const next = new Set(prev);
      if (next.has(hostId)) next.delete(hostId);
      else next.add(hostId);
      return next;
    });
  }, []);

  const selectedHosts = useMemo(
    () => checkableHosts.filter((host) => selectedHostIds.has(host.id)),
    [checkableHosts, selectedHostIds],
  );

  const runnableSnippets = useMemo(
    () => snippets.filter((snippet) => isScriptSnippet(snippet) || Boolean(snippet.command?.trim())),
    [snippets],
  );

  const describeRow = (status: string, result?: HostHealthResult): string => {
    if (status === "pending") return t("health.status.pending");
    if (status === "running") return t("health.status.running");
    const parts: string[] = [t(`health.status.${status}`)];
    if (result?.latencyMs !== undefined) parts.push(`${result.latencyMs} ms`);
    if (result?.loadAvg1 !== undefined) parts.push(`load ${result.loadAvg1}`);
    if (result?.memPercent !== undefined) parts.push(`mem ${result.memPercent}%`);
    if (result?.diskPercent !== undefined) parts.push(`disk ${result.diskPercent}%`);
    if (result?.error && isUnhealthyStatus(result.status)) parts.push(result.error);
    return parts.join(" · ");
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("health.title")}</DialogTitle>
          <DialogDescription>
            {t("health.subtitle", { count: checkableHosts.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showUnhealthyOnly} onCheckedChange={setShowUnhealthyOnly} />
            {t("health.filter.unhealthyOnly")}
          </label>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            disabled={isRunning || checkableHosts.length === 0}
            onClick={() => void startRun()}
          >
            <RotateCw size={13} className={cn(isRunning && "animate-spin")} />
            {t("health.recheck")}
          </Button>
        </div>

        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-1 pr-2" data-testid="health-rows">
            {rows.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {showUnhealthyOnly ? t("health.empty.allHealthy") : t("health.empty.noHosts")}
              </div>
            )}
            {rows.map(({ host, status, result }) => {
              const meta = STATUS_META[status] ?? STATUS_META.pending;
              return (
                <button
                  type="button"
                  key={host.id}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    selectedHostIds.has(host.id)
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/50 bg-secondary/30 hover:bg-secondary/60",
                  )}
                  onClick={() => toggleSelected(host.id)}
                >
                  <span className={cn("shrink-0", meta.className)}>{meta.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {host.label || host.hostname}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        status === "auth-failed" || status === "unreachable" || status === "error"
                          ? "text-red-500"
                          : status === "degraded"
                            ? "text-amber-500"
                            : "text-muted-foreground",
                      )}
                    >
                      {describeRow(status, result)}
                    </span>
                  </span>
                  {selectedHostIds.has(host.id) && (
                    <Check size={14} className="shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {t("health.selectedCount", { count: selectedHosts.length })}
          </span>
          <div className="flex items-center gap-2">
            {onRunSnippet && runnableSnippets.length > 0 && (
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2"
                    disabled={selectedHosts.length === 0}
                  >
                    <Play size={13} />
                    {t("health.runScript")}
                  </Button>
                </DropdownTrigger>
                <DropdownContent align="end" className="max-h-64 overflow-y-auto">
                  {runnableSnippets.map((snippet) => (
                    <button
                      type="button"
                      key={snippet.id}
                      className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary/80"
                      onClick={() => {
                        onRunSnippet(snippet, selectedHosts);
                        onClose();
                      }}
                    >
                      {snippet.label || snippet.command}
                    </button>
                  ))}
                </DropdownContent>
              </Dropdown>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HostHealthPanel;
