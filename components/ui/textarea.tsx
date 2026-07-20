import * as React from "react"
import { cn } from "../../lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-border/65 bg-background/90 px-3 py-2.5 text-sm leading-relaxed",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_1px_2px_hsl(var(--foreground)/0.03)]",
          "placeholder:text-muted-foreground/60",
          "transition-[border-color,box-shadow,background-color] duration-150",
          "focus-visible:outline-none focus-visible:border-primary/50 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/18 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
