import { Fingerprint, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import {
  hasVaultPlatformUnlockPin,
  type VaultPlatformUnlockConfig,
} from "../domain/vaultPlatformUnlock";
import {
  readVaultPlatformUnlockConfig,
  setVaultPlatformSessionUnlocked,
  tryUnlockVaultWithPin,
  unlockVaultWithPlatform,
} from "../application/state/vaultPlatformUnlockStore";
import {
  isWebAuthnAvailable,
  unlockVaultWithWebAuthn,
} from "../application/state/vaultWebAuthnClient";
import { magiesTerminalBridge } from "@/infrastructure/services/magiesTerminalBridge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "../lib/utils";

export type PlatformVaultUnlockOverlayProps = {
  open: boolean;
  onUnlocked: () => void | Promise<void>;
};

export const PlatformVaultUnlockOverlay: React.FC<PlatformVaultUnlockOverlayProps> = ({
  open,
  onUnlocked,
}) => {
  const { t } = useI18n();
  const [config, setConfig] = useState<VaultPlatformUnlockConfig>(() => readVaultPlatformUnlockConfig());
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [webauthnAvailable, setWebauthnAvailable] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyMethod, setBusyMethod] = useState<"platform" | "webauthn" | "pin" | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [autoPrompted, setAutoPrompted] = useState(false);

  useEffect(() => {
    if (!open) {
      setAutoPrompted(false);
      setShowPin(false);
      setPin("");
      setError(null);
      setBusyMethod(null);
      return;
    }
    setConfig(readVaultPlatformUnlockConfig());
    setError(null);
    void magiesTerminalBridge.get()?.platformAuthStatus?.().then((status) => {
      setPlatformAvailable(Boolean(status?.available));
    });
    void magiesTerminalBridge.get()?.vaultUnlockStatus?.().then((status) => {
      setWebauthnAvailable(Boolean(status?.hasWebAuthn) && isWebAuthnAvailable());
    });
  }, [open]);

  const finishUnlock = useCallback(async () => {
    await onUnlocked();
  }, [onUnlocked]);

  const handlePlatform = useCallback(async () => {
    setBusy(true);
    setBusyMethod("platform");
    setError(null);
    try {
      const ok = await unlockVaultWithPlatform(t("vault.unlock.platformReason"));
      if (!ok) {
        setError(t("vault.unlock.platformFailed"));
        return;
      }
      await finishUnlock();
    } finally {
      setBusy(false);
      setBusyMethod(null);
    }
  }, [finishUnlock, t]);

  const handleWebAuthn = useCallback(async () => {
    setBusy(true);
    setBusyMethod("webauthn");
    setError(null);
    try {
      const ok = await unlockVaultWithWebAuthn();
      if (!ok) {
        setError(t("vault.unlock.webauthnFailed"));
        return;
      }
      setVaultPlatformSessionUnlocked(true);
      await finishUnlock();
    } finally {
      setBusy(false);
      setBusyMethod(null);
    }
  }, [finishUnlock, t]);

  const handlePin = useCallback(async () => {
    setBusy(true);
    setBusyMethod("pin");
    setError(null);
    try {
      const ok = await tryUnlockVaultWithPin(pin);
      if (!ok) {
        setError(t("vault.unlock.pinIncorrect"));
        return;
      }
      await finishUnlock();
    } finally {
      setBusy(false);
      setBusyMethod(null);
    }
  }, [finishUnlock, pin, t]);

  // Auto-prompt preferred biometric once
  useEffect(() => {
    if (!open || autoPrompted || busy) return;
    if (platformAvailable) {
      setAutoPrompted(true);
      void handlePlatform();
      return;
    }
    if (webauthnAvailable) {
      setAutoPrompted(true);
      void handleWebAuthn();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platformAvailable, webauthnAvailable, autoPrompted]);

  if (!open) return null;

  const pinEnabled = hasVaultPlatformUnlockPin(config);
  const hasAnyMethod = platformAvailable || webauthnAvailable || pinEnabled;

  const MethodCard: React.FC<{
    title: string;
    hint: string;
    icon: React.ReactNode;
    primary?: boolean;
    loading?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }> = ({ title, hint, icon, primary, loading, disabled, onClick }) => (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        primary
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
          : "border-border/60 bg-card hover:bg-muted/40",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
          primary
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border/50 bg-muted/50 text-muted-foreground",
        )}
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground leading-snug">{hint}</div>
      </div>
      <ShieldCheck
        size={16}
        className={cn(
          "mt-1 shrink-0",
          primary ? "text-primary/70" : "text-muted-foreground/50",
        )}
      />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 shadow-2xl space-y-5">
        <div className="flex flex-col items-center text-center gap-2.5">
          <div className="h-14 w-14 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center shadow-inner">
            <Lock size={24} className="text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{t("vault.unlock.title")}</h2>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              {t("vault.unlock.desc")}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {platformAvailable && (
            <MethodCard
              primary
              title={t("vault.unlock.usePlatform")}
              hint={t("vault.unlock.platformHint")}
              icon={<Fingerprint size={18} />}
              loading={busyMethod === "platform"}
              onClick={() => void handlePlatform()}
            />
          )}
          {webauthnAvailable && (
            <MethodCard
              primary={!platformAvailable}
              title={t("vault.unlock.useWebAuthn")}
              hint={t("vault.unlock.webauthnHint")}
              icon={<KeyRound size={18} />}
              loading={busyMethod === "webauthn"}
              onClick={() => void handleWebAuthn()}
            />
          )}
        </div>

        {pinEnabled && (
          <div className="space-y-2.5">
            {(platformAvailable || webauthnAvailable) && (
              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPin((v) => !v)}
              >
                {showPin ? t("vault.unlock.orOther") : t("vault.unlock.orPin")}
              </button>
            )}
            {(showPin || (!platformAvailable && !webauthnAvailable)) && (
              <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">{t("vault.unlock.pinHint")}</p>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus={showPin || (!platformAvailable && !webauthnAvailable)}
                  placeholder={t("vault.unlock.pinPlaceholder")}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handlePin();
                  }}
                  className="h-10"
                />
                <Button
                  className="w-full"
                  disabled={busy || pin.trim().length < 4}
                  onClick={() => void handlePin()}
                >
                  {busyMethod === "pin" ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : null}
                  {t("vault.unlock.unlockWithPin")}
                </Button>
              </div>
            )}
          </div>
        )}

        {!hasAnyMethod && (
          <p className="text-sm text-amber-600 dark:text-amber-400 text-center leading-relaxed">
            {t("vault.unlock.misconfigured")}
          </p>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
