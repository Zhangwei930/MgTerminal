/**
 * ToolCallGroup - Collapsible container for grouped tool calls.
 *
 * Groups consecutive tool-call messages into a single collapsible section
 * (Codex-style). While the agent is still working the group stays expanded;
 * once the assistant responds it auto-collapses to "Used N tools".
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { cn } from '../../lib/utils';

interface ToolCallGroupProps {
  count: number;
  children: React.ReactNode;
  /** When true the group starts expanded (e.g. while streaming). */
  defaultExpanded?: boolean;
}

const ToolCallGroup: React.FC<ToolCallGroupProps> = ({
  count,
  children,
  defaultExpanded = false,
}) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const prevDefault = useRef(defaultExpanded);

  // Auto-collapse when the group transitions from "active" to "resolved"
  useEffect(() => {
    if (prevDefault.current && !defaultExpanded) {
      setExpanded(false);
    }
    prevDefault.current = defaultExpanded;
  }, [defaultExpanded]);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card/50 shadow-[0_2px_10px_-6px_hsl(var(--foreground)/0.12),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 text-xs cursor-pointer',
          'hover:bg-muted/30 transition-colors select-none',
        )}
      >
        {expanded
          ? <ChevronDown size={12} className="text-primary/70 shrink-0" />
          : <ChevronRight size={12} className="text-muted-foreground/50 shrink-0" />
        }
        <span className="text-foreground/75 font-semibold tracking-wide">
          {t('ai.chat.usedTools', { n: count })}
        </span>
        <span className="ml-auto rounded-full border border-primary/15 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary">
          {count}
        </span>
      </button>
      {expanded && (
        <div className="space-y-1.5 border-t border-border/35 bg-muted/10 p-2">
          {children}
        </div>
      )}
    </div>
  );
};

export default ToolCallGroup;
