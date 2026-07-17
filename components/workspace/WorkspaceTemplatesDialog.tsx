import { LayoutTemplate, Play, Trash2 } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import type { WorkspaceTemplate } from "../../domain/workspaceTemplates";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";

export type WorkspaceTemplatesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: WorkspaceTemplate[];
  onApply: (template: WorkspaceTemplate) => void;
  onDelete: (templateId: string) => void;
  onRename: (templateId: string, name: string) => void;
};

export const WorkspaceTemplatesDialog: React.FC<WorkspaceTemplatesDialogProps> = ({
  open,
  onOpenChange,
  templates,
  onApply,
  onDelete,
  onRename,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((item) => item.name.toLowerCase().includes(q));
  }, [query, templates]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate size={16} />
            {t("workspace.templates.title")}
          </DialogTitle>
        </DialogHeader>

        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("workspace.templates.search")}
          className="h-8"
        />

        <ScrollArea className="flex-1 min-h-[200px] max-h-[360px] border rounded-md">
          <div className="p-2 space-y-1.5">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">
                {templates.length === 0
                  ? t("workspace.templates.empty")
                  : t("workspace.templates.noMatch")}
              </p>
            ) : (
              filtered.map((template) => (
                <div
                  key={template.id}
                  className="rounded-md border border-border/50 bg-card/40 px-2.5 py-2 space-y-1.5"
                >
                  {editingId === template.id ? (
                    <div className="flex gap-1.5">
                      <Input
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            onRename(template.id, draftName);
                            setEditingId(null);
                          }
                          if (event.key === "Escape") setEditingId(null);
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7"
                        onClick={() => {
                          onRename(template.id, draftName);
                          setEditingId(null);
                        }}
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="text-sm font-medium text-left w-full truncate hover:text-primary"
                      onClick={() => {
                        setEditingId(template.id);
                        setDraftName(template.name);
                      }}
                      title={t("workspace.templates.renameHint")}
                    >
                      {template.name}
                    </button>
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    {t("workspace.templates.paneCount", { count: template.panes.length })}
                    {" · "}
                    {template.viewMode === "focus"
                      ? t("workspace.templates.viewFocus")
                      : t("workspace.templates.viewSplit")}
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        onApply(template);
                        onOpenChange(false);
                      }}
                    >
                      <Play size={12} />
                      {t("workspace.templates.apply")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(template.id)}
                      aria-label={t("workspace.templates.delete")}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export type SaveWorkspaceTemplateDialogProps = {
  open: boolean;
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
};

export const SaveWorkspaceTemplateDialog: React.FC<SaveWorkspaceTemplateDialogProps> = ({
  open,
  defaultName,
  onOpenChange,
  onSave,
}) => {
  const { t } = useI18n();
  const [name, setName] = useState(defaultName);

  React.useEffect(() => {
    if (open) setName(defaultName);
  }, [defaultName, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("workspace.templates.saveTitle")}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("workspace.templates.namePlaceholder")}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) {
              onSave(name.trim());
              onOpenChange(false);
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onSave(name.trim());
              onOpenChange(false);
            }}
          >
            {t("workspace.templates.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
