/**
 * Renaming a data source's fields onto the canonical inventory shape, so a
 * JSON feed that calls things `name` / `ip` / `ssh_port` can be consumed
 * without editing the feed.
 *
 * Mapping is a rename and nothing else. It deliberately does not remove
 * anything, so the inventory's own secret check still sees the raw payload:
 * a mapping must never become a way to launder a forbidden field past it.
 */

/** Mirrors FORBIDDEN_SECRET_KEYS in hostDataSource.ts. */
const SECRET_SOURCE_FIELDS = new Set([
  "password",
  "passphrase",
  "privatekey",
  "private_key",
  "secret",
  "token",
  "apikey",
  "api_key",
]);

export type MappableHostField =
  | "id"
  | "label"
  | "hostname"
  | "port"
  | "username"
  | "group"
  | "tags";

/** Canonical field -> field name in the source document. */
export type HostFieldMapping = Partial<Record<MappableHostField, string>>;

export type HostFieldMappingValidation =
  | { ok: true }
  | { ok: false; field: MappableHostField; sourceField: string };

export function isSecretSourceField(field: string): boolean {
  return SECRET_SOURCE_FIELDS.has(field.trim().toLowerCase());
}

/**
 * A mapping like `hostname: "password"` would copy a secret into a field that
 * is allowed, leaving no forbidden key for the inventory check to find. Reject
 * it at configuration time rather than discovering it per host.
 */
export function validateHostFieldMapping(
  mapping: HostFieldMapping | undefined,
): HostFieldMappingValidation {
  for (const [field, sourceField] of Object.entries(mapping ?? {})) {
    if (typeof sourceField !== "string" || !sourceField.trim()) continue;
    if (isSecretSourceField(sourceField)) {
      return { ok: false, field: field as MappableHostField, sourceField };
    }
  }
  return { ok: true };
}

export function applyHostFieldMapping(
  item: Record<string, unknown>,
  mapping: HostFieldMapping | undefined,
): Record<string, unknown> {
  const entries = Object.entries(mapping ?? {})
    .filter(([, sourceField]) => typeof sourceField === "string" && sourceField.trim());
  if (entries.length === 0) return item;

  const mapped: Record<string, unknown> = { ...item };
  for (const [field, sourceField] of entries) {
    const value = item[(sourceField as string).trim()];
    if (value === undefined) continue;
    mapped[field] = value;
  }
  return mapped;
}
