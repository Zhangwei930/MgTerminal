/**
 * F1 keyboard shortcut reference.
 *
 * Renders the live KeyBinding list, so a user who has remapped something sees
 * what they actually have bound rather than the shipped defaults.
 */
import { Keyboard, Search } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import type { HotkeyScheme, KeyBinding } from "../domain/models";
import { groupShortcutsForHelp, searchShortcutsForHelp } from "../domain/shortcutHelp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

export interface ShortcutHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyBindings: KeyBinding[];
  hotkeyScheme: HotkeyScheme;
}

export const ShortcutHelpDialog: React.FC<ShortcutHelpDialogProps> = ({
  open,
  onOpenChange,
  keyBindings,
  hotkeyScheme,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");

  // Settings has no key for the English labels — the binding carries them.
  const resolveLabel = useMemo(
    () => (binding: KeyBinding) => {
      const key = `settings.shortcuts.binding.${binding.id}`;
      const translated = t(key);
      return translated === key ? binding.label : translated;
    },
    [t],
  );

  const groups = useMemo(
    () => groupShortcutsForHelp(
      searchShortcutsForHelp(keyBindings, query, hotkeyScheme, resolveLabel),
    ),
    [keyBindings, query, hotkeyScheme, resolveLabel],
  );

  const selfKey = useMemo(() => {
    const self = keyBindings.find((binding) => binding.action === "showShortcuts");
    if (!self) return "F1";
    return hotkeyScheme === "mac" ? self.mac : self.pc;
  }, [keyBindings, hotkeyScheme]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard size={16} />
            {t("shortcutHelp.title")}
          </DialogTitle>
          <DialogDescription>
            {hotkeyScheme === "disabled"
              ? t("shortcutHelp.disabled")
              : t("shortcutHelp.description", { key: selfKey })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("shortcutHelp.search")}
            className="pl-8"
            autoFocus
          />
        </div>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("shortcutHelp.noResults")}
            </p>
          ) : groups.map((group) => (
            <div key={group.category}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`settings.shortcuts.category.${group.category}`)}
              </p>
              <div className="rounded-md border border-border/60 divide-y divide-border/40">
                {group.bindings.map((binding) => (
                  <div
                    key={binding.id}
                    className="flex items-center justify-between gap-3 px-3 py-1.5"
                  >
                    <span className="min-w-0 truncate text-sm">{resolveLabel(binding)}</span>
                    <kbd className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {hotkeyScheme === "mac" ? binding.mac : binding.pc}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShortcutHelpDialog;
