import { cn } from '../../lib/utils';
import type { ComponentProps } from 'react';
import React, { useCallback } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { ArrowDown } from 'lucide-react';

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn('relative flex-1 overflow-x-hidden overflow-y-hidden', className)}
    initial="instant"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn(
      'flex min-w-0 max-w-full flex-col gap-7 overflow-x-hidden px-3.5 py-5 sm:px-4',
      className,
    )}
    {...props}
  />
);

export const ConversationScrollButton = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleClick = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) return null;

  return (
    <button
      type="button"
      className={cn(
        'absolute bottom-3 left-1/2 -translate-x-1/2 z-10',
        'h-8 w-8 rounded-full border border-border/50 bg-card/95 backdrop-blur-md',
        'flex items-center justify-center',
        'text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer',
        'shadow-[0_6px_18px_-6px_hsl(var(--foreground)/0.25)] ring-1 ring-inset ring-white/[0.04]',
        className,
      )}
      onClick={handleClick}
      {...props}
    >
      <ArrowDown size={14} />
    </button>
  );
};
