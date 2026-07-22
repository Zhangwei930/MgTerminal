/**
 * Edit one field across a host selection.
 *
 * Hosts owned by a managed data source are excluded and reported, because an
 * edit to one would be overwritten on the next sync.
 */
import React, { useMemo, useState } from "react";
import { useI18n } from "../../application/i18n/I18nProvider";
import type { Host } from "../../domain/models";
import { applyHostBulkEdit, planHostBulkEdit } from "../../domain/hostBulkEdit";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export interface HostBulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hosts: Host[];
  selectedHostIds: ReadonlySet<string>;
  onApply: (hosts: Host[], updated: number) => void;
}

export const HostBulkEditDialog: React.FC<HostBulkEditDialogProps> = ({
  open,
  onOpenChange,
  hosts,
  selectedHostIds,
  onApply,
}) => {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [group, setGroup] = useState("");
  const [port, setPort] = useState("");
  const [addTags, setAddTags] = useState("");

  const plan = useMemo(
    () => planHostBulkEdit(hosts, selectedHostIds),
    [hosts, selectedHostIds],
  );

  const splitTags = (value: string) =>
    value.split(",").map((tag) => tag.trim()).filter(Boolean);

  const fields = {
    username,
    group,
    port: port.trim() ? Number(port) : undefined,
    addTags: splitTags(addTags),
  };

  const hasChange = Boolean(
    username.trim() || group.trim() || port.trim() || splitTags(addTags).length,
  );

  const handleApply = () => {
    const result = applyHostBulkEdit(hosts, selectedHostIds, fields);
    if (result.updated === 0) return;
    onApply(result.hosts, result.updated);
    setUsername("");
    setGroup("");
    setPort("");
    setAddTags("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("vault.hosts.bulkEdit.title")}</DialogTitle>
          <DialogDescription>
            {t("vault.hosts.bulkEdit.description", { count: plan.editable.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("vault.hosts.bulkEdit.blankHint")}
          </p>
          <div className="space-y-2">
            <Label>{t("vault.hosts.bulkEdit.username")}</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("vault.hosts.bulkEdit.group")}</Label>
            <Input value={group} onChange={(e) => setGroup(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("vault.hosts.bulkEdit.port")}</Label>
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              min={1}
              max={65535}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("vault.hosts.bulkEdit.addTags")}</Label>
            <Input
              value={addTags}
              onChange={(e) => setAddTags(e.target.value)}
              placeholder="prod, web"
            />
          </div>

          {plan.skippedManaged.length > 0 && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              {t("vault.hosts.bulkEdit.managedSkipped", { count: plan.skippedManaged.length })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleApply} disabled={!hasChange || plan.editable.length === 0}>
            {t("vault.hosts.bulkEdit.apply", { count: plan.editable.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HostBulkEditDialog;
