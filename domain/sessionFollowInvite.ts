/**
 * LAN follow invite codes — local-network multiplayer foundation.
 * Opt-in, short-lived, no cloud account.
 */

export const FOLLOW_INVITE_VERSION = 1;
export const FOLLOW_INVITE_DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const FOLLOW_INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export type SessionFollowInvitePayload = {
  v: number;
  /** Host IPv4/IPv6 for LAN join */
  host: string;
  port: number;
  /** Shared secret */
  token: string;
  sessionId: string;
  hostLabel?: string;
  expiresAt: number;
};

export function generateFollowInviteToken(bytes = 16): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buf = new Uint8Array(bytes);
    cryptoApi.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for older node without global crypto in pure domain tests
  let out = "";
  for (let i = 0; i < bytes; i += 1) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return out;
}

/** Human-friendly short code (e.g. XK4F-9Q2M) derived from token for display. */
export function formatFollowInviteCode(token: string): string {
  // Deterministic 8-char display code from token hex
  let n = 0;
  for (let i = 0; i < token.length; i += 1) {
    n = (n * 33 + token.charCodeAt(i)) >>> 0;
  }
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += FOLLOW_INVITE_CODE_ALPHABET[n % FOLLOW_INVITE_CODE_ALPHABET.length];
    n = Math.floor(n / FOLLOW_INVITE_CODE_ALPHABET.length) ^ (i + 1) * 2654435761;
    n >>>= 0;
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function createFollowInvitePayload(input: {
  host: string;
  port: number;
  sessionId: string;
  hostLabel?: string;
  token?: string;
  now?: number;
  ttlMs?: number;
}): SessionFollowInvitePayload {
  const now = input.now ?? Date.now();
  const ttl = input.ttlMs ?? FOLLOW_INVITE_DEFAULT_TTL_MS;
  return {
    v: FOLLOW_INVITE_VERSION,
    host: input.host.trim(),
    port: Math.trunc(input.port),
    token: input.token || generateFollowInviteToken(),
    sessionId: input.sessionId,
    hostLabel: input.hostLabel?.trim() || undefined,
    expiresAt: now + ttl,
  };
}

export function isFollowInviteExpired(
  payload: Pick<SessionFollowInvitePayload, "expiresAt">,
  now = Date.now(),
): boolean {
  return !Number.isFinite(payload.expiresAt) || payload.expiresAt <= now;
}

/** Compact share string: magies-follow:1:<base64url(json)> */
export function encodeFollowInviteShareString(payload: SessionFollowInvitePayload): string {
  const json = JSON.stringify(payload);
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf8").toString("base64url")
    : btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `magies-follow:${payload.v}:${b64}`;
}

export function decodeFollowInviteShareString(
  value: string,
): { ok: true; payload: SessionFollowInvitePayload } | { ok: false; error: string } {
  const raw = String(value || "").trim();
  if (!raw) return { ok: false, error: "empty" };

  // Allow pasting "host:port code" is handled elsewhere; here only share strings.
  const match = /^magies-follow:(\d+):([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match) return { ok: false, error: "format" };

  try {
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(match[2]!, "base64url").toString("utf8")
      : decodeURIComponent(escape(atob(match[2]!.replace(/-/g, "+").replace(/_/g, "/"))));
    const parsed = JSON.parse(json) as SessionFollowInvitePayload;
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "payload" };
    if (Number(parsed.v) !== FOLLOW_INVITE_VERSION) return { ok: false, error: "version" };
    if (typeof parsed.host !== "string" || !parsed.host.trim()) return { ok: false, error: "host" };
    if (!Number.isFinite(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
      return { ok: false, error: "port" };
    }
    if (typeof parsed.token !== "string" || parsed.token.length < 8) return { ok: false, error: "token" };
    if (typeof parsed.sessionId !== "string" || !parsed.sessionId) return { ok: false, error: "session" };
    if (!Number.isFinite(parsed.expiresAt)) return { ok: false, error: "expires" };
    return {
      ok: true,
      payload: {
        v: FOLLOW_INVITE_VERSION,
        host: parsed.host.trim(),
        port: Math.trunc(parsed.port),
        token: parsed.token,
        sessionId: parsed.sessionId,
        hostLabel: typeof parsed.hostLabel === "string" ? parsed.hostLabel : undefined,
        expiresAt: Number(parsed.expiresAt),
      },
    };
  } catch {
    return { ok: false, error: "decode" };
  }
}

type LanIfaceEntry = { family?: string | number; address?: string; internal?: boolean };

export function listLanIPv4Addresses(
  networkInterfaces: Record<string, LanIfaceEntry[] | undefined> | null | undefined,
): string[] {
  const out: string[] = [];
  for (const entries of Object.values(networkInterfaces || {})) {
    if (!entries) continue;
    for (const entry of entries) {
      const family = entry.family;
      const isV4 = family === "IPv4" || family === 4;
      if (!isV4 || entry.internal || !entry.address) continue;
      out.push(entry.address);
    }
  }
  return out;
}
