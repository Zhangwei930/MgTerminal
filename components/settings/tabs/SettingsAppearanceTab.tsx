import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { applyCustomCssToDocument } from "../../../lib/customCss";
import { DebouncedTextarea } from "../DebouncedTextarea";
import { Check, Monitor, Moon, Palette, Search, Sun } from "lucide-react";
import { useI18n } from "../../../application/i18n/I18nProvider";
import {
  DARK_UI_THEMES,
  LIGHT_UI_THEMES,
  type UiThemePreset,
} from "../../../infrastructure/config/uiThemes";
import { useAvailableUIFonts } from "../../../application/state/uiFontStore";
import { SUPPORTED_UI_LOCALES } from "../../../infrastructure/config/i18n";
import { APP_ICON_VARIANT_ASSET_PATH, APP_ICON_VARIANT_GROUPS, APP_ICON_VARIANT_I18N_KEY } from "../../../infrastructure/config/appIconVariants";
import { resolveAppIconVariant, type AppIconVariant } from "../../../domain/appIconVariant";
import { resolveReadableForegroundForHsl } from "../../../domain/colorContrast";
import { cn } from "../../../lib/utils";
import { SectionHeader, SettingsTabContent, SettingRow, Toggle, Select } from "../settings-ui";
import { FontSelect } from "../FontSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import {
  filterUiThemesForPicker,
  resolveUiThemePickerScopeForSelection,
  type UiThemePickerScope,
} from "../uiThemePickerUtils";

function SettingsAppearanceTab(props: {
  theme: "dark" | "light" | "system";
  resolvedTheme: "dark" | "light";
  setTheme: (theme: "dark" | "light" | "system") => void;
  lightUiThemeId: string;
  setLightUiThemeId: (themeId: string) => void;
  darkUiThemeId: string;
  setDarkUiThemeId: (themeId: string) => void;
  accentMode: "theme" | "custom";
  setAccentMode: (mode: "theme" | "custom") => void;
  customAccent: string;
  setCustomAccent: (color: string) => void;
  uiFontFamilyId: string;
  setUiFontFamilyId: (fontId: string) => void;
  uiLanguage: string;
  setUiLanguage: (language: string) => void;
  customCSS: string;
  setCustomCSS: (css: string) => void;
  showRecentHosts: boolean;
  setShowRecentHosts: (enabled: boolean) => void;
  showOnlyUngroupedHostsInRoot: boolean;
  setShowOnlyUngroupedHostsInRoot: (enabled: boolean) => void;
  showSftpTab: boolean;
  setShowSftpTab: (enabled: boolean) => void;
  showHostTreeSidebar: boolean;
  setShowHostTreeSidebar: (enabled: boolean) => void;
  windowOpacity: number;
  setWindowOpacity: (opacity: number) => void;
  appIconVariant: AppIconVariant;
  setAppIconVariant: (variant: AppIconVariant) => void;
}) {
  const { t } = useI18n();
  const availableUIFonts = useAvailableUIFonts();
  const {
    theme,
    resolvedTheme,
    setTheme,
    lightUiThemeId,
    setLightUiThemeId,
    darkUiThemeId,
    setDarkUiThemeId,
    accentMode,
    setAccentMode,
    customAccent,
    setCustomAccent,
    uiFontFamilyId,
    setUiFontFamilyId,
    uiLanguage,
    setUiLanguage,
    customCSS,
    setCustomCSS,
    showRecentHosts,
    setShowRecentHosts,
    showOnlyUngroupedHostsInRoot,
    setShowOnlyUngroupedHostsInRoot,
    showSftpTab,
    setShowSftpTab,
    showHostTreeSidebar,
    setShowHostTreeSidebar,
    windowOpacity,
    setWindowOpacity,
    appIconVariant,
    setAppIconVariant,
  } = props;
  const resolvedAppIconVariant = resolveAppIconVariant(appIconVariant);

  const WINDOW_OPACITY_PRESETS = [
    { label: '100%', value: 1 },
    { label: '85%', value: 0.85 },
    { label: '70%', value: 0.7 },
  ] as const;

  const getHslStyle = useCallback((hsl: string) => ({ backgroundColor: `hsl(${hsl})` }), []);

  const hexToHsl = useCallback((hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }, []);

  const ACCENT_COLORS = [
    { name: "Sky", value: "199 89% 48%" },
    { name: "Blue", value: "221.2 83.2% 53.3%" },
    { name: "Indigo", value: "234 89% 62%" },
    { name: "Violet", value: "262.1 83.3% 57.8%" },
    { name: "Purple", value: "271 81% 56%" },
    { name: "Fuchsia", value: "292 84% 61%" },
    { name: "Pink", value: "330 81% 60%" },
    { name: "Rose", value: "346.8 77.2% 49.8%" },
    { name: "Red", value: "0 84.2% 60.2%" },
    { name: "Orange", value: "24.6 95% 53.1%" },
    { name: "Amber", value: "38 92% 50%" },
    { name: "Yellow", value: "48 96% 53%" },
    { name: "Lime", value: "84 81% 44%" },
    { name: "Green", value: "142.1 76.2% 36.3%" },
    { name: "Emerald", value: "160 84% 39%" },
    { name: "Teal", value: "173 80% 40%" },
    { name: "Cyan", value: "189 94% 43%" },
    { name: "Slate", value: "215 16% 47%" },
  ];

  const THEME_OPTIONS: { value: "light" | "system" | "dark"; icon: React.ReactNode; label: string }[] = [
    { value: "light", icon: <Sun size={14} />, label: t("settings.appearance.theme.light") },
    { value: "system", icon: <Monitor size={14} />, label: t("settings.appearance.theme.system") },
    { value: "dark", icon: <Moon size={14} />, label: t("settings.appearance.theme.dark") },
  ];

  const visibleUiThemes = resolvedTheme === "dark" ? DARK_UI_THEMES : LIGHT_UI_THEMES;
  const visibleUiThemeId = resolvedTheme === "dark" ? darkUiThemeId : lightUiThemeId;
  const setVisibleUiThemeId = resolvedTheme === "dark" ? setDarkUiThemeId : setLightUiThemeId;

  const [themeScope, setThemeScope] = useState<UiThemePickerScope>(() =>
    resolveUiThemePickerScopeForSelection(visibleUiThemes, visibleUiThemeId),
  );
  const [themeQuery, setThemeQuery] = useState("");

  // Only re-sync scope/search when light/dark flips; keep user filters while browsing.
  useEffect(() => {
    const themes = resolvedTheme === "dark" ? DARK_UI_THEMES : LIGHT_UI_THEMES;
    const selectedId = resolvedTheme === "dark" ? darkUiThemeId : lightUiThemeId;
    setThemeScope(resolveUiThemePickerScopeForSelection(themes, selectedId));
    setThemeQuery("");
    // Intentionally omit theme ids: selection changes should not reset filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mode flip only
  }, [resolvedTheme]);

  const filteredUiThemes = useMemo(
    () => filterUiThemesForPicker(visibleUiThemes, themeScope, themeQuery),
    [themeQuery, themeScope, visibleUiThemes],
  );

  const checkColorForHsl = useCallback((backgroundHsl: string) => {
    const fg = resolveReadableForegroundForHsl(backgroundHsl);
    return `hsl(${fg})`;
  }, []);

  const renderThemeCards = (
    options: UiThemePreset[],
    value: string,
    onChange: (next: string) => void,
  ) => (
    <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
      {options.map((preset) => {
        const selected = value === preset.id;
        const checkColor = checkColorForHsl(preset.tokens.background);
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            aria-pressed={selected}
            aria-label={preset.name}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary/70 ring-2 ring-primary/35 shadow-sm"
                : "border-border/70 hover:border-border hover:shadow-sm",
            )}
          >
            <div
              className="relative h-11 w-full border-b border-black/5 dark:border-white/5"
              style={getHslStyle(preset.tokens.background)}
            >
              <div className="absolute inset-x-2 bottom-2 flex items-center gap-1">
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-sm ring-1 ring-black/10 dark:ring-white/15"
                  style={getHslStyle(preset.tokens.primary)}
                />
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-sm ring-1 ring-black/10 dark:ring-white/15"
                  style={getHslStyle(preset.tokens.secondary)}
                />
                <span
                  className="h-2.5 flex-1 rounded-sm opacity-80 ring-1 ring-black/5 dark:ring-white/10"
                  style={getHslStyle(preset.tokens.card)}
                />
              </div>
              {selected && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary shadow-sm"
                >
                  <Check size={10} style={{ color: checkColorForHsl(preset.tokens.primary) }} strokeWidth={3} />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 bg-card px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                {preset.name}
              </span>
              {selected && (
                <span className="sr-only" style={{ color: checkColor }}>
                  selected
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderAccentSwatches = () => (
    <div className="flex flex-wrap gap-2">
      {ACCENT_COLORS.map((c) => {
        const selected = customAccent === c.value;
        return (
          <Tooltip key={c.name}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setCustomAccent(c.value)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full shadow-sm transition-all duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected
                    ? "scale-110 ring-2 ring-offset-2 ring-foreground"
                    : "hover:scale-105",
                )}
                style={getHslStyle(c.value)}
                aria-label={c.name}
              >
                {selected && (
                  <Check size={11} strokeWidth={3} style={{ color: checkColorForHsl(c.value) }} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{c.name}</TooltipContent>
          </Tooltip>
        );
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <label
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full shadow-sm transition-all duration-150",
              "bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500",
              "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
              !ACCENT_COLORS.some((c) => c.value === customAccent)
                ? "scale-110 ring-2 ring-offset-2 ring-foreground"
                : "hover:scale-105",
            )}
          >
            <input
              type="color"
              className="sr-only"
              onChange={(e) => setCustomAccent(hexToHsl(e.target.value))}
            />
            {!ACCENT_COLORS.some((c) => c.value === customAccent) ? (
              <Check size={11} strokeWidth={3} className="text-white drop-shadow-md" />
            ) : (
              <Palette size={12} className="text-white drop-shadow-md" />
            )}
          </label>
        </TooltipTrigger>
        <TooltipContent>{t("settings.appearance.customColor")}</TooltipContent>
      </Tooltip>
    </div>
  );

  return (
    <SettingsTabContent value="appearance">
      <SectionHeader title={t("settings.appearance.language")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.language")}
          description={t("settings.appearance.language.desc")}
        >
          <Select
            value={uiLanguage}
            options={SUPPORTED_UI_LOCALES.map((l) => ({ value: l.id, label: l.label }))}
            onChange={(v) => setUiLanguage(v)}
            className="w-40"
          />
        </SettingRow>
        <SettingRow
          label={t("settings.appearance.uiFont")}
          description={t("settings.appearance.uiFont.desc")}
        >
          <FontSelect
            value={uiFontFamilyId}
            fonts={availableUIFonts}
            onChange={(v) => setUiFontFamilyId(v)}
            className="w-48"
          />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.windowOpacity")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.windowOpacity")}
          description={t("settings.appearance.windowOpacity.desc")}
        >
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={50}
                max={100}
                step={1}
                value={Math.round(windowOpacity * 100)}
                onChange={(e) => setWindowOpacity(Number(e.target.value) / 100)}
                className="w-28 accent-primary"
              />
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {Math.round(windowOpacity * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {WINDOW_OPACITY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setWindowOpacity(preset.value)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    windowOpacity === preset.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.uiTheme")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow label={t("settings.appearance.theme")}>
          <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  theme === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
        </SettingRow>

        <div className="space-y-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {resolvedTheme === "dark"
                  ? t("settings.appearance.themeColor.dark")
                  : t("settings.appearance.themeColor.light")}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.appearance.themeColor.picker.desc")}
              </p>
            </div>
            <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
              {([
                { value: "core" as const, label: t("settings.appearance.themeColor.scope.core") },
                { value: "all" as const, label: t("settings.appearance.themeColor.scope.all") },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setThemeScope(opt.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    themeScope === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* One-tap color strip for core themes (White / Black / Claude / multi-color). */}
          {themeScope === "core" && !themeQuery.trim() && (
            <div className="flex flex-wrap gap-2">
              {(resolvedTheme === "dark" ? DARK_UI_THEMES : LIGHT_UI_THEMES)
                .filter((preset) => preset.collection === "core")
                .slice(0, 9)
                .map((preset) => {
                  const selected = visibleUiThemeId === preset.id;
                  return (
                    <Tooltip key={`quick-${preset.id}`}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setVisibleUiThemeId(preset.id)}
                          className={cn(
                            "group flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            selected
                              ? "border-primary bg-primary/10 text-foreground shadow-sm"
                              : "border-border/70 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground",
                          )}
                          aria-pressed={selected}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full shadow-sm ring-1 ring-black/10 dark:ring-white/15"
                            style={getHslStyle(preset.tokens.primary)}
                          />
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/15 shadow-sm"
                            style={getHslStyle(preset.tokens.background)}
                          />
                          <span className="max-w-[5.5rem] truncate">{preset.name}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{preset.name}</TooltipContent>
                    </Tooltip>
                  );
                })}
            </div>
          )}

          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={themeQuery}
              onChange={(e) => setThemeQuery(e.target.value)}
              placeholder={t("settings.appearance.themeColor.search.placeholder")}
              className={cn(
                "h-9 w-full rounded-md border border-input bg-background py-1 pl-8 pr-3 text-sm shadow-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            />
          </div>

          {filteredUiThemes.length > 0 ? (
            <div
              className="magiesTerminal-scroll-thin max-h-[22rem] overflow-y-auto overscroll-contain pr-0.5"
              data-magiesTerminal-scroll="thin"
            >
              {renderThemeCards(filteredUiThemes as UiThemePreset[], visibleUiThemeId, setVisibleUiThemeId)}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border/80 px-3 py-6 text-center text-xs text-muted-foreground">
              {t("settings.appearance.themeColor.search.empty")}
            </p>
          )}
        </div>

        <SettingRow
          label={t("settings.appearance.accentColor.mode")}
          description={t("settings.appearance.accentColor.mode.desc")}
        >
          <div className="flex items-center gap-2">
            <Toggle
              checked={accentMode === "custom"}
              onChange={(checked) => setAccentMode(checked ? "custom" : "theme")}
            />
          </div>
        </SettingRow>
        {accentMode === "custom" && (
          <div className="space-y-2 py-3">
            <div className="text-sm font-medium">{t("settings.appearance.accentColor.custom")}</div>
            {renderAccentSwatches()}
          </div>
        )}
      </div>

      <SectionHeader title={t("settings.appearance.appIcon")} />
      <div className="space-y-4 rounded-lg border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {t("settings.appearance.appIcon.desc")}
        </p>
        <div className="space-y-3">
          {APP_ICON_VARIANT_GROUPS.map((group) => (
            <div key={group.id} className="space-y-1.5">
              <span className="text-[11px] text-muted-foreground">{t(group.labelKey)}</span>
              <div className="flex flex-wrap gap-2">
                {group.variants.map((variant) => (
                  <Tooltip key={variant}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setAppIconVariant(variant)}
                        className={cn(
                          "relative h-11 w-11 overflow-hidden rounded-xl transition-all duration-150",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          resolvedAppIconVariant === variant
                            ? "scale-105 ring-2 ring-primary/50"
                            : "opacity-90 hover:scale-105 hover:opacity-100",
                        )}
                        aria-label={t(APP_ICON_VARIANT_I18N_KEY[variant])}
                      >
                        <img
                          src={APP_ICON_VARIANT_ASSET_PATH[variant]}
                          alt=""
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                        {resolvedAppIconVariant === variant && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                            <Check className="text-white drop-shadow-md" size={14} />
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t(APP_ICON_VARIANT_I18N_KEY[variant])}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <SectionHeader title={t("settings.vault.title")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t('settings.vault.showRecentHosts')}
          description={t('settings.vault.showRecentHostsDesc')}
        >
          <Toggle checked={showRecentHosts} onChange={setShowRecentHosts} />
        </SettingRow>
        <SettingRow
          label={t('settings.vault.showOnlyUngroupedHostsInRoot')}
          description={t('settings.vault.showOnlyUngroupedHostsInRootDesc')}
        >
          <Toggle
            checked={showOnlyUngroupedHostsInRoot}
            onChange={setShowOnlyUngroupedHostsInRoot}
          />
        </SettingRow>
        <SettingRow
          label={t('settings.vault.showSftpTab')}
          description={t('settings.vault.showSftpTabDesc')}
        >
          <Toggle checked={showSftpTab} onChange={setShowSftpTab} />
        </SettingRow>
        <SettingRow
          label={t('settings.vault.showHostTreeSidebar')}
          description={t('settings.vault.showHostTreeSidebarDesc')}
        >
          <Toggle checked={showHostTreeSidebar} onChange={setShowHostTreeSidebar} />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.customCss")} />
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("settings.appearance.customCss.desc")}
        </p>
        <DebouncedTextarea
          value={customCSS}
          onCommit={setCustomCSS}
          onDraftChange={applyCustomCssToDocument}
          placeholder={t("settings.appearance.customCss.placeholder")}
          className="h-32 w-full resize-y rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          spellCheck={false}
        />
      </div>
    </SettingsTabContent>
  );
}

export default memo(SettingsAppearanceTab);
