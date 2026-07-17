import { Eye, Hand, Users } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import type { SessionFollowPublicState } from "../../domain/sessionFollow";
import { magiesTerminalBridge } from "@/infrastructure/services/magiesTerminalBridge";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { toast } from "../ui/toast";

export type SessionFollowToolbarControlProps = {
  sessionId: string;
  hostLabel?: string;
  status: "connecting" | "connected" | "disconnected";
};

export const SessionFollowToolbarControl: React.FC<SessionFollowToolbarControlProps> = ({
  sessionId,
  hostLabel,
  status,
}) => {
  const { t } = useI18n();
  const [state, setState] = useState<SessionFollowPublicState | null>(null);
  const [busy, setBusy] = useState(false);
  const active = Boolean(state);

  useEffect(() => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followGetState) return;
    let cancelled = false;
    void bridge.followGetState({ sessionId }).then((result) => {
      if (cancelled) return;
      if (result?.state) setState(result.state as SessionFollowPublicState);
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
    // Ensure room exists first
    if (!state) {
      await handleStart();
    }
    const result = await bridge.openFollowSessionWindow({
      sessionId,
      title: hostLabel || sessionId,
      hostLabel: hostLabel || sessionId,
    });
    if (!result?.success) {
      toast.error(result?.error || t("terminal.follow.error.openViewerFailed"));
      return;
    }
  }, [handleStart, hostLabel, sessionId, state, t]);

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
                  active && "text-sky-400",
                )}
                aria-label={t("terminal.follow.toolbar")}
              >
                <Users size={12} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("terminal.follow.toolbar")}</TooltipContent>
        </Tooltip>
        <PopoverContent className="w-72 p-3 space-y-2" align="end">
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
        </PopoverContent>
      </Popover>
    </div>
  );
};
