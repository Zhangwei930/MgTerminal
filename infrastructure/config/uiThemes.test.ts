import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DARK_UI_THEMES,
  EXTENDED_DARK_UI_THEMES,
  EXTENDED_LIGHT_UI_THEMES,
  LIGHT_UI_THEMES,
  getUiThemeById,
} from "./uiThemes";
import { TERMINAL_THEMES } from "./terminalThemes";

const SYSTEM_PRESET_THEME_IDS = [
  "a-cup-of-coffee",
  "abolkog",
  "aurora",
  "ayu",
  "base16-flat",
  "base16-mocha",
  "blue-dolphin",
  "calm-days-sober-nights-sky",
  "catppuccin",
  "chai",
  "chinolor",
  "cyberdyne",
  "desert",
  "django-reborn-again",
  "espresso",
  "eyehealth",
  "flexoki",
  "fox",
  "garbage-oracle",
  "github",
  "gruvbox-material",
  "homebrew",
  "ic-orange-ppl",
  "ikki",
  "kanso-ink",
  "kary-pro-colors",
  "light-purple",
  "mondrian",
  "monochrome",
  "monochrome-stone",
  "monokai-pro-spectrum",
  "monospace",
  "noctis-azureus",
  "noctis-hibernus",
  "noir-essence",
  "nord-midnight",
  "notionish",
  "phonebook",
  "polychrome",
  "purplepeter",
  "rainglow-codecourse",
  "rainglow-crisp",
  "rainglow-lavender",
  "remedy-tilted",
  "rose-pine",
  "selene-selenized",
  "soft-color",
  "tearout",
  "tokyo-night",
  "tomorrow-night-eighties",
  "vaporizer-turquoise",
  "xotopio",
  "yuttari",
  "zenbones-rosebones",
  "zhxo-red",
];

describe("system preset UI themes", () => {
  it("adds every imported preset at the same level as the existing UI themes", () => {
    assert.deepEqual(EXTENDED_LIGHT_UI_THEMES.map((theme) => theme.id), SYSTEM_PRESET_THEME_IDS);
    assert.deepEqual(EXTENDED_DARK_UI_THEMES.map((theme) => theme.id), SYSTEM_PRESET_THEME_IDS);

    for (const id of SYSTEM_PRESET_THEME_IDS) {
      assert.equal(getUiThemeById("light", id).id, id);
      assert.equal(getUiThemeById("dark", id).id, id);
    }

    assert.equal(EXTENDED_LIGHT_UI_THEMES.length, 55);
    assert.equal(EXTENDED_DARK_UI_THEMES.length, 55);
    assert.equal(LIGHT_UI_THEMES.length, 8 + 55);
    assert.equal(DARK_UI_THEMES.length, 8 + 55);
    assert.equal([...LIGHT_UI_THEMES, ...DARK_UI_THEMES].filter((theme) => theme.collection !== undefined && theme.collection !== "core").length, 0);
  });

  it("keeps theme accents distinct from the original default blue", () => {
    const originalDefaultBlue = "221.2 83.2% 53.3%";
    const accents = new Set([
      ...EXTENDED_LIGHT_UI_THEMES.map((theme) => theme.tokens.accent),
      ...EXTENDED_DARK_UI_THEMES.map((theme) => theme.tokens.accent),
    ]);

    assert.ok(accents.size > 20);
    assert.ok(!accents.has(originalDefaultBlue));
  });

  it("marks every core light and dark preset with collection core", () => {
    for (const theme of LIGHT_UI_THEMES.slice(0, 8)) {
      assert.equal(theme.collection, "core", theme.id);
    }
    for (const theme of DARK_UI_THEMES.slice(0, 8)) {
      assert.equal(theme.collection, "core", theme.id);
    }
  });

  it("puts Claude orange first as the default core preset", () => {
    assert.equal(LIGHT_UI_THEMES[0]?.id, "claude-light");
    assert.equal(DARK_UI_THEMES[0]?.id, "claude");
    assert.equal(getUiThemeById("light", "claude-light").name, "Claude");
    assert.equal(getUiThemeById("dark", "claude").name, "Claude");
    // Black remains a first-class core option.
    assert.ok(DARK_UI_THEMES.some((theme) => theme.id === "pure-black"));
  });

  it("keeps default Claude themes with card elevated above background", () => {
    const light = getUiThemeById("light", "claude-light");
    const dark = getUiThemeById("dark", "claude");
    const lightBgL = Number(light.tokens.background.split(/\s+/)[2]?.replace("%", ""));
    const lightCardL = Number(light.tokens.card.split(/\s+/)[2]?.replace("%", ""));
    const darkBgL = Number(dark.tokens.background.split(/\s+/)[2]?.replace("%", ""));
    const darkCardL = Number(dark.tokens.card.split(/\s+/)[2]?.replace("%", ""));

    assert.ok(lightCardL > lightBgL, "claude-light card should be lighter than canvas");
    assert.ok(darkCardL > darkBgL, "claude card should be lighter than canvas");
  });

  it("keeps default Claude themes readable for body and primary chrome", async () => {
    const { getContrastRatio, getHslTokenRelativeLuminance } = await import(
      "../../domain/colorContrast.ts"
    );
    const contrast = (fg: string, bg: string) => {
      const fgL = getHslTokenRelativeLuminance(fg);
      const bgL = getHslTokenRelativeLuminance(bg);
      assert.ok(fgL != null && bgL != null, `invalid HSL tokens: ${fg} / ${bg}`);
      return getContrastRatio(fgL, bgL);
    };

    for (const [mode, id] of [
      ["light", "claude-light"],
      ["dark", "claude"],
      ["dark", "pure-black"],
    ] as const) {
      const tokens = getUiThemeById(mode, id).tokens;
      assert.ok(contrast(tokens.foreground, tokens.background) >= 7, `${id} body on canvas`);
      assert.ok(contrast(tokens.cardForeground, tokens.card) >= 7, `${id} body on card`);
      assert.ok(contrast(tokens.mutedForeground, tokens.background) >= 4.5, `${id} muted on canvas`);
      assert.ok(contrast(tokens.mutedForeground, tokens.muted) >= 4.5, `${id} muted on muted surface`);
      assert.ok(contrast(tokens.primaryForeground, tokens.primary) >= 4.0, `${id} primary label`);
      assert.ok(contrast(tokens.accentForeground, tokens.accent) >= 4.0, `${id} accent label`);
    }
  });

  it("aligns default follow-app terminal themes with Claude canvas", () => {
    const light = getUiThemeById("light", "claude-light").tokens;
    const dark = getUiThemeById("dark", "claude").tokens;
    const lightTerm = TERMINAL_THEMES.find((theme) => theme.id === "ui-claude-light");
    const darkTerm = TERMINAL_THEMES.find((theme) => theme.id === "ui-claude");
    assert.ok(lightTerm);
    assert.ok(darkTerm);

    // HSL → approx RGB; allow a small channel delta for hand-tuned ANSI palettes.
    const hslLightness = (token: string) => Number(token.split(/\s+/)[2]?.replace("%", ""));
    const hexLightness = (hex: string) => {
      const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
      const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
      const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
      return ((Math.max(r, g, b) + Math.min(r, g, b)) / 2) * 100;
    };

    assert.ok(
      Math.abs(hexLightness(lightTerm.colors.background) - hslLightness(light.background)) <= 3,
      "ui-claude-light background should track claude-light canvas lightness",
    );
    assert.ok(
      Math.abs(hexLightness(darkTerm.colors.background) - hslLightness(dark.background)) <= 3,
      "ui-claude background should track claude canvas lightness",
    );
  });

  it("adds matching terminal themes for every imported light and dark UI preset", () => {
    const terminalThemeIds = new Set(TERMINAL_THEMES.map((theme) => theme.id));
    assert.equal(terminalThemeIds.size, TERMINAL_THEMES.length);

    for (const id of SYSTEM_PRESET_THEME_IDS) {
      const lightTerminalTheme = TERMINAL_THEMES.find((theme) => theme.id === `system-${id}-light`);
      const darkTerminalTheme = TERMINAL_THEMES.find((theme) => theme.id === `system-${id}-dark`);

      assert.equal(lightTerminalTheme?.type, "light", id);
      assert.equal(darkTerminalTheme?.type, "dark", id);
    }
  });
});
