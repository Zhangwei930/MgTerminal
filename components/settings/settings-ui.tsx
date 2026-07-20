import React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/utils";
import { TabsContent } from "../ui/tabs";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export const Toggle: React.FC<ToggleProps> = ({ checked, onChange, disabled, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
      "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-50",
      checked
        ? "bg-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_0_12px_-2px_hsl(var(--primary)/0.55)]"
        : "bg-input/85 shadow-[inset_0_1px_2px_hsl(var(--foreground)/0.08)]",
    )}
  >
    <span
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-md ring-0 transition-transform duration-200 ease-out",
        checked ? "translate-x-5 shadow-primary/20" : "translate-x-0",
      )}
    />
  </button>
);

interface SelectProps {
  value: string;
  options: { value: string; label: string; icon?: React.ReactNode }[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  value,
  options,
  onChange,
  className,
  disabled,
  placeholder,
}) => {
  const selectedOption = options.find((opt) => opt.value === value);
  const fitSelectedText = typeof className !== "string" || !className.includes("w-full");
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-9 max-w-full items-center justify-between rounded-lg border border-border/65 bg-background/90 px-3 py-1 text-sm",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,box-shadow]",
          "focus-visible:outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/18 focus-visible:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]",
          "disabled:cursor-not-allowed disabled:opacity-50 [&>span]:min-w-0 [&>span]:truncate [&>span]:whitespace-nowrap",
          fitSelectedText && "min-w-max",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder}>
          <span className="flex min-w-0 items-center gap-2 truncate whitespace-nowrap">
            {selectedOption?.icon}
            <span className="truncate whitespace-nowrap">{selectedOption?.label}</span>
          </span>
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="z-[200000] max-h-80 w-max max-w-[min(24rem,var(--radix-select-content-available-width))] overflow-hidden rounded-xl border border-border/50 bg-popover/96 text-popover-foreground shadow-[0_12px_36px_rgba(0,0,0,0.14),0_4px_12px_rgba(0,0,0,0.06)] ring-1 ring-inset ring-white/[0.04] backdrop-blur-md data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1"
          position="popper"
          sideOffset={4}
          style={{ minWidth: "max(12rem, var(--radix-select-trigger-width))" }}
        >
          <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex w-full min-w-0 cursor-default select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>
                  <span className="flex min-w-0 items-center gap-2 whitespace-normal break-words leading-snug">
                    {opt.icon}
                    {opt.label}
                  </span>
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
};

export const SectionHeader: React.FC<{ title: string; className?: string }> = ({
  title,
  className,
}) => (
  <h3 className={cn("mb-3 text-sm font-semibold tracking-tight text-foreground", className)}>
    {title}
  </h3>
);

/** Section title row → content gap (shared across settings pages). */
export const settingsSectionGapClassName = "gap-2";

/** Groups a section title (optional icon/actions) with its content at a uniform gap. */
export const SettingsSection: React.FC<{
  title?: string;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, leading, actions, children, className }) => (
  <section className={cn("flex flex-col", settingsSectionGapClassName, className)}>
    {(title || leading || actions) && (
      <div
        className={cn(
          "flex min-h-8 items-center gap-2",
          actions && "justify-between gap-4",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          {leading}
          {title ? <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    )}
    {children}
  </section>
);

export const settingCardClassName =
  "rounded-xl border border-border/55 bg-card/95 text-card-foreground shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.1)] ring-1 ring-inset ring-white/[0.035]";

interface SettingCardProps {
  children: React.ReactNode;
  className?: string;
  /** Row list with dividers; vertical spacing comes from SettingRow. */
  divided?: boolean;
  /** Free-form content; apply even padding on all sides. */
  padded?: boolean;
}

export const SettingCard: React.FC<SettingCardProps> = ({
  children,
  className,
  divided = false,
  padded = false,
}) => (
  <div
    className={cn(
      settingCardClassName,
      padded ? "p-4" : "px-4",
      divided && "space-y-0 divide-y divide-border/60",
      className,
    )}
  >
    {children}
  </div>
);

interface SettingRowProps {
  label?: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingRow: React.FC<SettingRowProps> = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-3 gap-4">
    <div className="flex-1 min-w-0">
      {label && <div className="text-sm font-medium">{label}</div>}
      {description && (
        <div className={cn("text-xs text-muted-foreground", label && "mt-0.5")}>{description}</div>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export const SettingsTabContent: React.FC<{
  value: string;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <TabsContent value={value} className="flex-1 m-0 h-full overflow-hidden">
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="p-6 space-y-6">{children}</div>
    </div>
  </TabsContent>
);
