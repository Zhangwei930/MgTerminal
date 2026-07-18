import {
  AlertTriangle,
  Bug,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileText,
  Package,
  Rocket,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
import React, { useMemo, useState } from "react";

import { getChangelogRaw } from "../application/i18n/changelog";
import { useI18n } from "../application/i18n/I18nProvider";
import {
  classifyChangelogSection,
  countChangelogItems,
  parseChangelog,
  parseChangelogItem,
  type ChangelogEntry,
  type ChangelogSectionKind,
} from "../domain/changelog";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface ChangelogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SECTION_STYLES: Record<
  ChangelogSectionKind,
  { icon: React.ReactNode; badge: string; dot: string }
> = {
  features: {
    icon: <Sparkles size={12} />,
    badge: "bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25",
    dot: "bg-sky-500",
  },
  fixes: {
    icon: <Bug size={12} />,
    badge: "bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25",
    dot: "bg-amber-500",
  },
  improvements: {
    icon: <Wrench size={12} />,
    badge: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
    dot: "bg-violet-500",
  },
  security: {
    icon: <Shield size={12} />,
    badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  breaking: {
    icon: <AlertTriangle size={12} />,
    badge: "bg-destructive/10 text-destructive border-destructive/25",
    dot: "bg-destructive",
  },
  platform: {
    icon: <Package size={12} />,
    badge: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
    dot: "bg-indigo-500",
  },
  other: {
    icon: <FileText size={12} />,
    badge: "bg-muted text-muted-foreground border-border/60",
    dot: "bg-muted-foreground/50",
  },
};

/** Render inline `code` spans inside changelog body text. */
function InlineMarkdownText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
          return (
            <code
              key={i}
              className="rounded bg-muted/80 px-1 py-0.5 font-mono text-[0.85em] text-foreground/90"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
}

function VersionEntryCard({
  entry,
  isLatest,
  defaultOpen,
  latestLabel,
  changesLabel,
}: {
  entry: ChangelogEntry;
  isLatest: boolean;
  defaultOpen: boolean;
  latestLabel: string;
  changesLabel: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article
      className={cn(
        "relative rounded-xl border transition-colors",
        isLatest
          ? "border-primary/30 bg-primary/[0.03] shadow-sm"
          : "border-border/60 bg-card/40 hover:bg-card/70",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
      >
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            isLatest
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-border/60 bg-muted/40 text-muted-foreground",
          )}
        >
          <Rocket size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">v{entry.version}</h3>
            {isLatest && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {latestLabel}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {changesLabel}
            </span>
          </div>
          {entry.date ? (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays size={12} className="shrink-0 opacity-70" />
              <time dateTime={entry.date}>{entry.date}</time>
            </div>
          ) : null}
          {!open && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.sections.map((section) => {
                const kind = classifyChangelogSection(section.title);
                const style = SECTION_STYLES[kind];
                return (
                  <span
                    key={section.title}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                      style.badge,
                    )}
                  >
                    {style.icon}
                    {section.title}
                    <span className="opacity-70">· {section.items.length}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-1 shrink-0 text-muted-foreground">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border/50 px-4 pb-4 pt-3">
          {entry.sections.map((section) => {
            const kind = classifyChangelogSection(section.title);
            const style = SECTION_STYLES[kind];
            return (
              <section key={section.title} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                      style.badge,
                    )}
                  >
                    {style.icon}
                    {section.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {section.items.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {section.items.map((item, idx) => {
                    const parts = parseChangelogItem(item);
                    return (
                      <li
                        key={`${section.title}-${idx}`}
                        className="group flex gap-2.5 rounded-lg border border-transparent px-1 py-1 transition-colors hover:border-border/40 hover:bg-muted/20"
                      >
                        <span
                          className={cn(
                            "mt-2 h-1.5 w-1.5 shrink-0 rounded-full",
                            style.dot,
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          {parts.title ? (
                            <>
                              <div className="text-sm font-medium leading-snug text-foreground">
                                <InlineMarkdownText text={parts.title} />
                              </div>
                              {parts.body ? (
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                  <InlineMarkdownText text={parts.body} />
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-sm leading-relaxed text-foreground/90">
                              <InlineMarkdownText text={parts.body} />
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}

/** In-app release notes viewer fed by the bundled per-locale changelogs. */
export default function ChangelogDialog({ open, onOpenChange }: ChangelogDialogProps) {
  const { t, resolvedLocale } = useI18n();
  const entries = useMemo(
    () => parseChangelog(getChangelogRaw(resolvedLocale)),
    [resolvedLocale],
  );
  const totalChanges = useMemo(
    () => entries.reduce((n, e) => n + countChangelogItems(e), 0),
    [entries],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,720px)] w-[min(100vw-2rem,40rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:rounded-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/60 px-6 py-5 pr-12 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold tracking-tight">
                {t("settings.application.whatsNew")}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                {entries.length > 0
                  ? t("settings.application.whatsNew.summary", {
                      versions: entries.length,
                      changes: totalChanges,
                    })
                  : t("settings.application.whatsNew.subtitle")}
              </DialogDescription>
            </div>
          </div>
          {entries[0] && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Badge variant="secondary" className="font-mono text-[11px]">
                v{entries[0].version}
              </Badge>
              {entries[0].date ? (
                <span className="text-[11px] text-muted-foreground">{entries[0].date}</span>
              ) : null}
              <span className="text-[11px] text-muted-foreground">
                · {countChangelogItems(entries[0])}{" "}
                {t("settings.application.whatsNew.inLatest")}
              </span>
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-3 px-5 py-4">
            {entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 py-12 text-center text-sm text-muted-foreground">
                {t("settings.application.whatsNew.empty")}
              </div>
            ) : (
              entries.map((entry, index) => (
                <VersionEntryCard
                  key={entry.version}
                  entry={entry}
                  isLatest={index === 0}
                  defaultOpen={index === 0}
                  latestLabel={t("settings.application.whatsNew.latest")}
                  changesLabel={t("settings.application.whatsNew.changeCount", {
                    count: countChangelogItems(entry),
                  })}
                />
              ))
            )}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-border/60 bg-muted/20 px-6 py-2.5 text-[11px] text-muted-foreground">
          {t("settings.application.whatsNew.footer")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
