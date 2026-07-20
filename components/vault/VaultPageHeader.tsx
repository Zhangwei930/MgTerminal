import { Search } from "lucide-react";
import React from "react";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";
import {
  toolbarClusterClassName,
  toolbarIconButtonLgClassName,
  toolbarSecondaryButtonClassName,
} from "../ui/toolbar";

interface VaultPageHeaderProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  dataSection?: string;
}

export function VaultPageHeader({
  children,
  className,
  contentClassName,
  dataSection,
}: VaultPageHeaderProps) {
  return (
    <header
      className={cn(
        "relative shrink-0 bg-gradient-to-b from-card/50 via-background/96 to-background app-drag",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-bottom after:[transform:scaleY(.5)] after:bg-border/55 after:content-['']",
        className,
      )}
      data-section={dataSection}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 px-3.5 py-2 app-no-drag",
          contentClassName,
        )}
      >
        {children}
      </div>
    </header>
  );
}

interface VaultHeaderSearchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  className?: string;
  inputClassName?: string;
  rightAdornment?: React.ReactNode;
}

export function VaultHeaderSearch({
  className,
  inputClassName,
  rightAdornment,
  ...props
}: VaultHeaderSearchProps) {
  return (
    <div className={cn("relative min-w-[100px]", className)}>
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/75"
      />
      <Input
        {...props}
        className={cn(
          "h-9 rounded-xl border-border/55 bg-muted/40 pl-9 text-sm shadow-none",
          "placeholder:text-muted-foreground/55",
          "focus-visible:border-primary/40 focus-visible:bg-background focus-visible:ring-primary/15",
          rightAdornment && "pr-9",
          inputClassName,
        )}
      />
      {rightAdornment && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {rightAdornment}
        </div>
      )}
    </div>
  );
}

/** Group of header icon controls (view / filter / sort / tools). */
export const vaultHeaderToolbarClusterClass = toolbarClusterClassName;

export const vaultHeaderSecondaryButtonClass = cn(
  toolbarSecondaryButtonClassName,
  "h-9",
);

export const vaultHeaderIconButtonClass = cn(
  toolbarIconButtonLgClassName,
  // Keep h-9 w-9 for dense header toolbars; override base icon size when needed.
);

export const vaultSectionTitleClass =
  "text-base font-semibold tracking-tight text-muted-foreground";
