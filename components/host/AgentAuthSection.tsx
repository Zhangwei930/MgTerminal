/**
 * SSH Agent auth section for the host details panel: shows the identities the
 * agent currently holds (type, fingerprint, comment) and lets the user pin a
 * preferred identity for this host. Optionally loads PKCS#11 modules via
 * system ssh-add -s (macOS/Linux).
 */
import { Check, KeyRound, Loader2, Usb } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { useApplicationBackend } from "../../application/state/useApplicationBackend";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "../ui/toast";

export interface AgentAuthSectionProps {
  preferredFingerprint?: string;
  onSelectPreferred: (fingerprint: string | undefined) => void;
}

type AgentIdentitiesState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; identities: MagiesTerminalAgentIdentity[] };

export const AgentAuthSection: React.FC<AgentAuthSectionProps> = ({
  preferredFingerprint,
  onSelectPreferred,
}) => {
  const { t } = useI18n();
  const {
    listSshAgentIdentities,
    sshPkcs11Supported,
    sshPkcs11Load,
    sshPkcs11Unload,
  } = useApplicationBackend();
  const [state, setState] = useState<AgentIdentitiesState>({ status: "loading" });
  const [pkcs11Supported, setPkcs11Supported] = useState(false);
  const [showPkcs11, setShowPkcs11] = useState(false);
  const [modulePath, setModulePath] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshIdentities = useCallback(async () => {
    const result = await listSshAgentIdentities();
    if (!result.available) {
      setState({ status: "unavailable" });
      return;
    }
    setState({ status: "ready", identities: result.identities });
  }, [listSshAgentIdentities]);

  useEffect(() => {
    let cancelled = false;
    void listSshAgentIdentities().then((result) => {
      if (cancelled) return;
      if (!result.available) {
        setState({ status: "unavailable" });
        return;
      }
      setState({ status: "ready", identities: result.identities });
    });
    void sshPkcs11Supported().then((supported) => {
      if (!cancelled) setPkcs11Supported(supported);
    });
    return () => {
      cancelled = true;
    };
  }, [listSshAgentIdentities, sshPkcs11Supported]);

  const handleBrowse = useCallback(async () => {
    const bridge = magiesTerminalBridge.get();
    if (!bridge?.selectFile) {
      toast.error(t("hostDetails.agent.pkcs11.pickUnavailable"));
      return;
    }
    const selected = await bridge.selectFile(
      t("hostDetails.agent.pkcs11.pickTitle"),
      undefined,
      [
        { name: "PKCS#11", extensions: ["so", "dylib"] },
        { name: "All", extensions: ["*"] },
      ],
    );
    if (selected) setModulePath(selected);
  }, [t]);

  const handleLoad = useCallback(async () => {
    if (!modulePath.trim()) {
      toast.error(t("hostDetails.agent.pkcs11.pathRequired"));
      return;
    }
    setBusy(true);
    try {
      const result = await sshPkcs11Load({
        modulePath: modulePath.trim(),
        pin: pin.trim() || undefined,
      });
      if (!result?.success) {
        const errorKey = result?.error
          ? `hostDetails.agent.pkcs11.error.${result.error}`
          : "hostDetails.agent.pkcs11.error.failed";
        // Prefer bridge message; fall back to mapped i18n or generic failed.
        const mapped = t(errorKey);
        toast.error(
          result?.message
          || (mapped !== errorKey ? mapped : t("hostDetails.agent.pkcs11.error.failed")),
        );
        return;
      }
      toast.success(t("hostDetails.agent.pkcs11.loaded"));
      setPin("");
      await refreshIdentities();
    } finally {
      setBusy(false);
    }
  }, [modulePath, pin, refreshIdentities, sshPkcs11Load, t]);

  const handleUnload = useCallback(async () => {
    if (!modulePath.trim()) {
      toast.error(t("hostDetails.agent.pkcs11.pathRequired"));
      return;
    }
    setBusy(true);
    try {
      const result = await sshPkcs11Unload({ modulePath: modulePath.trim() });
      if (!result?.success) {
        toast.error(result?.message || t("hostDetails.agent.pkcs11.error.failed"));
        return;
      }
      toast.success(t("hostDetails.agent.pkcs11.unloaded"));
      await refreshIdentities();
    } finally {
      setBusy(false);
    }
  }, [modulePath, refreshIdentities, sshPkcs11Unload, t]);

  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        {t("hostDetails.agent.loading")}
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="space-y-2 p-2 text-xs text-muted-foreground">
        <div>{t("hostDetails.agent.unavailable")}</div>
      </div>
    );
  }

  const rowClass = (selected: boolean) =>
    cn(
      "w-full flex items-center gap-2 rounded-md border p-2 text-left transition-colors",
      selected
        ? "border-primary/60 bg-primary/5"
        : "border-border/60 bg-secondary/40 hover:bg-secondary/70",
    );

  return (
    <div className="space-y-2" data-testid="agent-identities">
      {state.identities.length === 0 ? (
        <div className="p-2 text-xs text-muted-foreground">
          {t("hostDetails.agent.empty")}
        </div>
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            className={rowClass(!preferredFingerprint)}
            onClick={() => onSelectPreferred(undefined)}
          >
            <KeyRound size={14} className="shrink-0 text-muted-foreground" />
            <span className="flex-1 text-xs">{t("hostDetails.agent.anyIdentity")}</span>
            {!preferredFingerprint && <Check size={14} className="shrink-0 text-primary" />}
          </button>
          {state.identities.map((identity) => {
            const selected = preferredFingerprint === identity.fingerprint;
            return (
              <button
                type="button"
                key={identity.fingerprint || identity.comment}
                className={rowClass(selected)}
                onClick={() => onSelectPreferred(identity.fingerprint)}
              >
                <KeyRound size={14} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">
                    {identity.comment || identity.keyType}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {identity.keyType} · SHA256:{identity.fingerprint}
                  </span>
                </span>
                {selected && <Check size={14} className="shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
      )}

      {pkcs11Supported && (
        <div className="rounded-md border border-border/50 p-2 space-y-2">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setShowPkcs11((v) => !v)}
          >
            <Usb size={12} />
            {t("hostDetails.agent.pkcs11.title")}
          </button>
          {showPkcs11 && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground leading-snug">
                {t("hostDetails.agent.pkcs11.desc")}
              </p>
              <div className="flex gap-1.5">
                <Input
                  className="h-8 text-xs"
                  value={modulePath}
                  onChange={(e) => setModulePath(e.target.value)}
                  placeholder={t("hostDetails.agent.pkcs11.pathPlaceholder")}
                />
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void handleBrowse()}>
                  {t("hostDetails.agent.pkcs11.browse")}
                </Button>
              </div>
              <Input
                className="h-8 text-xs"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t("hostDetails.agent.pkcs11.pinPlaceholder")}
                autoComplete="off"
              />
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  disabled={busy}
                  onClick={() => void handleLoad()}
                >
                  {busy ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
                  {t("hostDetails.agent.pkcs11.load")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 text-xs"
                  disabled={busy}
                  onClick={() => void handleUnload()}
                >
                  {t("hostDetails.agent.pkcs11.unload")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentAuthSection;
