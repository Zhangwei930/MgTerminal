// First-run productization helpers: onboarding steps + first-connection tips.

export const ONBOARDING_STEP_IDS = ["addHost", "connect", "explore"] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export const FIRST_CONNECTION_TIP_IDS = [
  "openSftp",
  "saveWorkspace",
  "sessionRestore",
  "createSnippet",
] as const;
export type FirstConnectionTipId = (typeof FIRST_CONNECTION_TIP_IDS)[number];

export const isOnboardingComplete = (value: unknown): boolean => value === true || value === "true";

export const pickFirstConnectionTips = (count = 3): FirstConnectionTipId[] =>
  FIRST_CONNECTION_TIP_IDS.slice(0, Math.max(0, count));

/** Command-palette action catalog (searchable settings / actions / help). */
export type CommandPaletteActionId =
  | "open-settings"
  | "new-host"
  | "import-hosts"
  | "run-host-health"
  | "local-terminal";

export interface CommandPaletteAction {
  id: CommandPaletteActionId;
  /** i18n key for the label */
  labelKey: string;
  /** Optional keywords used for free-text match (English stems) */
  keywords: string[];
}

export const COMMAND_PALETTE_ACTIONS: CommandPaletteAction[] = [
  {
    id: "open-settings",
    labelKey: "qs.command.openSettings",
    keywords: ["settings", "preferences", "config", "选项", "设置"],
  },
  {
    id: "new-host",
    labelKey: "qs.command.newHost",
    keywords: ["new host", "add host", "ssh", "新建", "主机"],
  },
  {
    id: "import-hosts",
    labelKey: "qs.command.importHosts",
    keywords: ["import", "migrate", "ssh config", "导入", "迁移"],
  },
  {
    id: "run-host-health",
    labelKey: "qs.command.hostHealth",
    keywords: ["health", "batch check", "latency", "健康", "检查"],
  },
  {
    id: "local-terminal",
    labelKey: "qs.command.localTerminal",
    keywords: ["local", "shell", "terminal", "本地", "终端"],
  },
];

export const filterCommandPaletteActions = (
  query: string,
  actions: CommandPaletteAction[] = COMMAND_PALETTE_ACTIONS,
): CommandPaletteAction[] => {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter((action) => {
    if (action.id.includes(q)) return true;
    if (action.labelKey.toLowerCase().includes(q)) return true;
    return action.keywords.some((keyword) => keyword.toLowerCase().includes(q) || q.includes(keyword.toLowerCase()));
  });
};
