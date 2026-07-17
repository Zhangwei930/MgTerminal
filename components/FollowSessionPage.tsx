import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Eye, Hand, Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { I18nProvider, useI18n } from "../application/i18n/I18nProvider";
import { magiesTerminalBridge } from "@/infrastructure/services/magiesTerminalBridge";
import type { SessionFollowPublicState } from "../domain/sessionFollow";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { cn } from "../lib/utils";

type FollowOpenPayload = {
  sessionId: string;
  title?: string;
  hostLabel?: string;
};

/**
 * Lightweight local follow viewer. Attaches to an existing backend session
 * (no second SSH login). Input is gated by main-process control lock.
 */
function FollowSessionPageInner() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [payload, setPayload] = useState<FollowOpenPayload | null>(null);
  const [state, setState] = useState<SessionFollowPublicState | null>(null);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(true);

  const isController = Boolean(
    state && peerId && state.controllerPeerId === peerId,
  );

  // Receive open payload from main
  useEffect(() => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.onFollowSessionOpen) {
      setError(t("terminal.follow.error.unavailable"));
      setJoining(false);
      return;
    }
    return bridge.onFollowSessionOpen((next) => {
      if (next?.sessionId) {
        setPayload({
          sessionId: next.sessionId,
          title: next.title,
          hostLabel: next.hostLabel,
        });
      }
    });
  }, [t]);

  // Join room + subscribe output
  useEffect(() => {
    if (!payload?.sessionId) return;
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.followJoin || !bridge.onSessionData) {
      setError(t("terminal.follow.error.unavailable"));
      setJoining(false);
      return;
    }

    let disposed = false;
    let unsubData: (() => void) | undefined;
    let unsubState: (() => void) | undefined;
    let unsubDenied: (() => void) | undefined;

    const setup = async () => {
      setJoining(true);
      setError(null);
      const joinResult = await bridge.followJoin!({ sessionId: payload.sessionId });
      if (disposed) return;
      if (!joinResult?.success) {
        setError(joinResult?.error || t("terminal.follow.error.joinFailed"));
        setJoining(false);
        return;
      }
      setPeerId(joinResult.peerId || null);
      if (joinResult.state) setState(joinResult.state as SessionFollowPublicState);

      unsubState = bridge.onFollowState?.((evt) => {
        if (evt?.sessionId === payload.sessionId) {
          setState(evt.state as SessionFollowPublicState | null);
        }
      });

      unsubDenied = bridge.onFollowInputDenied?.((evt) => {
        if (evt?.sessionId === payload.sessionId) {
          toast.warning(t("terminal.follow.toast.inputDenied"));
        }
      });

      // Mount xterm
      const el = containerRef.current;
      if (!el) {
        setJoining(false);
        return;
      }
      const term = new XTerm({
        convertEol: true,
        cursorBlink: true,
        fontSize: 13,
        theme: { background: "#0b0f14", foreground: "#e6edf3" },
        disableStdin: false,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(el);
      fit.fit();
      termRef.current = term;
      fitRef.current = fit;

      unsubData = bridge.onSessionData(
        payload.sessionId,
        (chunk) => {
          term.write(chunk);
        },
        { replayBacklog: true },
      );

      term.onData((data) => {
        // Always attempt write — main process enforces control lock.
        bridge.writeToSession?.(payload.sessionId, data);
      });

      const onResize = () => {
        try {
          fit.fit();
        } catch {
          // ignore
        }
      };
      window.addEventListener("resize", onResize);
      setJoining(false);

      return () => window.removeEventListener("resize", onResize);
    };

    let cleanupResize: (() => void) | undefined;
    void setup().then((fn) => {
      cleanupResize = fn;
    });

    return () => {
      disposed = true;
      unsubData?.();
      unsubState?.();
      unsubDenied?.();
      cleanupResize?.();
      void bridge.followLeave?.({ sessionId: payload.sessionId });
      try {
        termRef.current?.dispose();
      } catch {
        // ignore
      }
      termRef.current = null;
      fitRef.current = null;
    };
  }, [payload, t]);

  const handleRequestControl = useCallback(async () => {
    if (!payload?.sessionId) return;
    const bridge = magiesTerminalBridge.get();
    const result = await bridge?.followRequestControl?.({ sessionId: payload.sessionId });
    if (!result?.success) {
      toast.error(result?.error || t("terminal.follow.error.requestFailed"));
      return;
    }
    if (result.state) setState(result.state as SessionFollowPublicState);
    toast.info(t("terminal.follow.toast.controlRequested"));
  }, [payload, t]);

  const label = payload?.hostLabel || payload?.title || payload?.sessionId || "…";

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0f14] text-[#e6edf3]">
      <header className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-white/10">
        <Eye size={14} className="opacity-70" />
        <span className="text-sm font-medium truncate flex-1">
          {t("terminal.follow.viewerTitle", { label })}
        </span>
        {state && (
          <span className="text-[11px] opacity-60">
            {t("terminal.follow.peers", { count: state.peerCount })}
          </span>
        )}
        <span
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full border",
            isController
              ? "border-green-500/50 text-green-400"
              : "border-white/15 text-white/70",
          )}
        >
          {isController
            ? t("terminal.follow.role.controller")
            : t("terminal.follow.role.viewer")}
        </span>
        {!isController && (
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => void handleRequestControl()}>
            <Hand size={12} className="mr-1" />
            {t("terminal.follow.requestControl")}
          </Button>
        )}
      </header>
      <div className="flex-1 min-h-0 relative">
        {(joining || error) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-sm">
            {error ? (
              <span className="text-red-300">{error}</span>
            ) : (
              <span className="inline-flex items-center gap-2 opacity-80">
                <Loader2 size={14} className="animate-spin" />
                {t("terminal.follow.joining")}
              </span>
            )}
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0 p-1" />
      </div>
    </div>
  );
}

export default function FollowSessionPage() {
  return (
    <I18nProvider>
      <FollowSessionPageInner />
    </I18nProvider>
  );
}
