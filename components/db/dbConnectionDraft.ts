import { defaultPortForEngine, isFileEngine, type DbConnectionProfile, type DbEngine } from '../../domain/models';

/** The in-progress state of the "new database connection" form. */
export interface DbConnectionDraft {
  label: string;
  engine: DbEngine;
  hostId: string;
  remoteHost: string;
  remotePort: number;
  database: string;
  dbUsername: string;
  dbPassword: string;
  /**
   * TLS for a direct connection. 'disable' is right inside an SSH tunnel,
   * where the transport is already encrypted; on a direct dial it is what
   * sends the password in clear text.
   */
  sslMode: 'disable' | 'require' | 'verify';
}

export function emptyDbConnectionDraft(): DbConnectionDraft {
  return {
    label: '',
    engine: 'mysql',
    hostId: '',
    remoteHost: '127.0.0.1',
    remotePort: defaultPortForEngine('mysql'),
    database: '',
    dbUsername: '',
    dbPassword: '',
    sslMode: 'disable',
  };
}

/**
 * Whether the draft has what a connection cannot exist without — only a label.
 *
 * An SSH host is deliberately not required: a database reachable from this
 * machine needs no tunnel, and demanding one is what forced every connection
 * to carry two different "host" fields.
 */
export function canSaveDbConnectionDraft(draft: DbConnectionDraft): boolean {
  if (!draft.label.trim()) return false;
  // A file engine with no path cannot connect at all, and the error it would
  // produce arrives long after the form is gone.
  if (isFileEngine(draft.engine) && !draft.remoteHost.trim()) return false;
  return true;
}

/**
 * Retargets the port when the engine changes, but only if the current port is
 * still the outgoing engine's default — i.e. the user never chose one.
 * Overwriting a deliberate port would silently point the connection at a
 * different database than intended.
 */
export function applyEngineToDraft(draft: DbConnectionDraft, engine: DbEngine): DbConnectionDraft {
  return {
    ...draft,
    engine,
    remotePort: draft.remotePort === defaultPortForEngine(draft.engine)
      ? defaultPortForEngine(engine)
      : draft.remotePort,
  };
}

/**
 * Converts the draft into what onAddDbConnection expects. Optional text fields
 * collapse to undefined so a blank input is not stored as an empty string, and
 * an empty host address means "the SSH host itself", where the tunnel lands.
 *
 * The password is deliberately not trimmed: surrounding whitespace can be part
 * of it, and stripping it would fail authentication with no visible reason.
 */
export function buildDbConnectionPayload(
  draft: DbConnectionDraft,
): Omit<DbConnectionProfile, 'id' | 'order' | 'createdAt'> {
  // A file engine has no server to reach: remoteHost carries the database file
  // path, and defaulting it to 127.0.0.1 would turn a blank path into a
  // nonsense filename rather than an obvious "no file chosen".
  if (isFileEngine(draft.engine)) {
    return {
      label: draft.label.trim(),
      engine: draft.engine,
      hostId: '',
      remoteHost: draft.remoteHost.trim(),
      remotePort: 0,
    };
  }

  return {
    label: draft.label.trim(),
    engine: draft.engine,
    hostId: draft.hostId,
    remoteHost: draft.remoteHost.trim() || '127.0.0.1',
    remotePort: draft.remotePort,
    database: draft.database.trim() || undefined,
    dbUsername: draft.dbUsername.trim() || undefined,
    dbPassword: draft.dbPassword || undefined,
    // Stored only when it is on: an absent field reads as 'disable', which
    // keeps every connection saved before this existed behaving as it did.
    ssl: draft.sslMode === 'disable' ? undefined : { mode: draft.sslMode },
  };
}

/**
 * Loads a saved connection into the form for editing.
 *
 * The password is deliberately left blank. What is stored may be plaintext or
 * an enc:v1/enc:v2 placeholder that failed to decrypt — pre-filling either is
 * wrong: a placeholder would be re-encrypted into nested ciphertext, and an
 * edit form has no business displaying a real password. Blank means
 * "leave the stored password alone".
 */
export function draftFromDbConnection(profile: DbConnectionProfile): DbConnectionDraft {
  return {
    label: profile.label,
    engine: profile.engine,
    hostId: profile.hostId,
    remoteHost: profile.remoteHost || (isFileEngine(profile.engine) ? '' : '127.0.0.1'),
    remotePort: profile.remotePort,
    database: profile.database ?? '',
    dbUsername: profile.dbUsername ?? '',
    dbPassword: '',
    sslMode: profile.ssl?.mode ?? 'disable',
  };
}

/**
 * Merges an edited draft back onto the stored connection. Identity and
 * ordering (`id`, `order`, `createdAt`) are preserved, and a blank password
 * keeps whatever was stored.
 */
export function buildDbConnectionUpdate(
  draft: DbConnectionDraft,
  existing: DbConnectionProfile,
): DbConnectionProfile {
  const payload = buildDbConnectionPayload(draft);
  return {
    ...existing,
    ...payload,
    dbPassword: draft.dbPassword ? payload.dbPassword : existing.dbPassword,
  };
}
