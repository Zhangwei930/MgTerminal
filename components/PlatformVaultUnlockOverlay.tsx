import { Fingerprint, Loader2, Lock } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import {
  hasVaultPlatformUnlockPin,
  type VaultPlatformUnlockConfig,
} from "../domain/vaultPlatformUnlock";
import {
  readVaultPlatformUnlockConfig,
  tryUnlockVaultWithPin,
  unlockVaultWithPlatform,
} from "../application/state/vaultPlatformUnlockStore";
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
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfig(readVaultPlatformUnlockConfig());
    setError(null);
    void magiesTerminalBridge.get()?.platformAuthStatus?.().then((status) => {
      setPlatformAvailable(Boolean(status?.available));
    });
  }, [open]);

  const finishUnlock = useCallback(async () => {
    await onUnlocked();
  }, [onUnlocked]);

  const handlePlatform = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // The Touch ID prompt runs in the main process and, on success, unlocks
      // the main-process vault gate atomically — the renderer cannot bypass it.
      const ok = await unlockVaultWithPlatform(t("vault.unlock.platformReason"));
      if (!ok) {
        setError(t("vault.unlock.platformFailed"));
        return;
      }
      await finishUnlock();
    } finally {
      setBusy(false);
    }
  }, [finishUnlock, t]);

  const handlePin = useCallback(async () => {
    setBusy(true);
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
    }
  }, [finishUnlock, pin, t]);

  // Auto-prompt Touch ID once when available
  useEffect(() => {
    if (!open || !platformAvailable || busy) return;
    void handlePlatform();
    // Only on first open with platform available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platformAvailable]);

  if (!open) return null;

  const pinEnabled = hasVaultPlatformUnlockPin(config);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-xl space-y-4">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="h-12 w-12 rounded-2xl bg-muted/60 border border-border/50 flex items-center justify-center">
            <Lock size={22} className="text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">{t("vault.unlock.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("vault.unlock.desc")}</p>
        </div>

        {platformAvailable && (
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => void handlePlatform()}
          >
            {busy ? (
              <Loader2 size={16} className="mr-2 animate-spin" />
            ) : (
              <Fingerprint size={16} className="mr-2" />
            )}
            {t("vault.unlock.usePlatform")}
          </Button>
        )}

        {pinEnabled && (
          <div className="space-y-2">
            {platformAvailable && (
              <div className="text-center text-xs text-muted-foreground">{t("vault.unlock.orPin")}</div>
            )}
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("vault.unlock.pinPlaceholder")}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handlePin();
              }}
            />
            <Button
              variant={platformAvailable ? "secondary" : "default"}
              className="w-full"
              disabled={busy || pin.trim().length < 4}
              onClick={() => void handlePin()}
            >
              {t("vault.unlock.unlockWithPin")}
            </Button>
          </div>
        )}

        {!platformAvailable && !pinEnabled && (
          <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
            {t("vault.unlock.misconfigured")}
          </p>
        )}

        {error && (
          <p className={cn("text-xs text-center text-destructive")}>{error}</p>
        )}
      </div>
    </div>
  );
};
