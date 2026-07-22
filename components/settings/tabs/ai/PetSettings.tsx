import React, { useCallback, useRef, useState } from "react";
import { Play, RotateCcw, Upload } from "lucide-react";
import { useI18n } from "../../../../application/i18n/I18nProvider";
import { useStoredBoolean } from "../../../../application/state/useStoredBoolean";
import { usePetImageConfig, DEFAULT_PET_IMAGE_URL } from "../../../../application/state/usePetImageConfig";
import { usePetCustomCommand } from "../../../../application/state/usePetCustomCommand";
import { usePetNumberSetting } from "../../../../application/state/usePetNumberSetting";
import { useTestPetCommand } from "../../../../application/state/usePetInteractions";
import { clampFrameRange, getSpriteFrameCount, type FrameRange } from "../../../../domain/petSprite";
import type { PetStatus } from "../../../../domain/petStatus";
import {
  STORAGE_KEY_AI_PET_ENABLED,
  STORAGE_KEY_AI_PET_SCALE,
  STORAGE_KEY_AI_PET_OPACITY,
  STORAGE_KEY_AI_PET_ALWAYS_ON_TOP,
  STORAGE_KEY_AI_PET_SHOW_BUBBLE,
  STORAGE_KEY_AI_PET_PRIVACY_MODE,
  STORAGE_KEY_AI_PET_NOTIFICATIONS_ENABLED,
} from "../../../../infrastructure/config/storageKeys";
import { Button } from "../../../ui/button";
import { SettingCard, SettingRow, SettingsSection, Toggle } from "../../settings-ui";

// Image bytes are stored on disk (userData/pet-assets/), not in localStorage — see
// electron/bridges/petImageBridge.cjs. This is a sanity cap, not a quota concern.
const PET_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/webp"];
const FRAME_RANGE_STATUSES: PetStatus[] = ['idle', 'running', 'waiting', 'done', 'failed'];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

type TestRunState = { phase: "idle" } | { phase: "running" } | { phase: "success" } | { phase: "failure"; error: string };

export const PetSettings: React.FC = () => {
  const { t } = useI18n();
  const [enabled, setEnabled] = useStoredBoolean(STORAGE_KEY_AI_PET_ENABLED, false);
  const { image, setImage, resetImage, setFrameRanges } = usePetImageConfig();
  const [customCommand, setCustomCommand] = usePetCustomCommand();
  const [scale, setScale] = usePetNumberSetting(STORAGE_KEY_AI_PET_SCALE, 1, { min: 0.5, max: 2 });
  const [opacity, setOpacity] = usePetNumberSetting(STORAGE_KEY_AI_PET_OPACITY, 1, { min: 0.3, max: 1 });
  const [alwaysOnTop, setAlwaysOnTop] = useStoredBoolean(STORAGE_KEY_AI_PET_ALWAYS_ON_TOP, true);
  const [showBubble, setShowBubble] = useStoredBoolean(STORAGE_KEY_AI_PET_SHOW_BUBBLE, true);
  const [privacyMode, setPrivacyMode] = useStoredBoolean(STORAGE_KEY_AI_PET_PRIVACY_MODE, false);
  const [notificationsEnabled, setNotificationsEnabled] = useStoredBoolean(STORAGE_KEY_AI_PET_NOTIFICATIONS_ENABLED, true);
  const [cols, setCols] = useState(image?.cols ?? 1);
  const [rows, setRows] = useState(image?.rows ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [testRun, setTestRun] = useState<TestRunState>({ phase: "idle" });
  const testPetCommand = useTestPetCommand();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(t("ai.pet.image.invalidFile"));
      return;
    }
    if (file.size > PET_IMAGE_MAX_BYTES) {
      setError(t("ai.pet.image.tooLarge"));
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      const saved = await setImage(dataUrl, Math.max(1, cols), Math.max(1, rows));
      setError(saved ? null : t("ai.pet.image.saveFailed"));
    } catch {
      setError(t("ai.pet.image.invalidFile"));
    }
  }, [cols, rows, setImage, t]);

  const handleReset = useCallback(() => {
    void resetImage();
    setCols(1);
    setRows(1);
    setError(null);
  }, [resetImage]);

  const handleGridChange = useCallback(async (nextCols: number, nextRows: number) => {
    setCols(nextCols);
    setRows(nextRows);
    if (image) {
      const saved = await setImage(image.dataUrl, Math.max(1, nextCols), Math.max(1, nextRows));
      if (!saved) setError(t("ai.pet.image.saveFailed"));
    }
  }, [image, setImage, t]);

  const frameCount = getSpriteFrameCount({ cols, rows });
  const handleFrameRangeChange = useCallback((status: PetStatus, patch: Partial<FrameRange>) => {
    const current = clampFrameRange(image?.frameRanges?.[status], frameCount);
    const next = clampFrameRange({ ...current, ...patch }, frameCount);
    setFrameRanges({ ...image?.frameRanges, [status]: next });
  }, [image, frameCount, setFrameRanges]);

  const handleTestRun = useCallback(async () => {
    if (!customCommand.trim()) return;
    setTestRun({ phase: "running" });
    const result = await testPetCommand(customCommand);
    if (result.success) setTestRun({ phase: "success" });
    else setTestRun({ phase: "failure", error: result.error || "Unknown error" });
  }, [customCommand, testPetCommand]);

  const previewUrl = image?.dataUrl ?? DEFAULT_PET_IMAGE_URL;

  return (
    <SettingsSection title={t("ai.pet.title")}>
      <SettingCard divided>
        <SettingRow label={t("ai.pet.enable")} description={t("ai.pet.enable.description")}>
          <Toggle checked={enabled} onChange={setEnabled} ariaLabel={t("ai.pet.enable")} />
        </SettingRow>
      </SettingCard>

      <SettingCard padded className="space-y-3">
        <div className="flex items-center gap-4">
          <div
            className="h-16 w-16 shrink-0 rounded-lg border border-border/60 bg-muted/30 bg-contain bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${previewUrl})` }}
          />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">{t("ai.pet.image.title")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="text-xs gap-1.5" onClick={handleUploadClick}>
                <Upload size={13} />
                {t("ai.pet.image.upload")}
              </Button>
              {image && (
                <Button type="button" variant="ghost" size="sm" className="text-xs gap-1.5" onClick={handleReset}>
                  <RotateCcw size={13} />
                  {t("ai.pet.image.reset")}
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/webp"
              className="hidden"
              onChange={(e) => { void handleFileSelected(e); }}
            />
            {error && <p className="text-[11px] text-destructive">{error}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("ai.pet.image.spriteCols")}
            <input
              type="number"
              min={1}
              max={32}
              value={cols}
              onChange={(e) => { void handleGridChange(Math.max(1, parseInt(e.target.value, 10) || 1), rows); }}
              className="w-14 h-7 rounded-md border border-input bg-background px-2 text-xs text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("ai.pet.image.spriteRows")}
            <input
              type="number"
              min={1}
              max={32}
              value={rows}
              onChange={(e) => { void handleGridChange(cols, Math.max(1, parseInt(e.target.value, 10) || 1)); }}
              className="w-14 h-7 rounded-md border border-input bg-background px-2 text-xs text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{t("ai.pet.image.spriteHint")}</p>
      </SettingCard>

      {image && frameCount > 1 && (
        <SettingCard padded className="space-y-3">
          <div>
            <p className="text-sm font-medium">{t("ai.pet.frameRanges.title")}</p>
            <p className="text-xs text-muted-foreground">{t("ai.pet.frameRanges.description")}</p>
          </div>
          <div className="space-y-2">
            {FRAME_RANGE_STATUSES.map((status) => {
              const range = clampFrameRange(image.frameRanges?.[status], frameCount);
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{t(`ai.pet.status.${status}`)}</span>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t("ai.pet.frameRanges.start")}
                    <input
                      type="number"
                      min={0}
                      max={frameCount - 1}
                      value={range.start}
                      onChange={(e) => handleFrameRangeChange(status, { start: parseInt(e.target.value, 10) || 0 })}
                      className="w-14 h-7 rounded-md border border-input bg-background px-2 text-xs text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {t("ai.pet.frameRanges.end")}
                    <input
                      type="number"
                      min={0}
                      max={frameCount - 1}
                      value={range.end}
                      onChange={(e) => handleFrameRangeChange(status, { end: parseInt(e.target.value, 10) || 0 })}
                      className="w-14 h-7 rounded-md border border-input bg-background px-2 text-xs text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </SettingCard>
      )}

      <SettingCard divided>
        <SettingRow label={t("ai.pet.appearance.scale")}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
          </div>
        </SettingRow>
        <SettingRow label={t("ai.pet.appearance.opacity")}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-32"
            />
            <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{Math.round(opacity * 100)}%</span>
          </div>
        </SettingRow>
        <SettingRow label={t("ai.pet.appearance.alwaysOnTop")} description={t("ai.pet.appearance.alwaysOnTop.description")}>
          <Toggle checked={alwaysOnTop} onChange={setAlwaysOnTop} ariaLabel={t("ai.pet.appearance.alwaysOnTop")} />
        </SettingRow>
        <SettingRow label={t("ai.pet.appearance.showBubble")}>
          <Toggle checked={showBubble} onChange={setShowBubble} ariaLabel={t("ai.pet.appearance.showBubble")} />
        </SettingRow>
      </SettingCard>

      <SettingCard divided>
        <SettingRow label={t("ai.pet.behavior.privacyMode")} description={t("ai.pet.behavior.privacyMode.description")}>
          <Toggle checked={privacyMode} onChange={setPrivacyMode} ariaLabel={t("ai.pet.behavior.privacyMode")} />
        </SettingRow>
        <SettingRow label={t("ai.pet.behavior.notifications")} description={t("ai.pet.behavior.notifications.description")}>
          <Toggle checked={notificationsEnabled} onChange={setNotificationsEnabled} ariaLabel={t("ai.pet.behavior.notifications")} />
        </SettingRow>
      </SettingCard>

      <SettingCard padded className="space-y-2">
        <p className="text-sm font-medium">{t("ai.pet.customCommand.label")}</p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customCommand}
            onChange={(e) => { setCustomCommand(e.target.value); setTestRun({ phase: "idle" }); }}
            placeholder={t("ai.pet.customCommand.placeholder")}
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 text-xs"
            disabled={!customCommand.trim() || testRun.phase === "running"}
            onClick={() => { void handleTestRun(); }}
          >
            <Play size={13} />
            {testRun.phase === "running" ? t("ai.pet.customCommand.testRun.running") : t("ai.pet.customCommand.testRun")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("ai.pet.customCommand.description")}</p>
        {testRun.phase === "success" && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{t("ai.pet.customCommand.testRun.success")}</p>
        )}
        {testRun.phase === "failure" && (
          <p className="text-[11px] text-destructive">{t("ai.pet.customCommand.testRun.failure", { error: testRun.error })}</p>
        )}
      </SettingCard>
    </SettingsSection>
  );
};
