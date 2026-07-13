import React, { useMemo } from "react";

import changelogRaw from "../CHANGELOG.md?raw";
import { parseChangelog } from "../domain/changelog";
import { useI18n } from "../application/i18n/I18nProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** In-app release notes viewer fed by the bundled CHANGELOG.md. */
export default function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
  const { t } = useI18n();
  const entries = useMemo(() => parseChangelog(changelogRaw), []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("settings.application.whatsNew")}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-6">
            {entries.map((entry) => (
              <div key={entry.version}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">v{entry.version}</span>
                  {entry.date && (
                    <span className="text-xs text-muted-foreground">{entry.date}</span>
                  )}
                </div>
                {entry.sections.map((section) => (
                  <div key={section.title} className="mt-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      {section.title}
                    </div>
                    <ul className="mt-1 space-y-1 list-disc pl-4">
                      {section.items.map((item) => (
                        <li key={item} className="text-sm leading-relaxed">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
