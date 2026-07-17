import React, { useCallback, useMemo, useState } from "react";
import { Database, FileJson, Globe, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useI18n } from "../../application/i18n/I18nProvider";
import {
  isHttpInventoryUrl,
  isJsonManagedSourceType,
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
    syncNow?: boolean;
  }) => Promise<{ source: ManagedSource; outcome?: HostDataSourceSyncOutcome }>;
  onSyncSource: (sourceId: string, options?: { force?: boolean }) => Promise<HostDataSourceSyncOutcome>;
  onRemoveSource: (sourceId: string, options?: { deleteHosts?: boolean }) => boolean;
};

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
  onRemoveSource,
}) => {
  const { t } = useI18n();
  const [showAddForm, setShowAddForm] = useState(false);
  const [sourceType, setSourceType] = useState<"json_file" | "json_http">("json_file");
  const [filePath, setFilePath] = useState("");
  const [groupName, setGroupName] = useState("Inventory");
  const [label, setLabel] = useState("");
  const [syncMode, setSyncMode] = useState<"merge" | "replace_group">("merge");
  const [submitting, setSubmitting] = useState(false);

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
  }, []);

  const handlePickFile = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (bridge?.selectFile) {
      const path = await bridge.selectFile(
        t("vault.dataSources.pickFileTitle"),
        undefined,
        [{ name: "JSON", extensions: ["json"] }],
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
  }, [filePath, groupName, label, onAddJsonSource, resetForm, sourceType, syncMode, t]);

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
                <Button size="sm" onClick={() => setShowAddForm(true)}>
                  <Plus size={14} className="mr-2" />
                  {t("vault.dataSources.add")}
                </Button>
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
                    const typeLabel =
                      source.type === "json_http"
                        ? t("vault.dataSources.type.http")
                        : t("vault.dataSources.type.file");
                    return (
                      <li
                        key={source.id}
                        className="rounded-xl border border-border/60 bg-background px-3 py-3 flex flex-col gap-2"
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
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || source.enabled === false}
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
                        : "/path/to/hosts.json"
                    }
                  />
                  {sourceType === "json_file" && (
                    <Button type="button" variant="outline" onClick={() => void handlePickFile()}>
                      {t("vault.dataSources.browse")}
                    </Button>
                  )}
                </div>
              </div>

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
