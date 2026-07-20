import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Fixed-height single-line: leading that fits h-10; descenders stay visible.
          "flex h-10 w-full items-center rounded-lg border border-border/65 bg-background/90 px-3 text-sm leading-[1.4]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),inset_0_1px_2px_hsl(var(--foreground)/0.03)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
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
Input.displayName = "Input"

export { Input }
