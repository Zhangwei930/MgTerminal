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
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/80">
        {icon}
      </div>
    )}
    <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
    {description && (
      <p className="mb-4 max-w-sm text-center text-sm">{description}</p>
    )}
    {actions.length > 0 && (
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
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
      <ul className="max-w-sm space-y-1 text-center text-xs text-muted-foreground/90">
        {hints.map((hint) => (
          <li key={hint}>{hint}</li>
        ))}
      </ul>
    )}
  </div>
);

export default ProductEmptyState;
