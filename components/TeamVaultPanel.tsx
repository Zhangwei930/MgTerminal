/**
 * Local-first team vault UI — full settings-grade panel (not a stub).
 * Metadata-only packages, roles, HMAC-signed audit.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileJson,
  KeyRound,
  LogOut,
  Package,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useI18n } from "../application/i18n/I18nProvider";
import {
  clearTeamVaultAudit,
  createLocalTeamVault,
  exportLocalTeamVaultPackage,
  getTeamVaultAuditExport,
  importTeamVaultPackageShare,
  leaveTeamVault,
  readTeamVaultAudit,
  readTeamVaultPolicy,
  updateLocalMemberRole,
} from "../application/state/teamVaultStore";
import {
  getLocalTeamVaultRole,
  teamVaultCan,
  type TeamVaultAuditEvent,
  type TeamVaultPolicy,
  type TeamVaultRole,
} from "../domain/teamVault";
import type { Host } from "../domain/models";
import type { HostInventoryShareDocument } from "../domain/hostDataSource";
import {
  STORAGE_KEY_DISPLAY_NAME,
  STORAGE_KEY_HOSTS,
} from "../infrastructure/config/storageKeys";
import { localStorageAdapter } from "@/infrastructure/persistence/localStorageAdapter";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { toast } from "./ui/toast";
import { cn } from "../lib/utils";

export type TeamVaultPanelProps = {
  hosts?: Host[];
  /**
   * Applies a package's inventory to the vault and reports how many hosts were
   * actually added. Required: without it an import silently succeeds in the UI
   * while the vault stays untouched.
   */
  onImportInventory: (inventory: HostInventoryShareDocument) => number;
};

type PanelTab = "overview" | "share" | "members" | "audit";

const ROLE_STYLES: Record<TeamVaultRole, string> = {
  owner: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  editor: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  viewer: "bg-muted text-muted-foreground border-border/60",
};

function RoleBadge({ role, label }: { role: TeamVaultRole; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        ROLE_STYLES[role],
      )}
    >
      {label}
    </span>
  );
}

function loadHostsFromStorage(): Host[] {
  const raw = localStorageAdapter.read<Host[]>(STORAGE_KEY_HOSTS);
  return Array.isArray(raw) ? raw : [];
}

function formatAuditTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export const TeamVaultPanel: React.FC<TeamVaultPanelProps> = ({
  hosts: hostsProp,
  onImportInventory,
}) => {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<TeamVaultPolicy | null>(() => readTeamVaultPolicy());
  const [tab, setTab] = useState<PanelTab>("overview");
  const [teamName, setTeamName] = useState("");
  const [displayName, setDisplayName] = useState(
    () => localStorageAdapter.readString(STORAGE_KEY_DISPLAY_NAME) || "",
  );
  const [shareInput, setShareInput] = useState("");
  const [lastShareString, setLastShareString] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState<{
    hostCount: number;
    memberCount: number;
  } | null>(null);
  const [auditEvents, setAuditEvents] = useState<TeamVaultAuditEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const hosts = hostsProp ?? loadHostsFromStorage();
  const role = useMemo(() => getLocalTeamVaultRole(policy), [policy]);
  const canShare = teamVaultCan(policy, "share_package");
  const canManage = teamVaultCan(policy, "manage_members");
  const canImport = teamVaultCan(policy, "import_inventory") || !policy;

  const refresh = useCallback(() => {
    setPolicy(readTeamVaultPolicy());
    setAuditEvents(readTeamVaultAudit());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (policy) setTab((prev) => (prev === "overview" ? "overview" : prev));
  }, [policy]);

  const tabs: { id: PanelTab; label: string; icon: React.ReactNode }[] = policy
    ? [
        { id: "overview", label: t("teamVault.tab.overview"), icon: <Shield size={14} /> },
        { id: "share", label: t("teamVault.tab.share"), icon: <Package size={14} /> },
        { id: "members", label: t("teamVault.tab.members"), icon: <Users size={14} /> },
        { id: "audit", label: t("teamVault.tab.audit"), icon: <ClipboardList size={14} /> },
      ]
    : [
        { id: "overview", label: t("teamVault.tab.setup"), icon: <Shield size={14} /> },
        { id: "share", label: t("teamVault.tab.join"), icon: <UserPlus size={14} /> },
      ];

  const handleCreate = useCallback(() => {
    if (!teamName.trim()) {
      toast.error(t("teamVault.error.teamNameRequired"));
      return;
    }
    if (!displayName.trim()) {
      toast.error(t("teamVault.error.displayNameRequired"));
      return;
    }
    setBusy(true);
    try {
      const next = createLocalTeamVault({
        teamName: teamName.trim(),
        ownerDisplayName: displayName.trim(),
      });
      localStorageAdapter.writeString(STORAGE_KEY_DISPLAY_NAME, displayName.trim());
      setPolicy(next);
      setTab("overview");
      refresh();
      toast.success(t("teamVault.created"));
    } finally {
      setBusy(false);
    }
  }, [displayName, refresh, t, teamName]);

  const handleExport = useCallback(async () => {
    setBusy(true);
    try {
      const result = exportLocalTeamVaultPackage(hosts);
      if (!result.ok) {
        toast.error(
          result.error === "forbidden" ? t("teamVault.forbidden") : t("teamVault.noTeam"),
        );
        return;
      }
      setLastShareString(result.shareString);
      setExportPreview({
        hostCount: result.package.inventory.hosts.length,
        memberCount: result.package.members.length,
      });
      try {
        await navigator.clipboard.writeText(result.shareString);
        toast.success(t("teamVault.exported"));
      } catch {
        toast.info(t("teamVault.exportedClipboardFailed"));
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }, [hosts, refresh, t]);

  const handleCopyShare = useCallback(async () => {
    if (!lastShareString) return;
    try {
      await navigator.clipboard.writeText(lastShareString);
      toast.success(t("teamVault.shareCopied"));
    } catch {
      toast.error(t("teamVault.copyFailed"));
    }
  }, [lastShareString, t]);

  const handleDownloadJson = useCallback(() => {
    const result = exportLocalTeamVaultPackage(hosts);
    if (!result.ok) {
      toast.error(t("teamVault.noTeam"));
      return;
    }
    const blob = new Blob([result.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `magies-team-${result.package.teamId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("teamVault.jsonDownloaded"));
  }, [hosts, t]);

  const handleImport = useCallback(() => {
    if (!shareInput.trim()) {
      toast.error(t("teamVault.error.packageEmpty"));
      return;
    }
    if (!displayName.trim()) {
      toast.error(t("teamVault.error.displayNameRequired"));
      return;
    }
    setBusy(true);
    try {
      const result = importTeamVaultPackageShare(shareInput, displayName.trim());
      if (!result.ok) {
        toast.error(t("teamVault.importFailed", { error: result.error }));
        return;
      }
      localStorageAdapter.writeString(STORAGE_KEY_DISPLAY_NAME, displayName.trim());
      setPolicy(result.policy);
      setShareInput("");
      setTab("overview");
      refresh();
      // Report what actually landed in the vault, not what the package claimed.
      const added = onImportInventory(result.package.inventory);
      toast.success(t("teamVault.imported", { count: added }));
    } finally {
      setBusy(false);
    }
  }, [displayName, onImportInventory, refresh, shareInput, t]);

  const handleLeave = useCallback(() => {
    if (!window.confirm(t("teamVault.leaveConfirm"))) return;
    leaveTeamVault();
    setPolicy(null);
    setLastShareString(null);
    setExportPreview(null);
    setTab("overview");
    refresh();
    toast.success(t("teamVault.left"));
  }, [refresh, t]);

  const handleClearAudit = useCallback(() => {
    if (!window.confirm(t("teamVault.audit.clearConfirm"))) return;
    clearTeamVaultAudit();
    setAuditEvents([]);
    toast.success(t("teamVault.auditCleared"));
  }, [t]);

  const handleCopyAudit = useCallback(async (format: "text" | "ndjson") => {
    const text = getTeamVaultAuditExport(format);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(
        format === "ndjson" ? t("teamVault.auditCopiedNdjson") : t("teamVault.auditCopied"),
      );
    } catch {
      toast.error(t("teamVault.copyFailed"));
    }
  }, [t]);

  const roleLabel = (r: TeamVaultRole) => t(`teamVault.role.${r}`);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
          <Users size={18} className="text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{t("teamVault.title")}</h3>
            {policy && role && <RoleBadge role={role} label={roleLabel(role)} />}
            {policy?.auditKeyHex && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <KeyRound size={11} />
                {t("teamVault.signedAudit")}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("teamVault.desc")}
          </p>
        </div>
      </div>

      {/* Security callout */}
      <div className="flex gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("teamVault.securityTitle")}</span>
          {" — "}
          {t("teamVault.securityBody")}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/50 bg-muted/20 p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors min-w-[5.5rem]",
              tab === item.id
                ? "bg-background text-foreground shadow-sm border border-border/60"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* ——— No team: setup ——— */}
      {!policy && tab === "overview" && (
        <div className="space-y-4 rounded-lg border border-border/60 bg-card/50 p-4">
          <div>
            <p className="text-sm font-medium">{t("teamVault.createTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("teamVault.createHint")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("teamVault.teamName")}
              </span>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder={t("teamVault.teamNamePlaceholder")}
                className="h-9"
              />
            </label>
            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("teamVault.displayName")}
              </span>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("teamVault.displayNamePlaceholder")}
                className="h-9"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy} onClick={handleCreate} className="gap-1.5">
              <Shield size={14} />
              {t("teamVault.create")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setTab("share")}
              className="gap-1.5"
            >
              <UserPlus size={14} />
              {t("teamVault.goJoin")}
            </Button>
          </div>
          <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
            {t("teamVault.createFootnote")}
          </div>
        </div>
      )}

      {/* ——— No team: join ——— */}
      {!policy && tab === "share" && (
        <div className="space-y-4 rounded-lg border border-border/60 bg-card/50 p-4">
          <div>
            <p className="text-sm font-medium">{t("teamVault.joinTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("teamVault.joinHint")}</p>
          </div>
          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-muted-foreground">
              {t("teamVault.displayName")}
            </span>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("teamVault.displayNamePlaceholder")}
              className="h-9"
            />
          </label>
          <label className="space-y-1.5 block">
            <span className="text-xs font-medium text-muted-foreground">
              {t("teamVault.packageLabel")}
            </span>
            <Textarea
              value={shareInput}
              onChange={(e) => setShareInput(e.target.value)}
              placeholder={t("teamVault.packagePlaceholder")}
              className="min-h-[100px] font-mono text-xs"
            />
          </label>
          <Button size="sm" disabled={busy} onClick={handleImport} className="gap-1.5">
            <Download size={14} />
            {t("teamVault.join")}
          </Button>
        </div>
      )}

      {/* ——— With team: overview ——— */}
      {policy && tab === "overview" && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-3">
              <p className="text-[11px] text-muted-foreground">{t("teamVault.stat.team")}</p>
              <p className="mt-1 truncate text-sm font-semibold">{policy.teamName}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {policy.teamId.slice(0, 16)}…
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-3">
              <p className="text-[11px] text-muted-foreground">{t("teamVault.stat.members")}</p>
              <p className="mt-1 text-sm font-semibold">{policy.members.length}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("teamVault.stat.yourRole")}: {role ? roleLabel(role) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/50 px-3 py-3">
              <p className="text-[11px] text-muted-foreground">{t("teamVault.stat.localHosts")}</p>
              <p className="mt-1 text-sm font-semibold">{hosts.length}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t("teamVault.stat.exportable")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canShare && (
              <Button size="sm" disabled={busy} onClick={() => void handleExport()} className="gap-1.5">
                <Copy size={14} />
                {t("teamVault.export")}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setTab("share")} className="gap-1.5">
              <Package size={14} />
              {t("teamVault.tab.share")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setTab("audit"); setAuditEvents(readTeamVaultAudit()); }} className="gap-1.5">
              <ClipboardList size={14} />
              {t("teamVault.tab.audit")}
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={handleLeave}>
              <LogOut size={14} />
              {t("teamVault.leave")}
            </Button>
          </div>
        </div>
      )}

      {/* ——— With team: share / import ——— */}
      {policy && tab === "share" && (
        <div className="space-y-4">
          {canShare && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-4">
              <div className="flex items-start gap-2">
                <Package size={16} className="mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{t("teamVault.exportTitle")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("teamVault.exportHint")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => void handleExport()} className="gap-1.5">
                  <Copy size={14} />
                  {t("teamVault.exportCopy")}
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={handleDownloadJson} className="gap-1.5">
                  <FileJson size={14} />
                  {t("teamVault.exportJson")}
                </Button>
              </div>
              {(lastShareString || exportPreview) && (
                <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
                  {exportPreview && (
                    <p className="text-xs text-muted-foreground">
                      {t("teamVault.exportSummary", {
                        hosts: exportPreview.hostCount,
                        members: exportPreview.memberCount,
                      })}
                    </p>
                  )}
                  {lastShareString && (
                    <>
                      <code className="block max-h-24 overflow-auto break-all rounded bg-background/80 p-2 font-mono text-[10px] leading-relaxed">
                        {lastShareString}
                      </code>
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void handleCopyShare()}>
                        <Copy size={12} />
                        {t("teamVault.copyAgain")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-4">
            <div className="flex items-start gap-2">
              <Download size={16} className="mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{t("teamVault.importTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("teamVault.importHint")}</p>
              </div>
            </div>
            {!canImport && (
              <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {t("teamVault.importForbidden")}
              </div>
            )}
            <label className="space-y-1.5 block">
              <span className="text-xs font-medium text-muted-foreground">
                {t("teamVault.packageLabel")}
              </span>
              <Textarea
                value={shareInput}
                onChange={(e) => setShareInput(e.target.value)}
                placeholder={t("teamVault.packagePlaceholder")}
                className="min-h-[88px] font-mono text-xs"
                disabled={!canImport}
              />
            </label>
            <Button size="sm" disabled={busy || !canImport} onClick={handleImport} className="gap-1.5">
              <Download size={14} />
              {t("teamVault.importUpdate")}
            </Button>
          </div>
        </div>
      )}

      {/* ——— Members ——— */}
      {policy && tab === "members" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t("teamVault.roster")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("teamVault.rosterHint")}</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {policy.members.length}
            </span>
          </div>
          <div className="divide-y divide-border/50 rounded-lg border border-border/50 overflow-hidden">
            {policy.members.map((m) => {
              const isYou = m.memberId === policy.localMemberId;
              return (
                <div
                  key={m.memberId}
                  className="flex flex-wrap items-center gap-3 bg-background/40 px-3 py-2.5"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {(m.displayName || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{m.displayName}</span>
                      {isYou && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {t("teamVault.you")}
                        </span>
                      )}
                    </div>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {m.memberId}
                    </p>
                  </div>
                  {canManage && !isYou ? (
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={m.role}
                      onChange={(e) => {
                        const result = updateLocalMemberRole(
                          m.memberId,
                          e.target.value as TeamVaultRole,
                        );
                        if (result.ok) {
                          setPolicy(result.policy);
                          toast.success(t("teamVault.roleUpdated"));
                        } else {
                          toast.error(t("teamVault.forbidden"));
                        }
                      }}
                    >
                      <option value="owner">{roleLabel("owner")}</option>
                      <option value="editor">{roleLabel("editor")}</option>
                      <option value="viewer">{roleLabel("viewer")}</option>
                    </select>
                  ) : (
                    <RoleBadge role={m.role} label={roleLabel(m.role)} />
                  )}
                </div>
              );
            })}
          </div>
          {!canManage && (
            <p className="text-[11px] text-muted-foreground">{t("teamVault.rosterReadOnly")}</p>
          )}
        </div>
      )}

      {/* ——— Audit ——— */}
      {policy && tab === "audit" && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t("teamVault.auditTitle")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("teamVault.auditHint")}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => setAuditEvents(readTeamVaultAudit())}
              >
                <RefreshCw size={12} />
                {t("teamVault.audit.refresh")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => void handleCopyAudit("text")}
              >
                <Copy size={12} />
                {t("teamVault.audit.copyText")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => void handleCopyAudit("ndjson")}
              >
                <FileJson size={12} />
                {t("teamVault.audit.copyNdjson")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                onClick={handleClearAudit}
              >
                <Trash2 size={12} />
                {t("teamVault.audit.clear")}
              </Button>
            </div>
          </div>

          {auditEvents.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">
              {t("teamVault.auditEmpty")}
            </div>
          ) : (
            <div className="max-h-64 overflow-auto rounded-lg border border-border/50">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2.5 py-2 font-medium">{t("teamVault.audit.col.time")}</th>
                    <th className="px-2.5 py-2 font-medium">{t("teamVault.audit.col.type")}</th>
                    <th className="px-2.5 py-2 font-medium">{t("teamVault.audit.col.detail")}</th>
                    <th className="px-2.5 py-2 font-medium">{t("teamVault.audit.col.sig")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {[...auditEvents].reverse().map((e, i) => (
                    <tr key={`${e.ts}-${e.type}-${i}`} className="bg-background/30">
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-muted-foreground">
                        {formatAuditTime(e.ts)}
                      </td>
                      <td className="px-2.5 py-1.5 font-medium">
                        {(() => {
                          const key = `teamVault.audit.type.${e.type}`;
                          const label = t(key);
                          return label === key ? e.type : label;
                        })()}
                      </td>
                      <td className="max-w-[12rem] truncate px-2.5 py-1.5 text-muted-foreground">
                        {e.detail || "—"}
                      </td>
                      <td className="px-2.5 py-1.5">
                        {e.sig ? (
                          <span className="text-emerald-600 dark:text-emerald-400" title={e.sig}>
                            ✓
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TeamVaultPanel;
