import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Hand, Loader2, Network } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { I18nProvider, useI18n } from "../application/i18n/I18nProvider";
import { magiesTerminalBridge } from "@/infrastructure/services/magiesTerminalBridge";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { cn } from "../lib/utils";

function LanFollowJoinPageInner() {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const [hostLabel, setHostLabel] = useState("…");
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [isController, setIsController] = useState(false);
  const peerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.onOpenLanFollow || !bridge.followLanConnect) {
      setStatus("error");
      setError(t("terminal.follow.error.unavailable"));
      return;
    }

    let disposed = false;
    let unsubEvent: (() => void) | undefined;

    const unsubOpen = bridge.onOpenLanFollow((payload) => {
      if (!payload?.shareString || disposed) return;
      void (async () => {
        setStatus("connecting");
        setError(null);
        const result = await bridge.followLanConnect!({ shareString: payload.shareString });
        if (disposed) return;
        if (!result?.success || !result.clientId) {
          setStatus("error");
          setError(result?.error || t("terminal.follow.lan.error.join"));
          return;
        }
        clientIdRef.current = result.clientId;
        peerIdRef.current = result.peerId || null;
        setHostLabel(result.hostLabel || result.sessionId || "session");
        setStatus("connected");

        const el = containerRef.current;
        if (!el) return;
        const term = new XTerm({
          convertEol: true,
          cursorBlink: true,
          fontSize: 13,
          theme: { background: "#0b0f14", foreground: "#e6edf3" },
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(el);
        fit.fit();
        termRef.current = term;

        term.onData((data) => {
          if (clientIdRef.current) {
            void bridge.followLanViewerInput?.({ clientId: clientIdRef.current, data });
          }
        });

        unsubEvent = bridge.onFollowLanClientEvent?.((evt) => {
          if (evt?.clientId !== clientIdRef.current) return;
          const msg = evt.message;
          if (!msg) return;
          if (msg.type === "data" && typeof msg.data === "string") {
            term.write(msg.data);
          }
          if (msg.type === "state" && msg.state) {
            const controller = msg.state.controllerPeerId;
            setIsController(Boolean(peerIdRef.current && controller === peerIdRef.current));
          }
          if (msg.type === "inputDenied") {
            toast.warning(t("terminal.follow.toast.inputDenied"));
          }
          if (msg.type === "closed") {
            setStatus("error");
            setError(t("terminal.follow.lan.disconnected"));
          }
          if (msg.type === "welcome" && msg.state) {
            const controller = msg.state.controllerPeerId;
            setIsController(Boolean(peerIdRef.current && controller === peerIdRef.current));
          }
        });

        window.addEventListener("resize", () => {
          try { fit.fit(); } catch { /* ignore */ }
        });
      })();
    });

    return () => {
      disposed = true;
      unsubOpen?.();
      unsubEvent?.();
      if (clientIdRef.current) {
        void bridge.followLanViewerDisconnect?.({ clientId: clientIdRef.current });
      }
      try { termRef.current?.dispose(); } catch { /* ignore */ }
      termRef.current = null;
    };
  }, [t]);

  const handleRequestControl = useCallback(() => {
    if (!clientIdRef.current) return;
    void magiesTerminalBridge.get()?.followLanViewerRequestControl?.({
      clientId: clientIdRef.current,
    });
    toast.info(t("terminal.follow.toast.controlRequested"));
  }, [t]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0b0f14] text-[#e6edf3]">
      <header className="h-10 shrink-0 flex items-center gap-2 px-3 border-b border-white/10">
        <Network size={14} className="opacity-70" />
        <span className="text-sm font-medium truncate flex-1">
          {t("terminal.follow.lan.viewerTitle", { label: hostLabel })}
        </span>
        <span
          className={cn(
            "text-[11px] px-2 py-0.5 rounded-full border",
            isController ? "border-green-500/50 text-green-400" : "border-white/15 text-white/70",
          )}
        >
          {isController
            ? t("terminal.follow.role.controller")
            : t("terminal.follow.role.viewer")}
        </span>
        {!isController && status === "connected" && (
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleRequestControl}>
            <Hand size={12} className="mr-1" />
            {t("terminal.follow.requestControl")}
          </Button>
        )}
      </header>
      <div className="flex-1 min-h-0 relative">
        {status !== "connected" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-sm">
            {error ? (
              <span className="text-red-300">{error}</span>
            ) : (
              <span className="inline-flex items-center gap-2 opacity-80">
                <Loader2 size={14} className="animate-spin" />
                {t("terminal.follow.lan.connecting")}
              </span>
            )}
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0 p-1" />
      </div>
    </div>
  );
}

export default function LanFollowJoinPage() {
  return (
    <I18nProvider>
      <LanFollowJoinPageInner />
    </I18nProvider>
  );
}
