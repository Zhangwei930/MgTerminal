import * as React from "react"
import { cn } from "../../lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border border-border/55 bg-card/95 text-card-foreground",
      "shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)]",
      "ring-1 ring-inset ring-white/[0.035]",
      "backdrop-blur-[2px]",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

export { Card }
