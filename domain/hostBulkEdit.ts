/**
 * Editing one field across many hosts at once.
 *
 * Hosts owned by a managed data source are deliberately excluded: an edit to
 * one would be overwritten on the next sync, so it is reported back to the user
 * instead of being applied and quietly lost.
 */

import type { Host } from "./models";

export interface HostBulkEditFields {
  username?: string;
  group?: string;
  port?: number;
  /** Added to whatever each host already has, never replacing the list. */
  addTags?: string[];
  removeTags?: string[];
}

export interface HostBulkEditPlan {
  editable: Host[];
  skippedManaged: Host[];
}

export interface HostBulkEditResult {
  hosts: Host[];
  updated: number;
  skippedManaged: number;
}

export function planHostBulkEdit(
  hosts: Host[],
  selectedIds: ReadonlySet<string>,
): HostBulkEditPlan {
  const editable: Host[] = [];
  const skippedManaged: Host[] = [];
  for (const host of hosts) {
    if (!selectedIds.has(host.id)) continue;
    if (host.managedSourceId) skippedManaged.push(host);
    else editable.push(host);
  }
  return { editable, skippedManaged };
}

function cleanText(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  // Blank means "leave this field alone"; clearing a field across a whole
  // selection is destructive enough that it should be an explicit action.
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanPort(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const port = Math.trunc(value);
  return port >= 1 && port <= 65535 ? port : undefined;
}

function nextTags(host: Host, fields: HostBulkEditFields): string[] | undefined {
  const add = fields.addTags?.filter((tag) => tag.trim().length > 0) ?? [];
  const remove = new Set(fields.removeTags?.filter((tag) => tag.trim().length > 0) ?? []);
  if (add.length === 0 && remove.size === 0) return undefined;

  const tags = (host.tags ?? []).filter((tag) => !remove.has(tag));
  for (const tag of add) {
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function applyHostBulkEdit(
  hosts: Host[],
  selectedIds: ReadonlySet<string>,
  fields: HostBulkEditFields,
): HostBulkEditResult {
  const username = cleanText(fields.username);
  const group = cleanText(fields.group);
  const port = cleanPort(fields.port);
  const hasTagChange = Boolean(fields.addTags?.length || fields.removeTags?.length);

  if (username === undefined && group === undefined && port === undefined && !hasTagChange) {
    return { hosts, updated: 0, skippedManaged: 0 };
  }

  const { editable, skippedManaged } = planHostBulkEdit(hosts, selectedIds);
  const editableIds = new Set(editable.map((host) => host.id));

  const next = hosts.map((host) => {
    if (!editableIds.has(host.id)) return host;
    const tags = nextTags(host, fields);
    return {
      ...host,
      ...(username !== undefined ? { username } : {}),
      ...(group !== undefined ? { group } : {}),
      ...(port !== undefined ? { port } : {}),
      ...(tags !== undefined ? { tags } : {}),
    };
  });

  return { hosts: next, updated: editable.length, skippedManaged: skippedManaged.length };
}
