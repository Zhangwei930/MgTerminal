import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-sm font-medium",
          "transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]",
          {
            "bg-primary text-primary-foreground shadow-[0_1px_2px_hsl(var(--primary)/0.25),0_6px_16px_-6px_hsl(var(--primary)/0.45)] hover:bg-primary/92 hover:shadow-[0_2px_4px_hsl(var(--primary)/0.28),0_10px_22px_-8px_hsl(var(--primary)/0.5)]":
              variant === "default",
            "bg-destructive text-destructive-foreground shadow-[0_1px_2px_hsl(var(--destructive)/0.2),0_6px_16px_-6px_hsl(var(--destructive)/0.35)] hover:bg-destructive/92":
              variant === "destructive",
            "border border-border/70 bg-background/85 shadow-sm hover:bg-accent/80 hover:text-accent-foreground hover:border-border hover:shadow-md":
              variant === "outline",
            "bg-secondary/90 text-secondary-foreground shadow-sm ring-1 ring-inset ring-border/40 hover:bg-secondary hover:shadow-sm":
              variant === "secondary",
            "hover:bg-accent/70 hover:text-accent-foreground":
              variant === "ghost",
            "text-primary underline-offset-4 hover:underline active:scale-100":
              variant === "link",
            "h-10 px-4 py-2": size === "default",
            "h-9 rounded-lg px-3 text-[13px]": size === "sm",
            "h-11 rounded-xl px-8": size === "lg",
            "h-10 w-10": size === "icon",
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
