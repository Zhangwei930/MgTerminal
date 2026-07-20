import { Bot, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import type { ComponentProps, HTMLAttributes } from 'react';
import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { useI18n } from '../../application/i18n/I18nProvider';
import { createSafeCodeHighlighter } from './streamdownCodeHighlighter';

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant' | 'system' | 'tool';
};

// Public CSS hooks for user customization (Settings → Appearance → Custom CSS):
//   .ai-chat-message[data-role="user"]      — outer row, user-authored
//   .ai-chat-message[data-role="assistant"] — outer row, assistant reply
//   .ai-chat-message-content[data-role=...] — inner bubble / content area
// These attributes are part of the UI's stable contract; do not rename
// without updating Custom CSS docs.
export const Message = ({ className, from, children, ...props }: MessageProps) => {
  const { t } = useI18n();
  const isUser = from === 'user';
  const isAssistant = from === 'assistant';

  return (
    <div
      className={cn(
        'ai-chat-message group flex w-full flex-col',
        isUser && 'is-user items-end',
        isAssistant && 'is-assistant items-stretch',
        !isUser && !isAssistant && 'items-stretch',
        className,
      )}
      data-role={from}
      {...props}
    >
      {/* Role cue — subtle identity chip above content */}
      {(isUser || isAssistant) && (
        <div
          className={cn(
            'mb-1.5 flex items-center gap-1.5 px-0.5',
            isUser ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          <span
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-lg border shadow-sm',
              isUser
                ? 'border-primary/30 bg-primary text-primary-foreground shadow-primary/20'
                : 'border-border/50 bg-gradient-to-br from-muted to-muted/60 text-muted-foreground',
            )}
          >
            {isUser ? <User size={11} strokeWidth={2.25} /> : <Bot size={11} strokeWidth={2.25} />}
          </span>
          <span
            className={cn(
              'text-[10.5px] font-semibold tracking-wide',
              isUser ? 'text-primary' : 'text-muted-foreground/65',
            )}
          >
            {isUser ? t('ai.chat.role.you') : t('ai.chat.role.assistant')}
          </span>
        </div>
      )}
      {children}
    </div>
  );
};

export type MessageContentProps = HTMLAttributes<HTMLDivElement> & {
  from?: 'user' | 'assistant' | 'system' | 'tool';
};

export const MessageContent = ({ children, className, from, ...props }: MessageContentProps) => (
  <div
    className={cn(
      'ai-chat-message-content flex min-w-0 max-w-full flex-col gap-2.5 text-[13.5px] leading-[1.6]',
      // User: solid primary bubble
      'group-[.is-user]:ml-auto group-[.is-user]:w-fit group-[.is-user]:max-w-[min(92%,28rem)]',
      'group-[.is-user]:overflow-x-clip group-[.is-user]:rounded-2xl group-[.is-user]:rounded-tr-md',
      'group-[.is-user]:border group-[.is-user]:border-primary/30',
      'group-[.is-user]:bg-gradient-to-br group-[.is-user]:from-primary group-[.is-user]:to-primary/85',
      'group-[.is-user]:text-primary-foreground',
      'group-[.is-user]:px-3.5 group-[.is-user]:py-2.5',
      'group-[.is-user]:shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.45),inset_0_1px_0_rgba(255,255,255,0.18)]',
      // Assistant: soft surface with primary left edge accent
      'group-[.is-assistant]:w-full group-[.is-assistant]:max-w-full',
      'group-[.is-assistant]:rounded-2xl group-[.is-assistant]:rounded-tl-md',
      'group-[.is-assistant]:border group-[.is-assistant]:border-border/50 group-[.is-assistant]:border-l-[3px] group-[.is-assistant]:border-l-primary/60',
      'group-[.is-assistant]:bg-card/80 group-[.is-assistant]:px-3.5 group-[.is-assistant]:py-3',
      'group-[.is-assistant]:shadow-[0_4px_18px_-10px_hsl(var(--foreground)/0.14),inset_0_1px_0_rgba(255,255,255,0.04)]',
      'group-[.is-assistant]:ring-1 group-[.is-assistant]:ring-inset group-[.is-assistant]:ring-white/[0.03]',
      'group-[.is-assistant]:text-foreground/92',
      className,
    )}
    data-role={from}
    {...props}
  >
    {children}
  </div>
);

const safeCode = createSafeCodeHighlighter(code);
const streamdownPlugins = { cjk, code: safeCode };

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        'size-full min-w-0 text-[13.5px] leading-[1.65] [overflow-wrap:anywhere]',
        '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        // Code
        '[&_code]:text-[12.5px] [&_code]:font-mono [&_code]:leading-normal',
        '[&_p_code]:px-[0.4em] [&_p_code]:py-[0.2em] [&_p_code]:rounded-md [&_p_code]:bg-foreground/[0.07] [&_p_code]:text-[88%] [&_p_code]:whitespace-normal [&_p_code]:[overflow-wrap:anywhere]',
        // Body rhythm
        '[&_p]:my-2 [&_p]:leading-[1.65]',
        '[&_ul]:my-2.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5',
        '[&_ol]:my-2.5 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5',
        '[&_li]:my-0.5 [&_li]:leading-[1.6] [&_li]:marker:text-muted-foreground/50',
        '[&_h1]:text-[1.05rem] [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:leading-snug [&_h1]:tracking-tight',
        '[&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mt-3.5 [&_h2]:mb-1.5 [&_h2]:leading-snug [&_h2]:tracking-tight',
        '[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:leading-snug',
        '[&_blockquote]:border-l-[3px] [&_blockquote]:border-primary/25 [&_blockquote]:pl-3.5 [&_blockquote]:my-2.5 [&_blockquote]:text-muted-foreground [&_blockquote]:leading-relaxed',
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary',
        '[&_hr]:border-border/40 [&_hr]:my-4',
        '[&_pre]:my-2.5 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/40 [&_pre]:bg-muted/25 [&_pre]:overflow-x-auto',
        '[&_table]:my-2.5 [&_table]:w-full [&_table]:text-[12.5px] [&_table]:leading-normal [&_table]:border-collapse',
        '[&_th]:px-2.5 [&_th]:py-1.5 [&_th]:border [&_th]:border-border/35 [&_th]:bg-muted/30 [&_th]:text-left [&_th]:font-medium',
        '[&_td]:px-2.5 [&_td]:py-1.5 [&_td]:border [&_td]:border-border/30',
        // User bubble: invert inline code / links for primary background
        'group-[.is-user]:[&_p_code]:bg-primary-foreground/15 group-[.is-user]:[&_p_code]:text-primary-foreground',
        'group-[.is-user]:[&_a]:text-primary-foreground group-[.is-user]:[&_a]:decoration-primary-foreground/50',
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating,
);
MessageResponse.displayName = 'MessageResponse';
