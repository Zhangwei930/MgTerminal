import { Search } from "lucide-react";
import React from "react";
import { cn } from "../../lib/utils";
import { Input } from "../ui/input";

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
        "relative shrink-0 bg-gradient-to-b from-background/98 to-background/90 backdrop-blur-[2px] app-drag after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-bottom after:[transform:scaleY(.5)] after:bg-border/45 after:content-['']",
        className,
      )}
      data-section={dataSection}
    >
      <div
        className={cn(
          "h-14 px-4 py-2 flex items-center gap-3 app-no-drag",
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
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        {...props}
        className={cn(
          "pl-9 h-10 bg-muted/50 border-border/50 text-sm shadow-none focus-visible:bg-background",
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

export const vaultHeaderSecondaryButtonClass =
  "h-10 px-3 gap-2 bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.09] border-border/40 shadow-sm";

export const vaultHeaderIconButtonClass = "h-10 w-10 text-muted-foreground hover:text-foreground";

export const vaultSectionTitleClass = "text-base font-semibold tracking-tight text-muted-foreground";
