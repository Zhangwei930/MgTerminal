/**
 * Structured host search: `tag:web user:deploy nginx`.
 *
 * A term only becomes a filter when what precedes the colon is a *known* field
 * name. That single rule is what keeps `2001:db8::1` an IPv6 address and keeps
 * a Chinese label containing a full-width colon ordinary free text, instead of
 * both being silently swallowed as filters.
 *
 * Whatever is left over is handed to the existing host matcher untouched, so
 * pinyin, compact matching and IPv4 handling keep working exactly as before.
 */

import { matchesHostSearchQuery, matchesSearchQuery } from "../lib/searchMatcher";

export type HostSearchField = "tag" | "user" | "group" | "host";

export interface HostSearchFilter {
  field: HostSearchField;
  value: string;
}

export interface ParsedHostSearchQuery {
  filters: HostSearchFilter[];
  /** Terms that were not filters, rejoined for the existing matcher. */
  freeText: string;
}

export interface HostSearchTarget {
  label?: string | null;
  hostname?: string | null;
  group?: string | null;
  username?: string | null;
  tags?: Array<string | null | undefined> | null;
}

const FIELD_PATTERN = /^(tag|user|group|host):(.+)$/i;

export function parseHostSearchQuery(query: string): ParsedHostSearchQuery {
  const terms = String(query || "").trim().split(/\s+/).filter(Boolean);
  const filters: HostSearchFilter[] = [];
  const freeTerms: string[] = [];

  for (const term of terms) {
    const match = FIELD_PATTERN.exec(term);
    if (!match) {
      freeTerms.push(term);
      continue;
    }
    filters.push({
      field: match[1]!.toLowerCase() as HostSearchField,
      value: match[2]!,
    });
  }

  return { filters, freeText: freeTerms.join(" ") };
}

function fieldHaystack(host: HostSearchTarget, field: HostSearchField): string[] {
  switch (field) {
    case "tag":
      return (host.tags ?? []).filter((tag): tag is string => typeof tag === "string");
    case "user":
      return [host.username ?? ""];
    case "group":
      return [host.group ?? ""];
    case "host":
      return [host.hostname ?? ""];
  }
}

function matchesFilter(host: HostSearchTarget, filter: HostSearchFilter): boolean {
  const needle = filter.value.toLowerCase();
  return fieldHaystack(host, filter.field)
    .some((value) => value.toLowerCase().includes(needle));
}

export interface StructuredHostSearchOptions {
  /**
   * Extra fields the free-text half should also search (callers pass username
   * and notes). Kept opt-in so the filter half stays defined by the host shape.
   */
  extraFreeTextFields?: Array<string | null | undefined>;
}

export function matchesStructuredHostSearch(
  query: string,
  host: HostSearchTarget,
  options: StructuredHostSearchOptions = {},
): boolean {
  const { filters, freeText } = parseHostSearchQuery(query);
  if (!filters.every((filter) => matchesFilter(host, filter))) return false;
  if (!freeText) return true;
  if (matchesHostSearchQuery(freeText, host)) return true;
  const extras = options.extraFreeTextFields ?? [];
  return extras.length > 0 && matchesSearchQuery(freeText, ...extras);
}
