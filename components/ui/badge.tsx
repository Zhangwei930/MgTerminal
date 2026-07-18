import * as React from "react"
import { cn } from "../../lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  className?: string
  variant?: "default" | "secondary" | "destructive" | "outline"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors focus:outline-none",
        {
          "border-transparent bg-primary text-primary-foreground shadow-sm shadow-primary/15":
            variant === "default",
          "border-border/50 bg-secondary text-secondary-foreground":
            variant === "secondary",
          "border-transparent bg-destructive text-destructive-foreground shadow-sm shadow-destructive/15":
            variant === "destructive",
          "border-border/70 bg-background/60 text-foreground":
            variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
