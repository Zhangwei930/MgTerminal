/**
 * Shared visual for AI "working" states.
 * Grok-style rounded-square spinner + optional shimmer label.
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
  /** Show leading icon (bot / brain). Defaults off when spinner is present. */
  showIcon?: boolean;
  className?: string;
  /** Extra content after the label (e.g. elapsed time). */
  trailing?: React.ReactNode;
};

/**
 * Grok-like rounded square that spins — a soft plate with a bright arc
 * chasing around the border (conic-gradient mask).
 */
export const AiSquareSpinner: React.FC<{
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** thinking = violet tint; default = primary */
  tone?: 'primary' | 'violet';
}> = ({ className, size = 'md', tone = 'primary' }) => {
  const box =
    size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  const radius = size === 'sm' ? 'rounded-[4px]' : size === 'lg' ? 'rounded-[6px]' : 'rounded-[5px]';

  return (
    <span
      className={cn(
        'ai-square-spinner relative inline-flex shrink-0 items-center justify-center',
        box,
        className,
      )}
      data-tone={tone}
      aria-hidden
    >
      {/* Spinning conic border */}
      <span className={cn('ai-square-spinner__ring absolute inset-0', radius)} />
      {/* Inner plate so the center stays solid */}
      <span
        className={cn(
          'ai-square-spinner__core absolute inset-[2px]',
          radius,
          tone === 'violet' ? 'bg-violet-500/10' : 'bg-primary/10',
        )}
      />
    </span>
  );
};

/** @deprecated alias kept for any external imports */
export const AiTypingDots = AiSquareSpinner;

export const AiActivityIndicator: React.FC<AiActivityIndicatorProps> = ({
  label,
  variant = 'generating',
  framed = variant === 'generating',
  showIcon = false,
  className,
  trailing,
}) => {
  const tone = variant === 'thinking' ? 'violet' : 'primary';
  const spinnerSize = variant === 'compact' ? 'sm' : variant === 'generating' ? 'md' : 'sm';

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
          {variant === 'thinking' ? (
            <Brain size={12} strokeWidth={2.25} />
          ) : (
            <Bot size={12} strokeWidth={2.25} />
          )}
        </span>
      )}
      <AiSquareSpinner size={spinnerSize} tone={tone} />
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
        'rounded-2xl rounded-tl-md border border-primary/25 bg-gradient-to-br from-primary/[0.1] to-card/80 px-3.5 py-2.5',
        'shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.3)] ring-1 ring-inset ring-white/[0.04]',
        className,
      )}
    >
      <span className="ai-activity-sheen pointer-events-none absolute inset-0" aria-hidden />
      <span className="relative z-[1] flex min-w-0 items-center gap-2.5">{body}</span>
    </div>
  );
};

export default AiActivityIndicator;
