/**
 * Shared visual for AI "working" states: typing dots + optional shimmer label.
 * Used while waiting for first tokens, during thinking, and compaction status.
 */

import { Bot, Brain } from 'lucide-react';
import React from 'react';
import { cn } from '../../lib/utils';

export type AiActivityVariant = 'generating' | 'thinking' | 'compact';

export type AiActivityIndicatorProps = {
  /** Visible status text (already localized by caller). */
  label?: string;
  variant?: AiActivityVariant;
  /** Show the soft card chrome (default true for generating). */
  framed?: boolean;
  /** Show leading icon (bot / brain). */
  showIcon?: boolean;
  className?: string;
  /** Extra content after the label (e.g. elapsed time). */
  trailing?: React.ReactNode;
};

const VARIANT_ICON: Record<AiActivityVariant, React.ReactNode> = {
  generating: <Bot size={12} strokeWidth={2.25} />,
  thinking: <Brain size={12} strokeWidth={2.25} />,
  compact: <Bot size={11} strokeWidth={2.25} />,
};

/**
 * Three-dot wave — pure CSS, no layout thrash.
 */
export const AiTypingDots: React.FC<{ className?: string; size?: 'sm' | 'md' }> = ({
  className,
  size = 'md',
}) => {
  const dot = size === 'sm' ? 'h-1 w-1' : 'h-1.5 w-1.5';
  return (
    <span
      className={cn('ai-typing-dots inline-flex items-center gap-[5px]', className)}
      aria-hidden
    >
      <span className={cn('ai-typing-dot', dot)} style={{ animationDelay: '0ms' }} />
      <span className={cn('ai-typing-dot', dot)} style={{ animationDelay: '160ms' }} />
      <span className={cn('ai-typing-dot', dot)} style={{ animationDelay: '320ms' }} />
    </span>
  );
};

export const AiActivityIndicator: React.FC<AiActivityIndicatorProps> = ({
  label,
  variant = 'generating',
  framed = variant === 'generating',
  showIcon = variant === 'generating',
  className,
  trailing,
}) => {
  const body = (
    <>
      {showIcon && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-lg border',
            variant === 'thinking'
              ? 'h-6 w-6 border-violet-500/30 bg-violet-500/15 text-violet-400'
              : 'h-6 w-6 border-primary/25 bg-primary/10 text-primary',
            variant === 'compact' && 'h-5 w-5 rounded-md',
          )}
        >
          {VARIANT_ICON[variant]}
        </span>
      )}
      <AiTypingDots size={variant === 'compact' ? 'sm' : 'md'} />
      {label ? (
        <span
          className={cn(
            'min-w-0 truncate font-medium tracking-wide',
            variant === 'compact' ? 'text-[11.5px]' : 'text-[12.5px]',
            'thinking-shimmer thinking-shimmer--primary',
          )}
        >
          {label}
        </span>
      ) : null}
      {trailing}
    </>
  );

  if (!framed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn('inline-flex items-center gap-2', className)}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'group/ai-activity relative flex w-fit max-w-full items-center gap-2.5 overflow-hidden',
        'rounded-2xl rounded-tl-md border border-border/50 bg-card/70 px-3.5 py-2.5',
        'shadow-[0_1px_3px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-white/[0.03]',
        className,
      )}
    >
      {/* Soft sweep behind the dots */}
      <span className="ai-activity-sheen pointer-events-none absolute inset-0" aria-hidden />
      <span className="relative z-[1] flex min-w-0 items-center gap-2.5">{body}</span>
    </div>
  );
};

export default AiActivityIndicator;
