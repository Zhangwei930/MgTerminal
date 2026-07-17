import React, { useCallback, useMemo, useState } from "react";
import { ClipboardPaste, Database, FileJson, Globe, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { looksLikeAnsibleInventoryIni } from "../../domain/ansibleInventory";
import {
  HOST_DATA_SOURCE_AUTO_SYNC_PRESETS_MS,
  isHttpInventoryUrl,
  isJsonManagedSourceType,
  normalizeAutoSyncIntervalMs,
  parseInventoryDocument,
} from "../../domain/hostDataSource";
import type { ManagedSource } from "../../domain/models";
import { magiesTerminalBridge } from "@/infrastructure/services/magiesTerminalBridge";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { toast } from "../ui/toast";
import type { HostDataSourceSyncOutcome } from "../../application/state/useHostDataSourceSync";

export type HostDataSourcesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managedSources: ManagedSource[];
  syncingSourceId: string | null;
  onAddJsonSource: (input: {
    type: "json_file" | "json_http";
    filePath: string;
    groupName: string;
    label?: string;
    syncMode?: "merge" | "replace_group";
    autoSyncIntervalMs?: number;
    httpAuthHeaderName?: string;
    httpAuthHeaderValue?: string;
    syncNow?: boolean;
  }) => Promise<{ source: ManagedSource; outcome?: HostDataSourceSyncOutcome }>;
  onSyncSource: (sourceId: string, options?: { force?: boolean }) => Promise<HostDataSourceSyncOutcome>;
  onSyncAllSources?: (options?: { force?: boolean }) => Promise<HostDataSourceSyncOutcome[]>;
  onRemoveSource: (sourceId: string, options?: { deleteHosts?: boolean }) => boolean;
  onSetAutoSyncInterval: (sourceId: string, autoSyncIntervalMs: number | undefined) => void;
  onSetSourceEnabled: (sourceId: string, enabled: boolean) => void;
  onSetHttpAuthHeader?: (
    sourceId: string,
    httpAuthHeaderName: string | undefined,
    httpAuthHeaderValue: string | undefined,
  ) => void;
};

function formatAutoSyncLabel(
  t: (key: string, values?: Record<string, unknown>) => string,
  intervalMs: number | undefined,
): string {
  const ms = normalizeAutoSyncIntervalMs(intervalMs);
  if (!ms) return t("vault.dataSources.autoSync.off");
  if (ms % 3_600_000 === 0) {
    return t("vault.dataSources.autoSync.hours", { count: ms / 3_600_000 });
  }
  return t("vault.dataSources.autoSync.minutes", { count: Math.round(ms / 60_000) });
}

function formatSyncOutcome(
  t: (key: string, values?: Record<string, unknown>) => string,
  outcome: HostDataSourceSyncOutcome,
): { title: string; message: string; kind: "success" | "warning" | "error" } {
  if (!outcome.success) {
    return {
      kind: "error",
      title: t("vault.dataSources.toast.syncFailedTitle"),
      message: outcome.error || t("common.unknownError"),
    };
  }
  if (outcome.unchanged) {
    return {
      kind: "success",
      title: t("vault.dataSources.toast.syncCompletedTitle"),
      message: t("vault.dataSources.toast.unchanged"),
    };
  }
  const stats = outcome.stats;
  return {
    kind: "success",
    title: t("vault.dataSources.toast.syncCompletedTitle"),
    message: t("vault.dataSources.toast.syncSummary", {
      added: stats?.added ?? 0,
      updated: stats?.updated ?? 0,
      removed: stats?.removed ?? 0,
      skipped: stats?.skipped ?? 0,
    }),
  };
}

export const HostDataSourcesDialog: React.FC<HostDataSourcesDialogProps> = ({
  open,
  onOpenChange,
  managedSources,
  syncingSourceId,
  onAddJsonSource,
  onSyncSource,
  onSyncAllSources,
  onRemoveSource,
  onSetAutoSyncInterval,
  onSetSourceEnabled,
  onSetHttpAuthHeader,
}) => {
  const { t } = useI18n();
  const [showAddForm, setShowAddForm] = useState(false);
  const [sourceType, setSourceType] = useState<"json_file" | "json_http">("json_file");
  const [filePath, setFilePath] = useState("");
  const [groupName, setGroupName] = useState("Inventory");
  const [label, setLabel] = useState("");
  const [syncMode, setSyncMode] = useState<"merge" | "replace_group">("merge");
  const [autoSyncIntervalMs, setAutoSyncIntervalMs] = useState(0);
  const [httpAuthHeaderName, setHttpAuthHeaderName] = useState("Authorization");
  const [httpAuthHeaderValue, setHttpAuthHeaderValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [pasting, setPasting] = useState(false);

  const jsonSources = useMemo(
    () => managedSources.filter((source) => isJsonManagedSourceType(source.type)),
    [managedSources],
  );

  const sshConfigSources = useMemo(
    () => managedSources.filter((source) => source.type === "ssh_config"),
    [managedSources],
  );

  const resetForm = useCallback(() => {
    setSourceType("json_file");
    setFilePath("");
    setGroupName("Inventory");
    setLabel("");
    setSyncMode("merge");
    setAutoSyncIntervalMs(0);
    setHttpAuthHeaderName("Authorization");
    setHttpAuthHeaderValue("");
  }, []);

  const handlePickFile = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (bridge?.selectFile) {
      const path = await bridge.selectFile(
        t("vault.dataSources.pickFileTitle"),
        undefined,
        [
          { name: "Inventory", extensions: ["json", "ini", "yml", "yaml", "cfg", "inv", "inventory", "hosts"] },
          { name: "JSON", extensions: ["json"] },
          { name: "Ansible", extensions: ["ini", "yml", "yaml", "cfg", "inv", "inventory", "hosts"] },
        ],
      );
      if (path) {
        setFilePath(path);
        setSourceType("json_file");
      }
      return;
    }
    // Fallback: browser file input cannot give a stable path in all environments.
    toast.error(t("vault.dataSources.toast.pickFileUnavailable"));
  }, [t]);

  const handleAdd = useCallback(async () => {
    const path = filePath.trim();
    if (!path) {
      toast.error(t("vault.dataSources.toast.pathRequired"));
      return;
    }
    if (sourceType === "json_http" && !isHttpInventoryUrl(path)) {
      toast.error(t("vault.dataSources.toast.invalidUrl"));
      return;
    }
    setSubmitting(true);
    try {
      const { outcome } = await onAddJsonSource({
        type: sourceType,
        filePath: path,
        groupName: groupName.trim() || "Inventory",
        label: label.trim() || undefined,
        syncMode,
        autoSyncIntervalMs: autoSyncIntervalMs || undefined,
        httpAuthHeaderName: sourceType === "json_http" ? httpAuthHeaderName : undefined,
        httpAuthHeaderValue: sourceType === "json_http" ? httpAuthHeaderValue : undefined,
        syncNow: true,
      });
      if (outcome && !outcome.success) {
        toast.error(
          outcome.error || t("common.unknownError"),
          t("vault.dataSources.toast.syncFailedTitle"),
        );
      } else if (outcome) {
        const formatted = formatSyncOutcome(t, outcome);
        toast.success(formatted.message, formatted.title);
      } else {
        toast.success(t("vault.dataSources.toast.added"), t("vault.dataSources.toast.addedTitle"));
      }
      resetForm();
      setShowAddForm(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.unknownError");
      toast.error(message, t("vault.dataSources.toast.addFailedTitle"));
    } finally {
      setSubmitting(false);
    }
  }, [
    autoSyncIntervalMs,
    filePath,
    groupName,
    httpAuthHeaderName,
    httpAuthHeaderValue,
    label,
    onAddJsonSource,
    resetForm,
    sourceType,
    syncMode,
    t,
  ]);

  const handleSync = useCallback(
    async (sourceId: string) => {
      const outcome = await onSyncSource(sourceId, { force: true });
      const formatted = formatSyncOutcome(t, outcome);
      if (formatted.kind === "error") {
        toast.error(formatted.message, formatted.title);
      } else {
        toast.success(formatted.message, formatted.title);
      }
    },
    [onSyncSource, t],
  );

  const handlePasteInventory = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.writeLocalFile || !bridge?.getTempDirPath) {
      toast.error(t("vault.dataSources.toast.pasteUnavailable"));
      return;
    }
    setPasting(true);
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast.error(t("vault.dataSources.toast.pasteEmpty"));
        return;
      }
      // Validate before writing so we fail fast with a clear message.
      parseInventoryDocument(text);

      const tempDir = await bridge.getTempDirPath();
      if (!tempDir) {
        toast.error(t("vault.dataSources.toast.pasteUnavailable"));
        return;
      }
      const ext = looksLikeAnsibleInventoryIni(text) && !text.trimStart().startsWith("{")
        ? "ini"
        : "json";
      const stamp = Date.now().toString(36);
      const sep = tempDir.includes("\\") && !tempDir.includes("/") ? "\\" : "/";
      const base = tempDir.endsWith("/") || tempDir.endsWith("\\")
        ? tempDir.slice(0, -1)
        : tempDir;
      const filePath = `${base}${sep}inventory-paste-${stamp}.${ext}`;
      const bytes = new TextEncoder().encode(text);
      await bridge.writeLocalFile(
        filePath,
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );

      const { outcome } = await onAddJsonSource({
        type: "json_file",
        filePath,
        groupName: "Clipboard",
        label: t("vault.dataSources.pasteLabel"),
        syncMode: "merge",
        syncNow: true,
      });
      if (outcome && !outcome.success) {
        toast.error(
          outcome.error || t("common.unknownError"),
          t("vault.dataSources.toast.syncFailedTitle"),
        );
      } else if (outcome) {
        const formatted = formatSyncOutcome(t, outcome);
        toast.success(formatted.message, t("vault.dataSources.toast.pasteTitle"));
      } else {
        toast.success(t("vault.dataSources.toast.pasteAdded"), t("vault.dataSources.toast.pasteTitle"));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.unknownError");
      toast.error(message, t("vault.dataSources.toast.pasteFailedTitle"));
    } finally {
      setPasting(false);
    }
  }, [onAddJsonSource, t]);

  const handleSyncAll = useCallback(async () => {
    if (!onSyncAllSources) return;
    setSyncingAll(true);
    try {
      const outcomes = await onSyncAllSources({ force: true });
      const failed = outcomes.filter((o) => !o.success);
      const unchanged = outcomes.filter((o) => o.success && o.unchanged).length;
      const ok = outcomes.filter((o) => o.success && !o.unchanged).length;
      if (failed.length > 0) {
        toast.error(
          t("vault.dataSources.toast.syncAllPartial", {
            ok: ok + unchanged,
            failed: failed.length,
            error: failed[0]?.error || t("common.unknownError"),
          }),
          t("vault.dataSources.toast.syncFailedTitle"),
        );
      } else {
        toast.success(
          t("vault.dataSources.toast.syncAllSummary", {
            count: outcomes.length,
            ok,
            unchanged,
          }),
          t("vault.dataSources.toast.syncCompletedTitle"),
        );
      }
    } finally {
      setSyncingAll(false);
    }
  }, [onSyncAllSources, t]);

  const handleRemove = useCallback(
    (sourceId: string) => {
      const ok = onRemoveSource(sourceId, { deleteHosts: false });
      if (ok) {
        toast.success(t("vault.dataSources.toast.removed"), t("vault.dataSources.toast.removedTitle"));
      }
    },
    [onRemoveSource, t],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setShowAddForm(false);
        resetForm();
      }
      onOpenChange(next);
    },
    [onOpenChange, resetForm],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center">
            <Database className="h-7 w-7 text-muted-foreground" />
          </div>
          <DialogTitle className="text-xl">{t("vault.dataSources.title")}</DialogTitle>
          <DialogDescription className="mx-auto max-w-xl">
            {t("vault.dataSources.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!showAddForm ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  {t("vault.dataSources.count", { count: jsonSources.length })}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pasting || submitting || Boolean(syncingSourceId)}
                    onClick={() => void handlePasteInventory()}
                  >
                    {pasting ? (
                      <Loader2 size={14} className="mr-2 animate-spin" />
                    ) : (
                      <ClipboardPaste size={14} className="mr-2" />
                    )}
                    {t("vault.dataSources.paste")}
                  </Button>
                  {jsonSources.length > 0 && onSyncAllSources && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={syncingAll || Boolean(syncingSourceId)}
                      onClick={() => void handleSyncAll()}
                    >
                      {syncingAll || syncingSourceId ? (
                        <Loader2 size={14} className="mr-2 animate-spin" />
                      ) : (
                        <RefreshCw size={14} className="mr-2" />
                      )}
                      {t("vault.dataSources.syncAll")}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setShowAddForm(true)}>
                    <Plus size={14} className="mr-2" />
                    {t("vault.dataSources.add")}
                  </Button>
                </div>
              </div>

              {jsonSources.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("vault.dataSources.empty")}
                </div>
              ) : (
                <ul className="space-y-2 max-h-[320px] overflow-y-auto">
                  {jsonSources.map((source) => {
                    const busy = syncingSourceId === source.id;
                    const title = source.label || source.groupName;
                    const enabled = source.enabled !== false;
                    const typeLabel =
                      source.type === "json_http"
                        ? t("vault.dataSources.type.http")
                        : t("vault.dataSources.type.file");
                    return (
                      <li
                        key={source.id}
                        className={cn(
                          "rounded-xl border border-border/60 bg-background px-3 py-3 flex flex-col gap-2",
                          !enabled && "opacity-70",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {source.type === "json_http" ? (
                                <Globe size={14} className="shrink-0 text-muted-foreground" />
                              ) : (
                                <FileJson size={14} className="shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm truncate">{title}</span>
                              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {typeLabel}
                              </span>
                              {!enabled && (
                                <span className="text-[10px] rounded-md border border-border/60 px-1.5 py-0.5 text-muted-foreground">
                                  {t("vault.dataSources.disabled")}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground break-all">
                              {source.filePath}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t("vault.dataSources.group")}: {source.groupName}
                              {source.lastSyncedAt
                                ? ` · ${t("vault.dataSources.lastSynced", {
                                    time: new Date(source.lastSyncedAt).toLocaleString(),
                                  })}`
                                : ` · ${t("vault.dataSources.neverSynced")}`}
                              {` · ${t("vault.dataSources.autoSync.label")}: ${formatAutoSyncLabel(t, source.autoSyncIntervalMs)}`}
                            </div>
                            {source.lastSyncStatus && (
                              <div
                                className={cn(
                                  "mt-1 text-[11px]",
                                  source.lastSyncStatus === "error"
                                    ? "text-destructive"
                                    : "text-muted-foreground",
                                )}
                              >
                                {source.lastSyncStatus === "ok" && t("vault.dataSources.status.ok")}
                                {source.lastSyncStatus === "unchanged" && t("vault.dataSources.status.unchanged")}
                                {source.lastSyncStatus === "error" && (
                                  <>
                                    {t("vault.dataSources.status.error")}
                                    {source.lastSyncError
                                      ? `: ${source.lastSyncError}`
                                      : ""}
                                  </>
                                )}
                              </div>
                            )}
                            {source.type === "json_http" && onSetHttpAuthHeader && (
                              <div className="mt-2 space-y-1 rounded-lg border border-border/40 p-2">
                                <div className="text-[10px] font-medium text-muted-foreground">
                                  {t("vault.dataSources.field.httpAuth")}
                                  {source.httpAuthHeaderValue
                                    ? ` · ${source.httpAuthHeaderName || "Authorization"}`
                                    : ` · ${t("vault.dataSources.httpAuth.none")}`}
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <select
                                    className="flex h-8 w-full rounded-md border border-input bg-background px-1.5 text-[11px]"
                                    value={source.httpAuthHeaderName || "Authorization"}
                                    onChange={(e) =>
                                      onSetHttpAuthHeader(
                                        source.id,
                                        e.target.value,
                                        source.httpAuthHeaderValue,
                                      )
                                    }
                                  >
                                    <option value="Authorization">Authorization</option>
                                    <option value="X-Api-Key">X-Api-Key</option>
                                    <option value="X-Auth-Token">X-Auth-Token</option>
                                    <option value="X-Access-Token">X-Access-Token</option>
                                  </select>
                                  <Input
                                    className="h-8 text-[11px]"
                                    type="password"
                                    autoComplete="off"
                                    placeholder="Bearer …"
                                    defaultValue={source.httpAuthHeaderValue || ""}
                                    key={`${source.id}-${source.httpAuthHeaderValue || ""}`}
                                    onBlur={(e) =>
                                      onSetHttpAuthHeader(
                                        source.id,
                                        source.httpAuthHeaderName || "Authorization",
                                        e.target.value,
                                      )
                                    }
                                  />
                                </div>
                              </div>
                            )}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {HOST_DATA_SOURCE_AUTO_SYNC_PRESETS_MS.map((preset) => {
                                const current = normalizeAutoSyncIntervalMs(source.autoSyncIntervalMs) || 0;
                                const active = current === preset;
                                return (
                                  <button
                                    key={preset}
                                    type="button"
                                    className={cn(
                                      "rounded-md border px-1.5 py-0.5 text-[10px] transition-colors",
                                      active
                                        ? "border-primary/60 bg-primary/10 text-foreground"
                                        : "border-border/50 text-muted-foreground hover:bg-muted/40",
                                    )}
                                    onClick={() =>
                                      onSetAutoSyncInterval(
                                        source.id,
                                        preset === 0 ? undefined : preset,
                                      )
                                    }
                                  >
                                    {formatAutoSyncLabel(t, preset || undefined)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-muted-foreground">
                                {enabled
                                  ? t("vault.dataSources.enabled")
                                  : t("vault.dataSources.disabled")}
                              </span>
                              <Switch
                                checked={enabled}
                                className="h-5 w-9"
                                disabled={busy}
                                onCheckedChange={(checked) => {
                                  onSetSourceEnabled(source.id, checked);
                                  toast.success(
                                    checked
                                      ? t("vault.dataSources.toast.enabled")
                                      : t("vault.dataSources.toast.disabled"),
                                    t("vault.dataSources.toast.enabledTitle"),
                                  );
                                }}
                                aria-label={t("vault.dataSources.enabled")}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy || !enabled}
                                onClick={() => void handleSync(source.id)}
                              >
                                {busy ? (
                                  <Loader2 size={14} className="mr-1 animate-spin" />
                                ) : (
                                  <RefreshCw size={14} className="mr-1" />
                                )}
                                {t("vault.dataSources.sync")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={busy}
                                onClick={() => handleRemove(source.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {sshConfigSources.length > 0 && (
                <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  {t("vault.dataSources.sshConfigNote", { count: sshConfigSources.length })}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-colors",
                    sourceType === "json_file"
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/60 hover:bg-muted/30",
                  )}
                  onClick={() => setSourceType("json_file")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileJson size={16} />
                    {t("vault.dataSources.type.file")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("vault.dataSources.type.fileDesc")}
                  </div>
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-colors",
                    sourceType === "json_http"
                      ? "border-primary/60 bg-primary/5"
                      : "border-border/60 hover:bg-muted/30",
                  )}
                  onClick={() => setSourceType("json_http")}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Globe size={16} />
                    {t("vault.dataSources.type.http")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("vault.dataSources.type.httpDesc")}
                  </div>
                </button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ds-path">
                  {sourceType === "json_http"
                    ? t("vault.dataSources.field.url")
                    : t("vault.dataSources.field.path")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="ds-path"
                    value={filePath}
                    onChange={(e) => setFilePath(e.target.value)}
                    placeholder={
                      sourceType === "json_http"
                        ? "https://cmdb.example.com/hosts.json"
                        : "/path/to/hosts.json, inventory.ini, or inventory.yml"
                    }
                  />
                  {sourceType === "json_file" && (
                    <Button type="button" variant="outline" onClick={() => void handlePickFile()}>
                      {t("vault.dataSources.browse")}
                    </Button>
                  )}
                </div>
              </div>

              {sourceType === "json_http" && (
                <div className="space-y-2 rounded-xl border border-border/50 bg-muted/10 p-3">
                  <Label>{t("vault.dataSources.field.httpAuth")}</Label>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t("vault.dataSources.field.httpAuthHint")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="ds-auth-name" className="text-xs text-muted-foreground">
                        {t("vault.dataSources.field.httpAuthName")}
                      </Label>
                      <select
                        id="ds-auth-name"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={httpAuthHeaderName}
                        onChange={(e) => setHttpAuthHeaderName(e.target.value)}
                      >
                        <option value="Authorization">Authorization</option>
                        <option value="X-Api-Key">X-Api-Key</option>
                        <option value="X-Auth-Token">X-Auth-Token</option>
                        <option value="X-Access-Token">X-Access-Token</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ds-auth-value" className="text-xs text-muted-foreground">
                        {t("vault.dataSources.field.httpAuthValue")}
                      </Label>
                      <Input
                        id="ds-auth-value"
                        type="password"
                        autoComplete="off"
                        value={httpAuthHeaderValue}
                        onChange={(e) => setHttpAuthHeaderValue(e.target.value)}
                        placeholder="Bearer …"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ds-group">{t("vault.dataSources.field.group")}</Label>
                  <Input
                    id="ds-group"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Inventory"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ds-label">{t("vault.dataSources.field.label")}</Label>
                  <Input
                    id="ds-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t("vault.dataSources.field.labelPlaceholder")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("vault.dataSources.field.syncMode")}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm",
                      syncMode === "merge"
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/60 hover:bg-muted/30",
                    )}
                    onClick={() => setSyncMode("merge")}
                  >
                    {t("vault.dataSources.syncMode.merge")}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm",
                      syncMode === "replace_group"
                        ? "border-primary/60 bg-primary/5"
                        : "border-border/60 hover:bg-muted/30",
                    )}
                    onClick={() => setSyncMode("replace_group")}
                  >
                    {t("vault.dataSources.syncMode.replace")}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("vault.dataSources.field.autoSync")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {HOST_DATA_SOURCE_AUTO_SYNC_PRESETS_MS.map((preset) => {
                    const active = autoSyncIntervalMs === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={cn(
                          "rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                          active
                            ? "border-primary/60 bg-primary/5"
                            : "border-border/60 hover:bg-muted/30",
                        )}
                        onClick={() => setAutoSyncIntervalMs(preset)}
                      >
                        {formatAutoSyncLabel(t, preset || undefined)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("vault.dataSources.autoSync.hint")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("vault.dataSources.secretsNote")}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={submitting}
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                >
                  {t("common.cancel")}
                </Button>
                <Button type="button" disabled={submitting} onClick={() => void handleAdd()}>
                  {submitting && <Loader2 size={14} className="mr-2 animate-spin" />}
                  {t("vault.dataSources.addAndSync")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
