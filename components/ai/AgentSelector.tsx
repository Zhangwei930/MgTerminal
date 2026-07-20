/**
 * AgentSelector - Dropdown for switching between AI agents
 *
 * Dark, grouped agent menu with local SVG branding for built-in,
 * discovered, and external agents.
 */

import { ChevronDown, RefreshCw, Plus, Settings } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../application/i18n/I18nProvider';
import {
  getExternalAgentSdkBackend,
  isSettingsManagedDiscoveredAgent,
  matchesManagedAgentConfig,
} from '../../infrastructure/ai/managedAgents';
import type { AgentInfo, ExternalAgentConfig, DiscoveredAgent } from '../../infrastructure/ai/types';
import AgentIconBadge from './AgentIconBadge';
import {
  Dropdown,
  DropdownContent,
  DropdownTrigger,
} from '../ui/dropdown';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface AgentSelectorProps {
  currentAgentId: string;
  externalAgents: ExternalAgentConfig[];
  discoveredAgents?: DiscoveredAgent[];
  isDiscovering?: boolean;
  onSelectAgent: (agentId: string) => void;
  onEnableDiscoveredAgent?: (agent: DiscoveredAgent) => void;
  onRediscover?: () => void;
  onManageAgents?: () => void;
}

const BUILTIN_AGENTS: AgentInfo[] = [
  {
    id: 'magiesTerminal',
    name: 'MagiesTerminal Agent',
    type: 'builtin',
    description: 'Built-in terminal assistant',
    available: true,
  },
];

const SectionLabel: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/48">
      {children}
    </span>
    {action}
  </div>
);

const AgentMenuRow: React.FC<{
  agent: AgentInfo;
  isActive?: boolean;
  subtitle?: string;
  onClick: () => void;
}> = ({ agent, isActive, subtitle, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mx-1.5 flex h-11 w-[calc(100%-0.75rem)] items-center gap-3 rounded-xl px-2.5 text-left text-[13px] text-foreground/90 transition-colors cursor-pointer',
        'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30',
        isActive && 'bg-primary text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.5)] hover:bg-primary/92',
      )}
    >
      <AgentIconBadge agent={agent} size="sm" variant="plain" className={cn('opacity-95', isActive && 'brightness-110')} />
      <div className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{agent.name}</span>
        {subtitle && (
          <span className={cn('block truncate font-mono text-[10.5px]', isActive ? 'text-primary-foreground/70' : 'text-muted-foreground/50')}>{subtitle}</span>
        )}
      </div>
      {isActive && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary-foreground/90" />
      )}
    </button>
  );
};

const DiscoveredAgentRow: React.FC<{
  agent: DiscoveredAgent;
  onEnable: () => void;
}> = ({ agent, onEnable }) => {
  const { t } = useI18n();
  const agentLike: AgentInfo = {
    id: `discovered_${agent.command}`,
    name: agent.name,
    type: 'external',
    icon: agent.icon,
    command: agent.command,
    available: true,
  };

  return (
    <div className="mx-1.5 flex h-11 w-[calc(100%-0.75rem)] items-center gap-3 rounded-xl px-2.5 text-[13px]">
      <AgentIconBadge agent={agentLike} size="sm" variant="plain" className="opacity-90" />
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground/88">{agent.name}</span>
        <span className="block truncate font-mono text-[10.5px] text-muted-foreground/45">
          {agent.version || agent.path}
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onEnable}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2 text-[11px] font-medium text-primary transition-colors cursor-pointer hover:bg-primary/15"
          >
            <Plus size={12} />
            {t('ai.chat.enable')}
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.chat.enableAgent', { name: agent.name })}</TooltipContent>
      </Tooltip>
    </div>
  );
};

const AgentSelector: React.FC<AgentSelectorProps> = ({
  currentAgentId,
  externalAgents,
  discoveredAgents = [],
  isDiscovering = false,
  onSelectAgent,
  onEnableDiscoveredAgent,
  onRediscover,
  onManageAgents,
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const enabledExternalAgents = useMemo(
    () =>
      externalAgents
        .filter((agent) => agent.enabled && Boolean(getExternalAgentSdkBackend(agent)))
        .map(
          (agent): AgentInfo => ({
            id: agent.id,
            name: agent.name,
            type: 'external',
            icon: agent.icon,
            command: agent.command,
            args: agent.args,
            available: true,
          }),
        ),
    [externalAgents],
  );

  // Discovered agents not yet added to external agents
  const unconfiguredDiscovered = useMemo(
    () =>
      discoveredAgents.filter(
        (da) => {
          if (isSettingsManagedDiscoveredAgent(da)) {
            return !externalAgents.some((ea) => matchesManagedAgentConfig(ea, da.command));
          }
          return !externalAgents.some((ea) => ea.command === da.command || ea.command === da.path);
        },
      ),
    [discoveredAgents, externalAgents],
  );

  const allAgents = useMemo(
    () => [...BUILTIN_AGENTS, ...enabledExternalAgents],
    [enabledExternalAgents],
  );

  const currentAgent = useMemo(
    () => allAgents.find((agent) => agent.id === currentAgentId) ?? BUILTIN_AGENTS[0],
    [allAgents, currentAgentId],
  );

  const handleSelect = useCallback(
    (agentId: string) => {
      onSelectAgent(agentId);
      setOpen(false);
    },
    [onSelectAgent],
  );

  const handleEnableDiscovered = useCallback(
    (agent: DiscoveredAgent) => {
      onEnableDiscoveredAgent?.(agent);
      // After enabling, auto-select it
      const agentId = `discovered_${agent.command}`;
      onSelectAgent(agentId);
      setOpen(false);
    },
    [onEnableDiscoveredAgent, onSelectAgent],
  );

  const handleManageAgents = useCallback(() => {
    setOpen(false);
    onManageAgents?.();
  }, [onManageAgents]);

  return (
    <Dropdown open={open} onOpenChange={setOpen}>
      <DropdownTrigger asChild>
        <button
          type="button"
          className={cn(
            'group flex h-8 min-w-0 max-w-[220px] items-center gap-2 rounded-xl border border-border/50 bg-background/70 px-2.5 text-left',
            'shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_hsl(var(--foreground)/0.04)] transition-colors',
            'hover:border-primary/30 hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
            open && 'border-primary/40 bg-primary/[0.1] shadow-[0_0_0_1px_hsl(var(--primary)/0.12)]',
          )}
        >
          <AgentIconBadge
            agent={currentAgent}
            size="xs"
            variant="plain"
            className="opacity-95"
          />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
            {currentAgent.name}
          </span>
          <ChevronDown
            size={12}
            className={cn(
              'shrink-0 text-muted-foreground/60 transition-transform',
              open && 'rotate-180 text-primary',
            )}
          />
        </button>
      </DropdownTrigger>

      <DropdownContent
        align="start"
        sideOffset={6}
        className="w-[300px] overflow-hidden rounded-2xl border border-border/55 bg-popover/95 p-1.5 text-foreground shadow-xl supports-[backdrop-filter]:backdrop-blur-sm"
      >
        {BUILTIN_AGENTS.map((agent) => (
          <AgentMenuRow
            key={agent.id}
            agent={agent}
            isActive={currentAgentId === agent.id}
            onClick={() => handleSelect(agent.id)}
          />
        ))}

        {enabledExternalAgents.length > 0 && (
          <>
            <div className="mx-2 my-1.5 border-t border-border/40" />
            <SectionLabel>{t('ai.chat.agents')}</SectionLabel>
            {enabledExternalAgents.map((agent) => (
              <AgentMenuRow
                key={agent.id}
                agent={agent}
                isActive={currentAgentId === agent.id}
                subtitle={agent.command}
                onClick={() => handleSelect(agent.id)}
              />
            ))}
          </>
        )}

        {unconfiguredDiscovered.length > 0 && (
          <>
            <div className="mx-2 my-1.5 border-t border-border/40" />
            <SectionLabel
              action={
                onRediscover && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={onRediscover}
                        disabled={isDiscovering}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/45 transition-colors cursor-pointer hover:bg-muted/40 hover:text-muted-foreground/75 disabled:opacity-50"
                      >
                        <RefreshCw size={11} className={cn(isDiscovering && 'animate-spin')} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t('ai.chat.rescan')}</TooltipContent>
                  </Tooltip>
                )
              }
            >
              {t('ai.chat.detectedOnMachine')}
            </SectionLabel>
            {unconfiguredDiscovered.map((agent) => (
              <DiscoveredAgentRow
                key={agent.command}
                agent={agent}
                onEnable={() => handleEnableDiscovered(agent)}
              />
            ))}
          </>
        )}

        <div className="mx-1.5 my-1.5 border-t border-border/45" />
        <button
          type="button"
          onClick={handleManageAgents}
          className="mx-1.5 flex h-10 w-[calc(100%-0.75rem)] items-center gap-3 rounded-xl px-2.5 text-left text-[13px] text-foreground/82 transition-colors cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/45 bg-muted/30">
            <Settings size={14} className="opacity-75" />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{t('ai.agentSettings')}</span>
        </button>
      </DropdownContent>
    </Dropdown>
  );
};

export default React.memo(AgentSelector);
