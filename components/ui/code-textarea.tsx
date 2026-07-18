import * as React from "react";
import { cn } from "@/lib/utils.ts";

export interface CodeTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "spellCheck"> {
  showLineNumbers?: boolean;
  /** Applied to the outer bordered container when line numbers are shown. */
  wrapperClassName?: string;
}

function countLines(value: string): number {
  if (!value) return 1;
  return value.split("\n").length;
}

const CodeTextarea = React.forwardRef<HTMLTextAreaElement, CodeTextareaProps>(
  ({ className, wrapperClassName, value, showLineNumbers = true, onScroll, ...props }, ref) => {
    const gutterRef = React.useRef<HTMLDivElement>(null);
    const text = typeof value === "string" ? value : String(value ?? "");
    const lineCount = countLines(text);
    const lineNumbers = React.useMemo(
      () => Array.from({ length: lineCount }, (_, i) => i + 1),
      [lineCount],
    );
    const gutterWidthCh = Math.max(2, String(lineCount).length) + 1;

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
      if (gutterRef.current) {
        gutterRef.current.scrollTop = e.currentTarget.scrollTop;
      }
      onScroll?.(e);
    };

    const editorClass = cn(
      "w-full flex-1 resize-none border-0 bg-transparent px-2 py-2 font-mono text-xs leading-5",
      "placeholder:text-muted-foreground focus-visible:outline-none",
      "whitespace-pre overflow-auto",
      className,
    );

    if (!showLineNumbers) {
      return (
        <textarea
          ref={ref}
          value={value}
          className={cn(
            "flex min-h-[80px] w-full rounded-lg border border-border/70 bg-background px-3 py-2 font-mono text-xs leading-5",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/15",
            "disabled:cursor-not-allowed disabled:opacity-50 whitespace-pre",
            className,
          )}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-gramm="false"
          onScroll={onScroll}
          {...props}
        />
      );
    }

    return (
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-lg border border-border/70 bg-background transition-[border-color,box-shadow]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
          "focus-within:border-primary/45 focus-within:ring-2 focus-within:ring-primary/15",
          wrapperClassName,
        )}
      >
        <div
          ref={gutterRef}
          aria-hidden
          className="shrink-0 overflow-hidden border-r border-border/50 bg-muted/25 py-2 pl-2 pr-1.5 select-none"
          style={{ width: `${gutterWidthCh}ch` }}
        >
          <pre className="font-mono text-[11px] leading-5 text-muted-foreground text-right m-0">
            {lineNumbers.join("\n")}
          </pre>
        </div>
        <textarea
          ref={ref}
          value={value}
          className={editorClass}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          data-gramm="false"
          onScroll={handleScroll}
          {...props}
        />
      </div>
    );
  },
);
CodeTextarea.displayName = "CodeTextarea";

export { CodeTextarea };
