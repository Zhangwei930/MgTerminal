import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Database,
  FileCode,
  FolderSearch,
  Globe,
  KeyRound,
  Loader2,
  Network,
  Server,
  ShieldAlert,
  Slash,
  SquareTerminal,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useI18n } from '../../application/i18n/I18nProvider';

type ToolVisual = {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  plate: string;
  icon: string;
};

function resolveToolVisual(name: string, hasShellCommand: boolean): ToolVisual {
  const n = name.toLowerCase();
  // Checked before the shell branch: a SQL tool now yields a display command,
  // which would otherwise make it look like a terminal call.
  if (n.startsWith('db_') || n.includes('sql') || n.includes('database')) {
    return { Icon: Database, plate: 'bg-teal-500/12 border-teal-500/25', icon: 'text-teal-400' };
  }
  if (hasShellCommand || n.includes('terminal') || n.includes('shell') || n.includes('bash') || n.includes('exec')) {
    return { Icon: SquareTerminal, plate: 'bg-emerald-500/12 border-emerald-500/25', icon: 'text-emerald-400' };
  }
  if (n.includes('sftp') || n.includes('file') || n.includes('fs_')) {
    return { Icon: FolderSearch, plate: 'bg-sky-500/12 border-sky-500/25', icon: 'text-sky-400' };
  }
  if (n.includes('vault') || n.includes('host') || n.includes('note')) {
    return { Icon: Server, plate: 'bg-violet-500/12 border-violet-500/25', icon: 'text-violet-400' };
  }
  if (n.includes('snippet') || n.includes('script')) {
    return { Icon: FileCode, plate: 'bg-indigo-500/12 border-indigo-500/25', icon: 'text-indigo-400' };
  }
  if (n.includes('port') || n.includes('forward') || n.includes('proxy')) {
    return { Icon: Network, plate: 'bg-cyan-500/12 border-cyan-500/25', icon: 'text-cyan-400' };
  }
  if (n.includes('web') || n.includes('search') || n.includes('http')) {
    return { Icon: Globe, plate: 'bg-amber-500/12 border-amber-500/25', icon: 'text-amber-400' };
  }
  if (n.includes('key') || n.includes('auth') || n.includes('secret')) {
    return { Icon: KeyRound, plate: 'bg-rose-500/12 border-rose-500/25', icon: 'text-rose-400' };
  }
  if (n.includes('read') || n.includes('docs') || n.includes('skill')) {
    return { Icon: BookOpen, plate: 'bg-primary/12 border-primary/25', icon: 'text-primary' };
  }
  return { Icon: Wrench, plate: 'bg-muted/40 border-border/50', icon: 'text-muted-foreground' };
}

/**
 * Pull the user-meaningful shell command out of the tool-call args.
 *
 * Different tool surfaces hand us different shapes:
 *   - MagiesTerminal's own `terminal_execute` MCP tool → `{command: "<string>"}`
 *   - Codex `local_shell`                      → `{command: ["zsh","-lc","<full>"]}`
 *   - Codex command_execution (SDK)             → `{command: "/bin/zsh -lc '<full>'"}`
 *   - Claude `Bash`                             → `{command: "<string>"}`
 *
 * The SDK form is a STRING that wraps the real command in `<shell> -lc '<full>'`,
 * so we unwrap that wrapper too (the array branch already did the equivalent) —
 * otherwise the outer shell quotes leak into the title.
 *
 * And under the "Skill + CLI" integration, the agent's shell tool wraps a
 * call to our internal `magies-terminal-tool-cli` binary, so the real intent is one
 * level deeper:
 *
 *   magies-terminal-tool-cli exec --session <id> --chat-session <id> -- <real-cmd>
 *
 * We unwrap both layers so the chat panel shows what the user actually
 * cares about (the remote command), not Codex's wrapper title which is
 * just the local path to the CLI binary.
 */
/**
 * The prompt rendered before a display command. A SQL statement is not a shell
 * command, and in an approval card — where the point is understanding what you
 * are agreeing to — labelling one as the other is the wrong kind of wrong.
 */
export function displayCommandPrefix(args: Record<string, unknown> | undefined): string {
  if (!args) return '$ ';
  const command = (args as { command?: unknown }).command;
  const hasCommand = command !== undefined && command !== null && command !== '';
  if (!hasCommand && typeof (args as { sql?: unknown }).sql === 'string') return 'SQL ';
  return '$ ';
}

export function extractDisplayCommand(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  const raw = (args as { command?: unknown }).command;

  // A SQL tool carries its statement in `sql`, not `command`. Surface it the
  // same way: a statement that changes data should be readable in the card
  // title, not only in the Arguments JSON. Whitespace is collapsed because the
  // title is a single truncating line — the verbatim text stays in Arguments.
  if (raw === undefined || raw === null || raw === '') {
    const rawSql = (args as { sql?: unknown }).sql;
    if (typeof rawSql === 'string' && rawSql.trim()) {
      return rawSql.trim().replace(/\s+/g, ' ');
    }
  }

  let cmdString: string;
  if (typeof raw === 'string') {
    if (!raw) return null;
    cmdString = raw;
  } else if (Array.isArray(raw) && raw.length > 0) {
    const isShellWrap =
      raw.length >= 3 &&
      /(?:^|\/)(sh|bash|zsh|fish|ash|dash)$/.test(String(raw[0] ?? '')) &&
      /^-l?c$/.test(String(raw[1] ?? ''));
    cmdString = isShellWrap
      ? String(raw[raw.length - 1] ?? '')
      : raw.map((p) => String(p)).join(' ');
  } else {
    return null;
  }

  // Unwrap a STRING shell wrapper, e.g. Codex SDK's `/bin/zsh -lc '<full>'`.
  // The array branch above already extracts the inner command; the string form
  // (codex command_execution) does not, so strip `<shell> -l?c <quote>…<quote>`
  // here. Without this the outer quote leaks into the magiesTerminal-cli title below.
  const strWrap = cmdString.match(
    /^(?:\S*\/)?(?:sh|bash|zsh|fish|ash|dash)\s+-l?c\s+(['"])([\s\S]*)\1\s*$/,
  );
  if (strWrap) cmdString = strWrap[2];

  // MagiesTerminal CLI wrapper extraction.
  const cliIdx = cmdString.indexOf('magies-terminal-tool-cli');
  if (cliIdx >= 0) {
    const afterCli = cmdString
      .slice(cliIdx + 'magies-terminal-tool-cli'.length)
      .replace(/^["']?\s*/, '');
    const subMatch = afterCli.match(/^(\S+)/);
    const sub = subMatch ? subMatch[1] : '';

    if (sub === 'exec' || sub === 'job-start') {
      // Pull out the command after the ` -- ` separator.
      const dashIdx = afterCli.indexOf(' -- ');
      if (dashIdx >= 0) {
        let inner = afterCli.slice(dashIdx + 4).trim();
        if (
          inner.length >= 2 &&
          ((inner[0] === '"' && inner.endsWith('"')) ||
            (inner[0] === "'" && inner.endsWith("'")))
        ) {
          inner = inner.slice(1, -1);
        }
        return inner;
      }
    }
    if (sub === 'job-poll') return 'magiesTerminal: poll job';
    if (sub === 'job-stop') return 'magiesTerminal: stop job';
    if (sub === 'session') return 'magiesTerminal: inspect session';
    if (sub === 'env') return 'magiesTerminal: list sessions';
    if (sub === 'status') return 'magiesTerminal: status';
    if (sub) return `magiesTerminal: ${sub}`;
  }

  return cmdString;
}

/**
 * Format tool result for display. Extracts stdout/stderr from structured
 * command results for terminal-like output.
 */
function formatToolResult(result: unknown): string {
  let parsed = result;

  if (typeof parsed === 'string') {
    try {
      const obj = JSON.parse(parsed);
      if (obj && typeof obj === 'object') parsed = obj;
    } catch {
      return parsed;
    }
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.stdout === 'string' || typeof obj.stderr === 'string') {
      const parts: string[] = [];
      if (typeof obj.stdout === 'string' && obj.stdout) parts.push(obj.stdout);
      if (typeof obj.stderr === 'string' && obj.stderr) parts.push(obj.stderr);
      if (typeof obj.exitCode === 'number' && obj.exitCode !== 0) {
        parts.push(`exit code: ${obj.exitCode}`);
      }
      if (parts.length > 0) return parts.join('\n');
    }
  }

  if (typeof parsed === 'string') return parsed;
  return JSON.stringify(parsed, null, 2);
}

export interface ToolCallProps extends HTMLAttributes<HTMLDivElement> {
  name: string;
  className?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
  isLoading?: boolean;
  isInterrupted?: boolean;
  /** Approval state for this tool call (from the approval gate). */
  approvalStatus?: 'pending' | 'approved' | 'denied';
  /** Called when user approves this tool call. */
  onApprove?: () => void;
  /** Called when user rejects this tool call. */
  onReject?: () => void;
  /** Called when user approves once without persisting a grant rule. */
  onApproveOnce?: () => void;
  /** Called when user approves and persists an always-allow grant rule. */
  onAlwaysAllow?: () => void;
}

export const ToolCall = ({
  name, args, result, isError, isLoading, isInterrupted,
  approvalStatus, onApprove, onReject, onApproveOnce, onAlwaysAllow,
  className, ...props
}: ToolCallProps) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const approveBtnRef = useRef<HTMLButtonElement>(null);
  const [responded, setResponded] = useState(false);

  const isPendingApproval = approvalStatus === 'pending' && !responded;

  const handleApproveOnce = useCallback(() => {
    if (!isPendingApproval) return;
    setResponded(true);
    (onApproveOnce ?? onApprove)?.();
  }, [isPendingApproval, onApproveOnce, onApprove]);

  const handleAlwaysAllow = useCallback(() => {
    if (!isPendingApproval) return;
    setResponded(true);
    (onAlwaysAllow ?? onApprove)?.();
  }, [isPendingApproval, onAlwaysAllow, onApprove]);

  const handleReject = useCallback(() => {
    if (!isPendingApproval) return;
    setResponded(true);
    onReject?.();
  }, [isPendingApproval, onReject]);

  // Keyboard: Enter = approve, Escape = reject (when pending)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isPendingApproval) return;
    if (e.key === 'Enter') { e.preventDefault(); handleApproveOnce(); }
    else if (e.key === 'Escape') { e.preventDefault(); handleReject(); }
  }, [isPendingApproval, handleApproveOnce, handleReject]);

  // Auto-focus and auto-scroll when approval is pending
  useEffect(() => {
    if (isPendingApproval && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      // Small delay to let the UI render, then expand and focus
      setExpanded(true);
      setTimeout(() => approveBtnRef.current?.focus(), 100);
    }
  }, [isPendingApproval]);

  // Reset responded state when approvalStatus changes (e.g. new approval)
  useEffect(() => {
    if (approvalStatus === 'pending') setResponded(false);
  }, [approvalStatus]);

  const displayCmd = useMemo(() => extractDisplayCommand(args), [args]);
  const toolVisual = useMemo(
    () => resolveToolVisual(name, Boolean(displayCmd)),
    [name, displayCmd],
  );
  const ToolIcon = toolVisual.Icon;

  // Border/bg color based on approval status
  const borderClass = approvalStatus === 'pending'
    ? 'border-amber-500/40 bg-gradient-to-br from-amber-500/[0.1] to-amber-500/[0.03]'
    : approvalStatus === 'approved'
      ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] to-transparent'
      : approvalStatus === 'denied'
        ? 'border-red-500/30 bg-gradient-to-br from-red-500/[0.08] to-transparent'
        : 'border-border/50 bg-card/55';
  const statusIconClass = 'shrink-0';

  const statusIcon = approvalStatus === 'pending' ? (
    <span className="magiesTerminal-ai-icon-plate h-5 w-5 rounded-md border-amber-500/30 bg-amber-500/15">
      <ShieldAlert size={11} className={cn('text-amber-400', statusIconClass)} />
    </span>
  ) : isLoading ? (
    <span className="magiesTerminal-ai-icon-plate h-5 w-5 rounded-md border-sky-500/30 bg-sky-500/12">
      <Loader2 size={11} className={cn('animate-spin text-sky-400', statusIconClass)} />
    </span>
  ) : isInterrupted ? (
    <span className="magiesTerminal-ai-icon-plate h-5 w-5 rounded-md border-border/50 bg-muted/40">
      <Slash size={11} className={cn('text-muted-foreground/70', statusIconClass)} />
    </span>
  ) : isError ? (
    <span className="magiesTerminal-ai-icon-plate h-5 w-5 rounded-md border-red-500/30 bg-red-500/12">
      <XCircle size={11} className={cn('text-red-400', statusIconClass)} />
    </span>
  ) : result !== undefined ? (
    <span className="magiesTerminal-ai-icon-plate h-5 w-5 rounded-md border-emerald-500/30 bg-emerald-500/12">
      <CheckCircle2 size={11} className={cn('text-emerald-400', statusIconClass)} />
    </span>
  ) : null;

  return (
    <div
      ref={cardRef}
      tabIndex={isPendingApproval ? 0 : undefined}
      onKeyDown={isPendingApproval ? handleKeyDown : undefined}
      className={cn(
        'magiesTerminal-ai-card min-w-0 overflow-hidden text-[12px] outline-none',
        borderClass,
        className,
      )}
      {...props}
    >
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/20"
      >
        {expanded
          ? <ChevronDown size={12} className="text-primary/70 shrink-0" />
          : <ChevronRight size={12} className="text-muted-foreground/45 shrink-0" />
        }
        <span className={cn('magiesTerminal-ai-icon-plate h-7 w-7 rounded-lg border', toolVisual.plate)}>
          <ToolIcon size={14} className={toolVisual.icon} />
        </span>
        <div className="min-w-0 flex-1 text-left">
          {displayCmd ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block font-mono text-[12px] text-foreground/80 truncate cursor-default">
                  <span className="text-primary/60">{displayCommandPrefix(args)}</span>{displayCmd}
                </span>
              </TooltipTrigger>
              <TooltipContent>{displayCmd}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="block font-medium text-foreground/85 truncate">{name}</span>
          )}
          {displayCmd && (
            <span className="block truncate text-[10.5px] text-muted-foreground/50 font-mono">{name}</span>
          )}
        </div>
        {approvalStatus === 'approved' && (
          <Badge className="text-[10px] px-1.5 py-0 rounded-md bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-none">
            {t('ai.chat.toolApproved')}
          </Badge>
        )}
        {approvalStatus === 'denied' && (
          <Badge className="text-[10px] px-1.5 py-0 rounded-md bg-red-500/15 text-red-400 border-red-500/30 shadow-none">
            {t('ai.chat.toolDenied')}
          </Badge>
        )}
        {statusIcon}
      </button>

      {expanded && (
        <div className="border-t border-border/35 bg-muted/10">
          {args && Object.keys(args).length > 0 && (
            <div className="px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45 mb-1.5">Arguments</div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border/40 bg-background/50 px-2.5 py-2 text-[11px] font-mono text-muted-foreground/65 whitespace-pre [overflow-wrap:normal]">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {isPendingApproval && (
            <div className="min-w-0 border-t border-amber-500/25 bg-gradient-to-b from-amber-500/[0.08] to-transparent px-3 py-3">
              <div className="mb-2.5 flex items-start gap-2">
                <span className="magiesTerminal-ai-icon-plate mt-0.5 h-6 w-6 rounded-md border-amber-500/30 bg-amber-500/15">
                  <ShieldAlert size={12} className="text-amber-400" />
                </span>
                <p className="text-[11.5px] leading-snug text-foreground/70">
                  {t('ai.chat.toolApprovalHint')}
                </p>
              </div>
              <div className="flex w-full min-w-0 items-stretch gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-0 flex-1 gap-1 rounded-xl border-red-500/35 px-1.5 text-[11px] font-semibold text-red-400 hover:border-red-500/50 hover:bg-red-500/12 hover:text-red-300"
                  onClick={handleReject}
                >
                  <X size={12} className="shrink-0" />
                  <span className="truncate">{t('ai.chat.reject')}</span>
                </Button>
                <Button
                  ref={approveBtnRef}
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-0 flex-1 gap-1 rounded-xl border-emerald-500/35 px-1.5 text-[11px] font-semibold text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/12 hover:text-emerald-300"
                  onClick={handleApproveOnce}
                >
                  <Check size={12} className="shrink-0" />
                  <span className="truncate">{t('ai.chat.approveOnce')}</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 min-w-0 flex-1 gap-1 rounded-xl px-1.5 text-[11px] font-semibold shadow-sm shadow-primary/20"
                  onClick={handleAlwaysAllow}
                >
                  <Check size={12} className="shrink-0" />
                  <span className="truncate">{t('ai.chat.alwaysAllow')}</span>
                </Button>
              </div>
            </div>
          )}

          {result !== undefined && (
            <div className="px-3 py-2.5 border-t border-border/35">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45 mb-1.5">Result</div>
              <pre className={cn(
                'max-h-64 overflow-auto rounded-lg border px-2.5 py-2 text-[11px] font-mono whitespace-pre [overflow-wrap:normal]',
                isError
                  ? 'border-red-500/25 bg-red-500/[0.06] text-red-300/80'
                  : 'border-border/40 bg-background/50 text-muted-foreground/65',
              )}>
                {formatToolResult(result)}
              </pre>
            </div>
          )}
          {isInterrupted && result === undefined && (
            <div className="px-3 py-2.5 border-t border-border/35">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/45 mb-1.5">Status</div>
              <div className="text-[11px] text-muted-foreground/60">
                Interrupted
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
