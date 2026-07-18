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
      <div className="mb-5 flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-2xl border border-border/50 bg-gradient-to-b from-secondary to-secondary/60 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.06)] ring-1 ring-inset ring-white/[0.03]">
        {icon}
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
