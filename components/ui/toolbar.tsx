/**
 * Shared toolbar chrome for page headers / control strips.
 * Keeps icon buttons and action clusters aligned with the active UI theme.
 */
import { cn } from "../../lib/utils";

/** Outer cluster that groups related icon/actions. */
export const toolbarClusterClassName =
  "inline-flex items-center gap-0.5 rounded-xl border border-border/55 bg-muted/35 p-0.5 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";

/** Icon-only control inside a cluster or alone. */
export const toolbarIconButtonClassName =
  "h-8 w-8 shrink-0 rounded-lg text-muted-foreground " +
  "transition-[color,background-color,box-shadow,border-color] duration-150 " +
  "hover:bg-background/85 hover:text-foreground hover:shadow-sm " +
  "data-[active=true]:bg-primary/12 data-[active=true]:text-primary data-[active=true]:shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

/** Slightly larger icon button for header rows that use h-9/h-10 controls. */
export const toolbarIconButtonLgClassName =
  "h-9 w-9 shrink-0 rounded-xl text-muted-foreground " +
  "transition-[color,background-color,box-shadow,border-color] duration-150 " +
  "hover:bg-background/85 hover:text-foreground hover:shadow-sm " +
  "data-[active=true]:bg-primary/12 data-[active=true]:text-primary data-[active=true]:shadow-sm " +
  "border border-transparent hover:border-border/40 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

/** Secondary labeled action (Terminal / Serial style). */
export const toolbarSecondaryButtonClassName =
  "h-9 px-3 gap-2 rounded-xl border border-border/55 bg-background/75 text-foreground " +
  "shadow-sm hover:bg-primary/[0.08] hover:border-primary/30 hover:text-foreground " +
  "transition-[color,background-color,border-color,box-shadow] duration-150";

/** Compact multi-select / filter strip. */
export const toolbarStripClassName =
  "flex items-center gap-1.5 rounded-xl border border-border/50 bg-muted/25 px-2 py-1.5";

export function toolbarIconButtonClass(active?: boolean, className?: string): string {
  return cn(toolbarIconButtonLgClassName, active && "bg-primary/12 text-primary border-primary/20 shadow-sm", className);
}
