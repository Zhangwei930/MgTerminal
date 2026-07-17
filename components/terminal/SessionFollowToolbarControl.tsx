import { ClipboardList, Copy, Eye, Hand, Network, Users } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import type { SessionFollowAuditEvent, SessionFollowPublicState } from "../../domain/sessionFollow";
import {
  exportFollowAuditNdjson,
  exportFollowAuditText,
  formatFollowAuditLine,
} from "../../domain/sessionFollow";
import { magiesTerminalBridge } from "@/infrastructure/services/magiesTerminalBridge";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { toast } from "../ui/toast";

export type SessionFollowToolbarControlProps = {
  sessionId: string;
  hostLabel?: string;
  status: "connecting" | "connected" | "disconnected";
};

type LanInviteInfo = {
  port: number;
  hosts: string[];
  code: string;
  shareString: string;
  expiresAt: number;
  peerCount?: number;
};

export const SessionFollowToolbarControl: React.FC<SessionFollowToolbarControlProps> = ({
  sessionId,
  hostLabel,
  status,
}) => {
  const { t } = useI18n();
  const [state, setState] = useState<SessionFollowPublicState | null>(null);
  const [busy, setBusy] = useState(false);
  const [lanInvite, setLanInvite] = useState<LanInviteInfo | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinValue, setJoinValue] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditEvents, setAuditEvents] = useState<SessionFollowAuditEvent[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const active = Boolean(state);

  const peerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const peer of state?.peers || []) {
      map[peer.peerId] = peer.displayName;
    }
    return map;
  }, [state?.peers]);

  const auditTypeLabels = useMemo(() => ({
    follow_started: t("terminal.follow.audit.type.follow_started"),
    follow_stopped: t("terminal.follow.audit.type.follow_stopped"),
    peer_joined: t("terminal.follow.audit.type.peer_joined"),
    peer_left: t("terminal.follow.audit.type.peer_left"),
    control_requested: t("terminal.follow.audit.type.control_requested"),
    control_granted: t("terminal.follow.audit.type.control_granted"),
    control_revoked: t("terminal.follow.audit.type.control_revoked"),
    control_denied: t("terminal.follow.audit.type.control_denied"),
    input_denied: t("terminal.follow.audit.type.input_denied"),
  }), [t]);

  useEffect(() => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followGetState) return;
    let cancelled = false;
    void bridge.followGetState({ sessionId }).then((result) => {
      if (cancelled) return;
      if (result?.state) setState(result.state as SessionFollowPublicState);
    });
    void bridge.followLanGetInvite?.({ sessionId }).then((result) => {
      if (cancelled) return;
      if (result?.invite) setLanInvite(result.invite as LanInviteInfo);
    });
    const unsub = bridge.onFollowState?.((evt) => {
      if (evt?.sessionId === sessionId) {
        setState((evt.state as SessionFollowPublicState | null) ?? null);
      }
    });
    const unsubDenied = bridge.onFollowInputDenied?.((evt) => {
      if (evt?.sessionId === sessionId) {
        toast.warning(t("terminal.follow.toast.inputDenied"));
      }
    });
    return () => {
      cancelled = true;
      unsub?.();
      unsubDenied?.();
    };
  }, [sessionId, t]);

  const handleStart = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followStart) {
      toast.error(t("terminal.follow.error.unavailable"));
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.followStart({ sessionId });
      if (!result?.success) {
        toast.error(result?.error || t("terminal.follow.error.startFailed"));
        return;
      }
      if (result.state) setState(result.state as SessionFollowPublicState);
      toast.success(t("terminal.follow.toast.started"));
    } finally {
      setBusy(false);
    }
  }, [sessionId, t]);

  const handleStop = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    setBusy(true);
    try {
      await bridge?.followLanStopInvite?.({ sessionId });
      setLanInvite(null);
      await bridge?.followStop?.({ sessionId });
      setState(null);
      toast.success(t("terminal.follow.toast.stopped"));
    } finally {
      setBusy(false);
    }
  }, [sessionId, t]);

  const handleOpenViewer = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.openFollowSessionWindow) {
      toast.error(t("terminal.follow.error.unavailable"));
      return;
    }
    if (!state) await handleStart();
    const result = await bridge.openFollowSessionWindow({
      sessionId,
      title: hostLabel || sessionId,
      hostLabel: hostLabel || sessionId,
    });
    if (!result?.success) {
      toast.error(result?.error || t("terminal.follow.error.openViewerFailed"));
    }
  }, [handleStart, hostLabel, sessionId, state, t]);

  const handleLanInvite = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followLanCreateInvite) {
      toast.error(t("terminal.follow.error.unavailable"));
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.followLanCreateInvite({
        sessionId,
        hostLabel: hostLabel || sessionId,
      });
      if (!result?.success || !result.invite) {
        toast.error(result?.error || t("terminal.follow.lan.error.create"));
        return;
      }
      setLanInvite(result.invite as LanInviteInfo);
      if (result.state) setState(result.state as SessionFollowPublicState);
      toast.success(t("terminal.follow.lan.created"));
    } finally {
      setBusy(false);
    }
  }, [hostLabel, sessionId, t]);

  const handleCopyShare = useCallback(async () => {
    if (!lanInvite?.shareString) return;
    try {
      await navigator.clipboard.writeText(lanInvite.shareString);
      toast.success(t("terminal.follow.lan.copied"));
    } catch {
      toast.error(t("terminal.follow.lan.copyFailed"));
    }
  }, [lanInvite, t]);

  const handleGrant = useCallback(async (targetPeerId: string) => {
    const bridge = magiesTerminalBridge.get();
    const result = await bridge?.followGrantControl?.({ sessionId, targetPeerId });
    if (!result?.success) {
      toast.error(result?.error || t("terminal.follow.error.grantFailed"));
      return;
    }
    if (result.state) setState(result.state as SessionFollowPublicState);
    toast.success(t("terminal.follow.toast.granted"));
  }, [sessionId, t]);

  const handleRevoke = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    const result = await bridge?.followRevokeControl?.({ sessionId });
    if (!result?.success) {
      toast.error(result?.error || t("terminal.follow.error.revokeFailed"));
      return;
    }
    if (result.state) setState(result.state as SessionFollowPublicState);
    toast.success(t("terminal.follow.toast.revoked"));
  }, [sessionId, t]);

  const refreshAudit = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followGetAudit) {
      toast.error(t("terminal.follow.error.unavailable"));
      return;
    }
    setAuditLoading(true);
    try {
      const result = await bridge.followGetAudit({ sessionId });
      if (!result?.success) {
        toast.error(t("terminal.follow.audit.loadFailed"));
        return;
      }
      setAuditEvents((result.events || []) as SessionFollowAuditEvent[]);
    } finally {
      setAuditLoading(false);
    }
  }, [sessionId, t]);

  const handleToggleAudit = useCallback(() => {
    setAuditOpen((open) => {
      const next = !open;
      if (next) void refreshAudit();
      return next;
    });
  }, [refreshAudit]);

  const handleCopyAuditText = useCallback(async () => {
    if (auditEvents.length === 0) {
      toast.warning(t("terminal.follow.audit.empty"));
      return;
    }
    const text = exportFollowAuditText(auditEvents, {
      nameByPeerId: peerNameById,
      typeLabels: auditTypeLabels,
      header: `# MagiesTerminal follow audit · ${sessionId}`,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("terminal.follow.audit.copied"));
    } catch {
      toast.error(t("terminal.follow.audit.copyFailed"));
    }
  }, [auditEvents, auditTypeLabels, peerNameById, sessionId, t]);

  const handleCopyAuditNdjson = useCallback(async () => {
    if (auditEvents.length === 0) {
      toast.warning(t("terminal.follow.audit.empty"));
      return;
    }
    try {
      await navigator.clipboard.writeText(exportFollowAuditNdjson(auditEvents));
      toast.success(t("terminal.follow.audit.copiedNdjson"));
    } catch {
      toast.error(t("terminal.follow.audit.copyFailed"));
    }
  }, [auditEvents, t]);

  const handleClearAudit = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followClearAudit) {
      toast.error(t("terminal.follow.error.unavailable"));
      return;
    }
    if (auditEvents.length === 0) {
      toast.warning(t("terminal.follow.audit.empty"));
      return;
    }
    const result = await bridge.followClearAudit({ sessionId });
    if (!result?.success) {
      toast.error(result?.error || t("terminal.follow.audit.clearFailed"));
      return;
    }
    setAuditEvents([]);
    toast.success(t("terminal.follow.audit.cleared"));
  }, [auditEvents.length, sessionId, t]);

  const handleJoinLan = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followLanConnect) {
      toast.error(t("terminal.follow.error.unavailable"));
      return;
    }
    const share = joinValue.trim();
    if (!share) {
      toast.error(t("terminal.follow.lan.joinEmpty"));
      return;
    }
    setBusy(true);
    try {
      const result = await bridge.openLanFollowWindow?.({ shareString: share });
      if (!result?.success) {
        toast.error(result?.error || t("terminal.follow.lan.error.join"));
        return;
      }
      setJoinOpen(false);
      setJoinValue("");
    } finally {
      setBusy(false);
    }
  }, [joinValue, t]);

  if (status !== "connected") return null;

  return (
    <div className="flex items-center">
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className={cn(
                  "h-6 w-6 p-0 shadow-none border-none text-[color:var(--terminal-toolbar-fg)]",
                  "bg-transparent hover:bg-transparent",
                  (active || lanInvite) && "text-sky-400",
                )}
                aria-label={t("terminal.follow.toolbar")}
              >
                <Users size={12} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("terminal.follow.toolbar")}</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-80 p-3 space-y-2" align="end">
          <div className="text-xs font-medium">{t("terminal.follow.title")}</div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {t("terminal.follow.desc")}
          </p>
          {!active ? (
            <Button size="sm" className="w-full h-8 text-xs" disabled={busy} onClick={() => void handleStart()}>
              <Eye size={12} className="mr-1" />
              {t("terminal.follow.start")}
            </Button>
          ) : (
            <>
              <div className="text-[11px] text-muted-foreground">
                {t("terminal.follow.peers", { count: state?.peerCount ?? 1 })}
                {state?.pendingControlRequests?.length
                  ? ` · ${t("terminal.follow.pending", { count: state.pendingControlRequests.length })}`
                  : ""}
              </div>
              <Button size="sm" variant="secondary" className="w-full h-8 text-xs" disabled={busy} onClick={() => void handleOpenViewer()}>
                <Eye size={12} className="mr-1" />
                {t("terminal.follow.openViewer")}
              </Button>
              <Button size="sm" variant="outline" className="w-full h-8 text-xs" disabled={busy} onClick={() => void handleLanInvite()}>
                <Network size={12} className="mr-1" />
                {t("terminal.follow.lan.create")}
              </Button>
              {lanInvite && (
                <div className="rounded-md border border-border/50 p-2 space-y-1.5 text-[11px]">
                  <div className="font-medium">{t("terminal.follow.lan.inviteTitle")}</div>
                  <div className="text-muted-foreground break-all">
                    {(lanInvite.hosts || []).map((h) => `${h}:${lanInvite.port}`).join(" · ")}
                  </div>
                  <div>
                    {t("terminal.follow.lan.code")}: <span className="font-mono font-semibold">{lanInvite.code}</span>
                  </div>
                  <Button size="sm" variant="secondary" className="w-full h-7 text-[11px]" onClick={() => void handleCopyShare()}>
                    <Copy size={11} className="mr-1" />
                    {t("terminal.follow.lan.copyShare")}
                  </Button>
                </div>
              )}
              {(state?.pendingControlRequests || []).map((req) => (
                <Button
                  key={req.peerId}
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => void handleGrant(req.peerId)}
                >
                  <Hand size={12} className="mr-1" />
                  {t("terminal.follow.grantTo", { name: req.displayName })}
                </Button>
              ))}
              {state && state.controllerPeerId !== state.ownerPeerId && (
                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => void handleRevoke()}>
                  {t("terminal.follow.revoke")}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="w-full h-8 text-xs text-destructive" disabled={busy} onClick={() => void handleStop()}>
                {t("terminal.follow.stop")}
              </Button>
            </>
          )}

          {/* Audit is available even when follow is stopped — history is disk-backed. */}
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs"
            disabled={busy || auditLoading}
            onClick={() => handleToggleAudit()}
          >
            <ClipboardList size={12} className="mr-1" />
            {auditOpen ? t("terminal.follow.audit.hide") : t("terminal.follow.audit.show")}
          </Button>
          {auditOpen && (
            <div className="rounded-md border border-border/50 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium">
                  {t("terminal.follow.audit.title")}
                  <span className="ml-1 text-muted-foreground font-normal">
                    ({auditEvents.length})
                  </span>
                </div>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => void refreshAudit()}
                  disabled={auditLoading}
                >
                  {t("terminal.follow.audit.refresh")}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {t("terminal.follow.audit.persistedHint")}
              </p>
              {auditEvents.length === 0 ? (
                <div className="text-[11px] text-muted-foreground py-2 text-center">
                  {auditLoading
                    ? t("terminal.follow.audit.loading")
                    : t("terminal.follow.audit.empty")}
                </div>
              ) : (
                <ul className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                  {[...auditEvents].reverse().map((event, index) => (
                    <li
                      key={`${event.ts}-${event.type}-${index}`}
                      className="text-[10px] leading-snug text-muted-foreground font-mono break-words"
                    >
                      {formatFollowAuditLine(event, {
                        nameByPeerId: peerNameById,
                        typeLabels: auditTypeLabels,
                      })}
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[10px]"
                  disabled={auditEvents.length === 0}
                  onClick={() => void handleCopyAuditText()}
                >
                  <Copy size={10} className="mr-1" />
                  {t("terminal.follow.audit.copyText")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-[10px]"
                  disabled={auditEvents.length === 0}
                  onClick={() => void handleCopyAuditNdjson()}
                >
                  <Copy size={10} className="mr-1" />
                  {t("terminal.follow.audit.copyNdjson")}
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-7 text-[10px] text-destructive hover:text-destructive"
                disabled={auditEvents.length === 0}
                onClick={() => void handleClearAudit()}
              >
                {t("terminal.follow.audit.clear")}
              </Button>
            </div>
          )}

          <div className="border-t border-border/40 pt-2 space-y-1.5">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setJoinOpen((v) => !v)}
            >
              {t("terminal.follow.lan.joinToggle")}
            </button>
            {joinOpen && (
              <div className="space-y-1.5">
                <Input
                  className="h-8 text-xs font-mono"
                  value={joinValue}
                  onChange={(e) => setJoinValue(e.target.value)}
                  placeholder={t("terminal.follow.lan.joinPlaceholder")}
                />
                <Button size="sm" className="w-full h-8 text-xs" disabled={busy} onClick={() => void handleJoinLan()}>
                  {t("terminal.follow.lan.join")}
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
