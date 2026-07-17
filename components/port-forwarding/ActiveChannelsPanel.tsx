import { Activity } from "lucide-react";
import React, { useMemo } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import type { PortForwardChannel, PortForwardingRule } from "../../domain/models";
import {
  filterChannelsByRuleId,
  formatByteCount,
  formatChannelDuration,
  sortChannelsByOpenedAt,
} from "../../domain/portForwardChannels";
import { cn } from "../../lib/utils";

export type ActiveChannelsPanelProps = {
  channels: PortForwardChannel[];
  rules: PortForwardingRule[];
  /** When set, only show channels for this rule; null = all. */
  filterRuleId?: string | null;
  className?: string;
};

export const ActiveChannelsPanel: React.FC<ActiveChannelsPanelProps> = ({
  channels,
  rules,
  filterRuleId = null,
  className,
}) => {
  const { t } = useI18n();
  const ruleLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const rule of rules) {
      map.set(rule.id, rule.label);
    }
    return map;
  }, [rules]);

  const rows = useMemo(
    () => sortChannelsByOpenedAt(filterChannelsByRuleId(channels, filterRuleId)),
    [channels, filterRuleId],
  );

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-border/60 bg-card/40 px-3 py-3", className)}>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Activity size={14} />
          {t("portForward.channels.title")}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {t("portForward.channels.empty")}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border border-border/60 bg-card/40 overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 text-xs font-medium">
        <Activity size={14} className="text-primary" />
        {t("portForward.channels.title")}
        <span className="text-muted-foreground font-normal">
          ({t("portForward.channels.count", { count: rows.length })})
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-card/95 text-muted-foreground">
            <tr className="border-b border-border/40">
              <th className="text-left font-medium px-2 py-1.5">{t("portForward.channels.col.rule")}</th>
              <th className="text-left font-medium px-2 py-1.5">{t("portForward.channels.col.source")}</th>
              <th className="text-left font-medium px-2 py-1.5">{t("portForward.channels.col.destination")}</th>
              <th className="text-right font-medium px-2 py-1.5">{t("portForward.channels.col.in")}</th>
              <th className="text-right font-medium px-2 py-1.5">{t("portForward.channels.col.out")}</th>
              <th className="text-right font-medium px-2 py-1.5">{t("portForward.channels.col.duration")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((channel) => (
              <tr
                key={channel.id}
                className="border-b border-border/30 last:border-0 hover:bg-secondary/40"
              >
                <td className="px-2 py-1.5 truncate max-w-[100px]" title={channel.ruleId}>
                  {channel.ruleId
                    ? (ruleLabelById.get(channel.ruleId) || channel.ruleId.slice(0, 8))
                    : "—"}
                  <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                    {channel.type}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono truncate max-w-[120px]" title={channel.source}>
                  {channel.source}
                </td>
                <td className="px-2 py-1.5 font-mono truncate max-w-[120px]" title={channel.destination}>
                  {channel.destination}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {formatByteCount(channel.bytesIn)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                  {formatByteCount(channel.bytesOut)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatChannelDuration(channel.openedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
