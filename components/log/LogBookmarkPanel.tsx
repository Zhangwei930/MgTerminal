import { Bookmark, BookmarkPlus, Search, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import type { LogBookmark } from "../../domain/logBookmarks";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export type LogBookmarkPanelProps = {
  bookmarks: LogBookmark[];
  onAdd: () => void;
  onJump: (bookmark: LogBookmark) => void;
  onUpdateNote: (bookmarkId: string, note: string) => void;
  onRemove: (bookmarkId: string) => void;
  canAdd: boolean;
  className?: string;
};

export const LogBookmarkPanel: React.FC<LogBookmarkPanelProps> = ({
  bookmarks,
  onAdd,
  onJump,
  onUpdateNote,
  onRemove,
  canAdd,
  className,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookmarks;
    return bookmarks.filter((item) => {
      const hay = `${item.label}\n${item.note || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bookmarks, query]);

  return (
    <div
      className={cn(
        "w-[240px] shrink-0 border-l border-border/50 bg-secondary/20 flex flex-col min-h-0",
        className,
      )}
    >
      <div className="px-2 py-2 border-b border-border/40 space-y-2">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <Bookmark size={13} className="text-primary" />
            {t("logView.bookmarks.title")}
            <span className="text-muted-foreground font-normal">({bookmarks.length})</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onAdd}
            disabled={!canAdd}
            title={t("logView.bookmarks.add")}
            aria-label={t("logView.bookmarks.add")}
          >
            <BookmarkPlus size={14} />
          </Button>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("logView.bookmarks.search")}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {filtered.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-muted-foreground leading-relaxed">
            {bookmarks.length === 0
              ? t("logView.bookmarks.empty")
              : t("logView.bookmarks.noMatch")}
          </p>
        ) : (
          filtered.map((bookmark) => (
            <div
              key={bookmark.id}
              className="rounded-md border border-border/40 bg-card/50 px-2 py-1.5 space-y-1"
            >
              <button
                type="button"
                className="w-full text-left text-xs font-medium truncate hover:text-primary"
                onClick={() => onJump(bookmark)}
                title={bookmark.label}
              >
                <span className="text-muted-foreground font-normal mr-1">
                  L{bookmark.line + 1}
                </span>
                {bookmark.label}
              </button>
              {editingId === bookmark.id ? (
                <div className="space-y-1">
                  <Input
                    value={draftNote}
                    onChange={(event) => setDraftNote(event.target.value)}
                    placeholder={t("logView.bookmarks.notePlaceholder")}
                    className="h-7 text-[11px]"
                    autoFocus
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onUpdateNote(bookmark.id, draftNote);
                        setEditingId(null);
                      }
                      if (event.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        onUpdateNote(bookmark.id, draftNote);
                        setEditingId(null);
                      }}
                    >
                      {t("common.save")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setEditingId(null)}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full text-left text-[10px] text-muted-foreground line-clamp-2 hover:text-foreground"
                  onClick={() => {
                    setEditingId(bookmark.id);
                    setDraftNote(bookmark.note || "");
                  }}
                >
                  {bookmark.note || t("logView.bookmarks.addNote")}
                </button>
              )}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(bookmark.id)}
                  aria-label={t("logView.bookmarks.remove")}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
