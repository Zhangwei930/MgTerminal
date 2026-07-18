/**
 * WAN follow invite (v2) — same product semantics as LAN, transport via relay.
 * Share string: magies-follow:2:<base64url(json)>
 */

import {
  decodeFollowInviteShareString,
  type SessionFollowInvitePayload,
} from "./sessionFollowInvite";

export const FOLLOW_WAN_INVITE_VERSION = 2;
export const FOLLOW_WAN_INVITE_DEFAULT_TTL_MS = 30 * 60 * 1000;

export type SessionFollowWanInvitePayload = {
  v: typeof FOLLOW_WAN_INVITE_VERSION;
  /** Public relay host (TCP NDJSON). */
  relayHost: string;
  relayPort: number;
  roomId: string;
  token: string;
  sessionId: string;
  hostLabel?: string;
  expiresAt: number;
};

export function createFollowWanInvitePayload(input: {
  relayHost: string;
  relayPort: number;
  roomId?: string;
  sessionId: string;
  hostLabel?: string;
  token?: string;
  now?: number;
  ttlMs?: number;
}): SessionFollowWanInvitePayload {
  const now = input.now ?? Date.now();
  const ttl = input.ttlMs ?? FOLLOW_WAN_INVITE_DEFAULT_TTL_MS;
  const host = String(input.relayHost || "").trim();
  const port = Math.trunc(Number(input.relayPort));
  return {
    v: FOLLOW_WAN_INVITE_VERSION,
    relayHost: host,
    relayPort: port,
    roomId: (input.roomId || generateRoomId()).trim(),
    token: input.token || generateToken(),
    sessionId: input.sessionId,
    hostLabel: input.hostLabel?.trim() || undefined,
    expiresAt: now + ttl,
  };
}

export function isFollowWanInviteExpired(
  payload: Pick<SessionFollowWanInvitePayload, "expiresAt">,
  now = Date.now(),
): boolean {
  return !Number.isFinite(payload.expiresAt) || payload.expiresAt <= now;
}

export function encodeFollowWanInviteShareString(
  payload: SessionFollowWanInvitePayload,
): string {
  const json = JSON.stringify(payload);
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(json, "utf8").toString("base64url")
    : btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `magies-follow:${payload.v}:${b64}`;
}

export function decodeFollowWanInviteShareString(
  value: string,
): { ok: true; payload: SessionFollowWanInvitePayload } | { ok: false; error: string } {
  const raw = String(value || "").trim();
  const match = /^magies-follow:(\d+):([A-Za-z0-9_-]+)$/.exec(raw);
  if (!match) return { ok: false, error: "format" };
  if (Number(match[1]) !== FOLLOW_WAN_INVITE_VERSION) return { ok: false, error: "version" };
  try {
    const json = typeof Buffer !== "undefined"
      ? Buffer.from(match[2]!, "base64url").toString("utf8")
      : decodeURIComponent(escape(atob(match[2]!.replace(/-/g, "+").replace(/_/g, "/"))));
    const parsed = JSON.parse(json) as SessionFollowWanInvitePayload;
    if (!parsed || typeof parsed !== "object") return { ok: false, error: "payload" };
    const relayHost = typeof parsed.relayHost === "string"
      ? parsed.relayHost.trim()
      : "";
    // Backward-compat: older drafts used relayUrl (ws/wss or host:port).
    let host = relayHost;
    let port = Math.trunc(Number(parsed.relayPort));
    if (!host && typeof (parsed as { relayUrl?: string }).relayUrl === "string") {
      const parsedUrl = parseRelayEndpoint((parsed as { relayUrl: string }).relayUrl);
      if (parsedUrl) {
        host = parsedUrl.host;
        port = parsedUrl.port;
      }
    }
    if (!host) return { ok: false, error: "relayHost" };
    if (!Number.isFinite(port) || port < 1 || port > 65535) return { ok: false, error: "relayPort" };
    if (typeof parsed.roomId !== "string" || !parsed.roomId.trim()) {
      return { ok: false, error: "roomId" };
    }
    if (typeof parsed.token !== "string" || parsed.token.length < 8) {
      return { ok: false, error: "token" };
    }
    if (typeof parsed.sessionId !== "string" || !parsed.sessionId) {
      return { ok: false, error: "session" };
    }
    if (!Number.isFinite(parsed.expiresAt)) return { ok: false, error: "expires" };
    return {
      ok: true,
      payload: {
        v: FOLLOW_WAN_INVITE_VERSION,
        relayHost: host,
        relayPort: port,
        roomId: parsed.roomId.trim(),
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

/**
 * Decode either LAN (v1) or WAN (v2) share strings.
 */
export function decodeAnyFollowInviteShareString(value: string):
  | { ok: true; kind: "lan"; payload: SessionFollowInvitePayload }
  | { ok: true; kind: "wan"; payload: SessionFollowWanInvitePayload }
  | { ok: false; error: string } {
  const raw = String(value || "").trim();
  const match = /^magies-follow:(\d+):/.exec(raw);
  if (!match) return { ok: false, error: "format" };
  const version = Number(match[1]);
  if (version === 1) {
    const decoded = decodeFollowInviteShareString(raw);
    if (!decoded.ok) return decoded;
    return { ok: true, kind: "lan", payload: decoded.payload };
  }
  if (version === FOLLOW_WAN_INVITE_VERSION) {
    const decoded = decodeFollowWanInviteShareString(raw);
    if (!decoded.ok) return decoded;
    return { ok: true, kind: "wan", payload: decoded.payload };
  }
  return { ok: false, error: "version" };
}

/** Parse host:port, ws(s)://host:port, or bare host (port required separately). */
export function parseRelayEndpoint(
  value: string,
  fallbackPort?: number,
): { host: string; port: number } | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (/:\/\//.test(trimmed)) {
    // Only ws/wss forms are accepted as URL endpoints (TCP relay is host:port).
    if (!/^wss?:\/\//i.test(trimmed)) return null;
    try {
      const normalized = trimmed.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
      const u = new URL(normalized);
      // Browser/Node URL hides default ports (443/80) as empty string.
      const port = u.port
        ? Number(u.port)
        : (fallbackPort ?? (u.protocol === "https:" ? 443 : 80));
      if (!u.hostname || !Number.isFinite(port) || port < 1) return null;
      return { host: u.hostname, port };
    } catch {
      return null;
    }
  }
  const hostPort = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(trimmed);
  if (hostPort) {
    return { host: hostPort[1]!.replace(/^\[|\]$/g, ""), port: Number(hostPort[2]) };
  }
  if (fallbackPort && Number.isFinite(fallbackPort)) {
    return { host: trimmed, port: Math.trunc(fallbackPort) };
  }
  return null;
}

/** @deprecated use parseRelayEndpoint — kept for tests that still name it. */
export function normalizeRelayUrl(url: string): string {
  const parsed = parseRelayEndpoint(url);
  return parsed ? `${parsed.host}:${parsed.port}` : "";
}

function generateToken(bytes = 16): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buf = new Uint8Array(bytes);
    cryptoApi.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  let out = "";
  for (let i = 0; i < bytes; i += 1) {
    out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return out;
}

function generateRoomId(): string {
  return `room-${generateToken(8)}`;
}
