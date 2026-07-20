/**
 * ThinkingBlock - Collapsible thinking/reasoning display
 *
 * - While streaming: expanded, "Thinking" label with shimmer + elapsed time
 * - When done: auto-collapses to "Thought for Xs", click to expand
 * - Content area has max-height with scroll and top gradient fade
 */

import { Brain, ChevronRight } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { cn } from '../../lib/utils';
import { AiSquareSpinner } from './AiActivityIndicator';

interface ThinkingBlockProps {
  content: string;
  isStreaming: boolean;
  durationMs?: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
  content,
  isStreaming,
  durationMs,
}) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  const [elapsed, setElapsed] = useState(0);
  const wasStreamingRef = useRef(false);
  const startRef = useRef(Date.now());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setIsExpanded(false);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming) {
      setIsExpanded(true);
      startRef.current = Date.now();
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) return;
    const timer = setInterval(() => {
      setElapsed(Date.now() - startRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isStreaming, isExpanded]);

  const toggle = useCallback(() => setIsExpanded((e) => !e), []);

  const displayDuration = durationMs || elapsed;
  const preview = content.length > 72 ? `${content.slice(0, 72)}…` : content;

  return (
    <div
      className={cn(
        'rounded-2xl border transition-colors shadow-sm',
        isStreaming
          ? 'border-violet-500/30 bg-gradient-to-br from-violet-500/[0.1] to-violet-500/[0.03] shadow-violet-500/10'
          : 'border-border/45 bg-muted/20',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isExpanded}
        aria-controls="thinking-block-content"
        className="group flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer rounded-2xl hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
      >
        <span
          className={cn(
            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
            isStreaming
              ? 'border-violet-500/30 bg-violet-500/15 text-violet-400'
              : 'border-border/50 bg-muted/40 text-muted-foreground/70',
          )}
        >
          <Brain size={11} />
        </span>
        <ChevronRight
          size={12}
          className={cn(
            'shrink-0 text-muted-foreground/45 transition-transform duration-200',
            isExpanded && 'rotate-90',
          )}
        />
        {isStreaming ? (
          <span className="inline-flex min-w-0 items-center gap-2">
            <AiSquareSpinner size="sm" tone="violet" />
            <span className="thinking-shimmer thinking-shimmer--primary whitespace-nowrap text-[12px] font-medium">
              {t('ai.chat.thinking')}
            </span>
          </span>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[12px] font-medium text-muted-foreground/80">
            {displayDuration > 0
              ? t('ai.chat.thoughtFor', { duration: formatDuration(displayDuration) })
              : t('ai.chat.thought')}
          </span>
        )}
        {isStreaming && elapsed > 0 && (
          <span className="shrink-0 tabular-nums text-[11px] text-violet-400/70">
            {formatDuration(elapsed)}
          </span>
        )}
        {!isExpanded && !isStreaming && preview && (
          <span className="text-[11px] text-muted-foreground/40 truncate min-w-0">
            {preview}
          </span>
        )}
      </button>

      {isExpanded && content && (
        <div id="thinking-block-content" className="relative border-t border-border/30">
          {isStreaming && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-gradient-to-b from-violet-500/[0.06] to-transparent" />
          )}
          <div
            ref={scrollRef}
            className={cn(
              'px-3 py-2 text-[12px] leading-relaxed text-muted-foreground/70 whitespace-pre-wrap break-words',
              'max-h-40 overflow-y-auto scrollbar-hide',
            )}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ThinkingBlock);
