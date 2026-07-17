import type { PortForwardChannel } from "./models/portForwarding";

export function formatByteCount(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "0 B";
  if (n < 1024) return `${Math.floor(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatChannelDuration(openedAt: number, now = Date.now()): string {
  const ms = Math.max(0, now - openedAt);
  const totalSec = Math.floor(ms / 1000);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60) % 60;
  const hr = Math.floor(totalSec / 3600);
  if (hr > 0) return `${hr}h ${min}m`;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
}

export function filterChannelsByRuleId(
  channels: readonly PortForwardChannel[],
  ruleId: string | null | undefined,
): PortForwardChannel[] {
  if (!ruleId) return [...channels];
  return channels.filter((channel) => channel.ruleId === ruleId);
}

export function sortChannelsByOpenedAt(
  channels: readonly PortForwardChannel[],
): PortForwardChannel[] {
  return [...channels].sort((a, b) => b.openedAt - a.openedAt);
}
