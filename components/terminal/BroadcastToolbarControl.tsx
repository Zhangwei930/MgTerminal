import { ChevronDown, Radio } from "lucide-react";
import React, { useMemo } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import {
  resolveBroadcastTargets,
  type BroadcastConfig,
  type BroadcastScope,
  type BroadcastSessionRef,
} from "../../domain/broadcastTargets";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type BroadcastSessionOption = {
  id: string;
  label: string;
  groupPath?: string;
};

export type BroadcastToolbarControlProps = {
  enabled: boolean;
  onToggle: () => void;
  config: BroadcastConfig;
  onUpdateConfig: (patch: Partial<BroadcastConfig>) => void;
  /** Sessions available for selection/exclude (typically current workspace). */
  sessionOptions: BroadcastSessionOption[];
  /** Source session for target-count preview. */
  sourceSessionId: string;
  sourceGroupPath?: string;
  /** All sessions used for window-scope resolution. */
  allSessionRefs: BroadcastSessionRef[];
};

const SCOPES: BroadcastScope[] = ["workspace", "selected", "group", "window"];

export const BroadcastToolbarControl: React.FC<BroadcastToolbarControlProps> = ({
  enabled,
  onToggle,
  config,
  onUpdateConfig,
  sessionOptions,
  sourceSessionId,
  sourceGroupPath,
  allSessionRefs,
}) => {
  const { t } = useI18n();

  const targetCount = useMemo(() => {
    if (!enabled) return 0;
    return resolveBroadcastTargets({
      sourceSessionId,
      sessions: allSessionRefs,
      config: { ...config, enabled: true },
      sourceGroupPath,
      includeSource: true,
    }).length;
  }, [allSessionRefs, config, enabled, sourceGroupPath, sourceSessionId]);

  const toggleIdInList = (list: string[], id: string, checked: boolean): string[] => {
    if (checked) return list.includes(id) ? list : [...list, id];
    return list.filter((entry) => entry !== id);
  };

  const scopeLabel = (scope: BroadcastScope): string => {
    switch (scope) {
      case "selected":
        return t("terminal.toolbar.broadcastScope.selected");
      case "group":
        return t("terminal.toolbar.broadcastScope.group");
      case "window":
        return t("terminal.toolbar.broadcastScope.window");
      case "workspace":
      default:
        return t("terminal.toolbar.broadcastScope.workspace");
    }
  };

  return (
    <div className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className={cn(
              "h-6 w-6 p-0 shadow-none border-none text-[color:var(--terminal-toolbar-fg)]",
              "bg-transparent hover:bg-transparent",
              enabled && "text-green-500",
            )}
            onClick={onToggle}
            aria-label={
              enabled
                ? t("terminal.toolbar.broadcastDisable")
                : t("terminal.toolbar.broadcastEnable")
            }
          >
            <Radio size={12} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {enabled
            ? t("terminal.toolbar.broadcastDisable")
            : t("terminal.toolbar.broadcastEnable")}
          {enabled && targetCount > 0
            ? ` · ${t("terminal.toolbar.broadcastTargetCount", { count: targetCount })}`
            : ""}
        </TooltipContent>
      </Tooltip>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className={cn(
              "h-6 w-4 p-0 shadow-none border-none text-[color:var(--terminal-toolbar-fg)]",
              "bg-transparent hover:bg-transparent",
              enabled && "text-green-500",
            )}
            aria-label={t("terminal.toolbar.broadcastTargets")}
          >
            <ChevronDown size={10} />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          className="w-64 p-2 space-y-2"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="text-[11px] font-medium text-foreground px-1">
            {t("terminal.toolbar.broadcastTargets")}
            {enabled ? (
              <span className="ml-1 text-muted-foreground font-normal">
                ({t("terminal.toolbar.broadcastTargetCount", { count: targetCount })})
              </span>
            ) : null}
          </div>

          <div className="space-y-0.5">
            {SCOPES.map((scope) => (
              <label
                key={scope}
                className={cn(
                  "flex items-center gap-2 px-1.5 py-1 rounded-sm text-xs cursor-pointer",
                  "hover:bg-muted",
                  config.scope === scope && "bg-muted/70",
                )}
              >
                <input
                  type="radio"
                  name="broadcast-scope"
                  className="accent-primary"
                  checked={config.scope === scope}
                  onChange={() => onUpdateConfig({ scope })}
                />
                <span>{scopeLabel(scope)}</span>
              </label>
            ))}
          </div>

          {config.scope === "selected" && (
            <div className="border-t border-border/60 pt-2 space-y-1 max-h-40 overflow-y-auto">
              <div className="text-[10px] text-muted-foreground px-1">
                {t("terminal.toolbar.broadcastSelectSessions")}
              </div>
              {sessionOptions.length === 0 ? (
                <div className="text-[10px] text-muted-foreground px-1 py-1">
                  {t("terminal.toolbar.broadcastNoSessions")}
                </div>
              ) : (
                sessionOptions.map((option) => {
                  const checked = config.selectedSessionIds.includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className="flex items-center gap-2 px-1.5 py-1 rounded-sm text-xs cursor-pointer hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={checked}
                        onChange={(event) =>
                          onUpdateConfig({
                            selectedSessionIds: toggleIdInList(
                              config.selectedSessionIds,
                              option.id,
                              event.target.checked,
                            ),
                          })
                        }
                      />
                      <span className="truncate">{option.label}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}

          {(config.scope === "workspace" || config.scope === "group" || config.scope === "window") && (
            <div className="border-t border-border/60 pt-2 space-y-1 max-h-40 overflow-y-auto">
              <div className="text-[10px] text-muted-foreground px-1">
                {t("terminal.toolbar.broadcastExcludeSessions")}
              </div>
              {sessionOptions.map((option) => {
                const checked = config.excludeSessionIds.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className="flex items-center gap-2 px-1.5 py-1 rounded-sm text-xs cursor-pointer hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={checked}
                      onChange={(event) =>
                        onUpdateConfig({
                          excludeSessionIds: toggleIdInList(
                            config.excludeSessionIds,
                            option.id,
                            event.target.checked,
                          ),
                        })
                      }
                    />
                    <span className="truncate">{option.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
