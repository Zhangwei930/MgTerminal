import { cn } from '../../lib/utils';
import type { ComponentProps, HTMLAttributes } from 'react';
import { forwardRef } from 'react';

export type InputGroupProps = HTMLAttributes<HTMLDivElement>;

export const InputGroup = forwardRef<HTMLDivElement, InputGroupProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col rounded-[22px] border border-border/65 bg-background transition-[border-color,background-color,box-shadow]',
        'focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/15 focus-within:shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]',
        // Keep overflow hidden for rounded corners; glyph room comes from
        // textarea line-height + padding (not from y:visible which browsers coerce).
        'overflow-hidden',
        className,
      )}
      {...props}
    />
  ),
);
InputGroup.displayName = 'InputGroup';

export type InputGroupTextareaProps = ComponentProps<'textarea'>;

export const InputGroupTextarea = forwardRef<HTMLTextAreaElement, InputGroupTextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        // 13px / 1.55 line-height keeps CJK + Latin descenders fully visible.
        // Fixed 20px line-height was clipping 中文 and j/g/y in several UI fonts.
        'w-full resize-none bg-transparent text-[13.5px] text-foreground/92 selection:bg-primary/25',
        'placeholder:text-muted-foreground/55 placeholder:font-normal placeholder:text-[13.5px]',
        'focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed',
        // Extra right padding for the expand control; generous vertical padding.
        'box-border px-4 pr-10 pt-3.5 pb-3 leading-[1.55]',
        'field-sizing-content min-h-[88px] max-h-56 overflow-y-auto',
        className,
      )}
      {...props}
    />
  ),
);
InputGroupTextarea.displayName = 'InputGroupTextarea';

export type InputGroupAddonProps = HTMLAttributes<HTMLDivElement> & {
  align?: 'block-start' | 'block-end';
};

export const InputGroupAddon = forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ className, align = 'block-end', ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-1 px-3 py-2',
        align === 'block-start' && 'border-b border-border/35 bg-muted/8',
        align === 'block-end' && 'border-t border-border/50 bg-muted/[0.12]',
        className,
      )}
      {...props}
    />
  ),
);
InputGroupAddon.displayName = 'InputGroupAddon';

export type InputGroupButtonProps = ComponentProps<'button'> & {
  variant?: 'default' | 'ghost' | 'outline' | 'destructive';
  size?: 'sm' | 'icon-sm' | 'default';
};

export const InputGroupButton = forwardRef<HTMLButtonElement, InputGroupButtonProps>(
  ({ className, variant = 'ghost', size = 'icon-sm', disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors cursor-pointer',
        'disabled:opacity-30 disabled:cursor-default',
        size === 'icon-sm' && 'h-7 w-7',
        size === 'sm' && 'h-7 px-2 text-[12px] gap-1',
        size === 'default' && 'h-8 px-3 text-[13px] gap-1.5',
        variant === 'ghost' && 'text-muted-foreground/78 hover:text-foreground hover:bg-muted/45',
        variant === 'default' && 'bg-primary/80 text-primary-foreground hover:bg-primary',
        variant === 'outline' && 'border border-border/40 text-muted-foreground/85 hover:text-foreground hover:bg-muted/35',
        variant === 'destructive' && 'text-destructive/70 hover:text-destructive hover:bg-destructive/10',
        className,
      )}
      {...props}
    />
  ),
);
InputGroupButton.displayName = 'InputGroupButton';
