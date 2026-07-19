import type { TerminalTheme } from '../../domain/models';

export const TERMINAL_APPEARANCE_VAR_KEYS = [
  '--mg-term-bg',
  '--mg-term-fg',
  '--mg-term-cursor',
  '--mg-term-border',
  '--mg-term-muted',
  '--mg-term-hover',
  '--mg-term-active',
  '--mg-term-panel-bg',
  '--mg-term-panel-fg',
  '--mg-term-panel-muted',
  '--mg-term-panel-border',
  '--mg-term-panel-hover',
  '--mg-term-panel-active',
  '--mg-term-host-tree-bg',
  '--mg-term-host-tree-fg',
  '--mg-term-host-tree-muted',
  '--mg-term-host-tree-separator',
  '--mg-term-host-tree-hover-bg',
  '--mg-term-host-tree-active-bg',
  '--mg-term-host-tree-drop-bg',
  '--mg-term-host-tree-folder-fg',
  '--mg-term-tabs-bg',
  '--mg-term-tabs-fg',
  '--mg-term-tabs-muted',
  '--mg-term-tabs-active-bg',
  '--mg-term-tabs-accent',
  '--mg-term-toolbar-btn',
  '--mg-term-toolbar-btn-hover',
  '--mg-term-toolbar-btn-active',
] as const;

export type TerminalAppearanceCssVarKey = (typeof TERMINAL_APPEARANCE_VAR_KEYS)[number];
export type TerminalAppearanceCssVars = Record<TerminalAppearanceCssVarKey, string>;

function mix(fg: string, bg: string, fgPercent: number): string {
  return `color-mix(in srgb, ${fg} ${fgPercent}%, ${bg} ${100 - fgPercent}%)`;
}

export function buildTerminalAppearanceCssVars(theme: TerminalTheme): TerminalAppearanceCssVars {
  const bg = theme.colors.background;
  const fg = theme.colors.foreground;
  const cursor = theme.colors.cursor;
  const muted = mix(fg, bg, 58);
  const hover = mix(fg, bg, 12);
  const active = mix(fg, bg, 16);
  const border = mix(fg, bg, 12);
  const panelMuted = mix(fg, bg, 58);
  const panelHover = mix(fg, bg, 12);
  const panelActive = mix(fg, bg, 16);
  const panelBorder = mix(fg, bg, 12);
  const hostMuted = mix(fg, bg, 55);
  const hostSeparator = mix(fg, bg, 10);
  const hostHover = mix(fg, bg, 8);
  const hostActive = mix(fg, bg, 14);
  const hostDrop = mix(fg, bg, 20);
  const hostFolder = mix(fg, bg, 75);
  const toolbarBtn = mix(bg, fg, 12);
  const toolbarBtnHover = mix(bg, fg, 22);
  const toolbarBtnActive = mix(cursor, bg, 22);

  return {
    '--mg-term-bg': bg,
    '--mg-term-fg': fg,
    '--mg-term-cursor': cursor,
    '--mg-term-border': border,
    '--mg-term-muted': muted,
    '--mg-term-hover': hover,
    '--mg-term-active': active,
    '--mg-term-panel-bg': bg,
    '--mg-term-panel-fg': fg,
    '--mg-term-panel-muted': panelMuted,
    '--mg-term-panel-border': panelBorder,
    '--mg-term-panel-hover': panelHover,
    '--mg-term-panel-active': panelActive,
    '--mg-term-host-tree-bg': bg,
    '--mg-term-host-tree-fg': fg,
    '--mg-term-host-tree-muted': hostMuted,
    '--mg-term-host-tree-separator': hostSeparator,
    '--mg-term-host-tree-hover-bg': hostHover,
    '--mg-term-host-tree-active-bg': hostActive,
    '--mg-term-host-tree-drop-bg': hostDrop,
    '--mg-term-host-tree-folder-fg': hostFolder,
    '--mg-term-tabs-bg': hover,
    '--mg-term-tabs-fg': fg,
    '--mg-term-tabs-muted': muted,
    '--mg-term-tabs-active-bg': bg,
    '--mg-term-tabs-accent': cursor,
    '--mg-term-toolbar-btn': toolbarBtn,
    '--mg-term-toolbar-btn-hover': toolbarBtnHover,
    '--mg-term-toolbar-btn-active': toolbarBtnActive,
  };
}

export type HostTreeThemeColors = {
  termBg: string;
  termFg: string;
  mutedFg: string;
  separator: string;
  rowHoverBg: string;
  rowActiveBg: string;
  rowDropBg: string;
  folderFg: string;
};

export type SidePanelChromeTheme = {
  termBg: string;
  termFg: string;
  mutedFg: string;
  separator: string;
  accent: string;
};

export function buildSidePanelChromeThemeFromTerminalTheme(theme: TerminalTheme): SidePanelChromeTheme {
  const bg = theme.colors.background;
  const fg = theme.colors.foreground;
  return {
    termBg: bg,
    termFg: fg,
    mutedFg: mix(fg, bg, 58),
    separator: mix(fg, bg, 12),
    accent: theme.colors.cursor,
  };
}

export function buildHostTreeThemeFromTerminalTheme(theme: TerminalTheme): HostTreeThemeColors {
  const bg = theme.colors.background;
  const fg = theme.colors.foreground;
  return {
    termBg: bg,
    termFg: fg,
    mutedFg: mix(fg, bg, 55),
    separator: mix(fg, bg, 10),
    rowHoverBg: mix(fg, bg, 8),
    rowActiveBg: mix(fg, bg, 14),
    rowDropBg: mix(fg, bg, 20),
    folderFg: mix(fg, bg, 75),
  };
}

export const terminalAppearancePanelStyle = {
  backgroundColor: 'var(--mg-term-panel-bg, var(--background))',
  color: 'var(--mg-term-panel-fg, var(--foreground))',
  borderColor: 'var(--mg-term-panel-border, var(--border))',
} as const;

export const terminalAppearanceSidePanelStyle = {
  ['--terminal-sidepanel-bg' as const]: 'var(--mg-term-panel-bg, var(--background))',
  ['--terminal-sidepanel-fg' as const]: 'var(--mg-term-panel-fg, var(--foreground))',
  ['--terminal-sidepanel-accent' as const]: 'var(--mg-term-cursor, var(--accent))',
  ['--terminal-sidepanel-muted' as const]: 'var(--mg-term-panel-muted, var(--muted-foreground))',
  ['--terminal-sidepanel-border' as const]: 'var(--mg-term-panel-border, var(--border))',
  backgroundColor: 'var(--mg-term-panel-bg, var(--background))',
  color: 'var(--mg-term-panel-fg, var(--foreground))',
  borderColor: 'var(--mg-term-panel-border, var(--border))',
} as const;

export const terminalAppearanceThemePanelVars = {
  ['--terminal-panel-bg' as const]: 'var(--mg-term-panel-bg, var(--background))',
  ['--terminal-panel-fg' as const]: 'var(--mg-term-panel-fg, var(--foreground))',
  ['--terminal-panel-muted' as const]: 'var(--mg-term-panel-muted, var(--muted-foreground))',
  ['--terminal-panel-border' as const]: 'var(--mg-term-panel-border, var(--border))',
  ['--terminal-panel-hover' as const]: 'var(--mg-term-panel-hover, var(--accent))',
  ['--terminal-panel-active' as const]: 'var(--mg-term-panel-active, var(--accent))',
} as const;

export const terminalAppearanceHostTreeTheme = {
  termBg: 'var(--mg-term-host-tree-bg, var(--mg-term-bg, var(--background)))',
  termFg: 'var(--mg-term-host-tree-fg, var(--mg-term-fg, var(--foreground)))',
  mutedFg: 'var(--mg-term-host-tree-muted, var(--mg-term-muted, var(--muted-foreground)))',
  separator: 'var(--mg-term-host-tree-separator, var(--mg-term-border, var(--border)))',
  rowHoverBg: 'var(--mg-term-host-tree-hover-bg, var(--mg-term-hover, transparent))',
  rowActiveBg: 'var(--mg-term-host-tree-active-bg, var(--mg-term-active, transparent))',
  rowDropBg: 'var(--mg-term-host-tree-drop-bg, var(--mg-term-active, transparent))',
  folderFg: 'var(--mg-term-host-tree-folder-fg, var(--mg-term-fg, var(--foreground)))',
} as const;
