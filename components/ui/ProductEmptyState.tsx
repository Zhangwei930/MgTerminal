/**
 * Shared empty-state block for vault sections: title, description, optional actions.
 */
import React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export interface ProductEmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "secondary" | "ghost";
}

export interface ProductEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: ProductEmptyStateAction[];
  hints?: string[];
  className?: string;
}

export const ProductEmptyState: React.FC<ProductEmptyStateProps> = ({
  icon,
  title,
  description,
  actions = [],
  hints = [],
  className,
}) => (
  <div
    className={cn(
      "col-span-full flex flex-col items-center justify-center py-24 text-muted-foreground",
      className,
    )}
    data-testid="product-empty-state"
  >
    {icon && (
      <div className="relative mb-6 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-2xl border border-border/50 bg-gradient-to-b from-secondary via-secondary/80 to-secondary/50 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-primary/10 before:absolute before:inset-0 before:rounded-2xl before:bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.14),transparent_60%)] before:pointer-events-none">
        <span className="relative z-[1]">{icon}</span>
      </div>
    )}
    <h3 className="mb-2 text-lg font-semibold tracking-tight text-foreground">{title}</h3>
    {description && (
      <p className="mb-5 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    )}
    {actions.length > 0 && (
      <div className="mb-5 flex flex-wrap items-center justify-center gap-2.5">
        {actions.map((action) => (
          <Button
            key={action.label}
            size="sm"
            variant={action.variant || "default"}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
      </div>
    )}
    {hints.length > 0 && (
      <ul className="max-w-sm space-y-1.5 text-center text-xs leading-relaxed text-muted-foreground/85">
        {hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ul>
    )}
  </div>
);

export default ProductEmptyState;
