/**
 * dl.magies.top — free download/update mirror for mainland-China users.
 *
 * A Cloudflare Worker that proxies GitHub Releases in real time (no storage,
 * no sync, free plan): mainland users cannot reach github.com, but Cloudflare
 * edges can. The MgTerminal app and the MagiesShell website hit this worker
 * when the region heuristic prefers the mirror (see updateMirror.ts).
 *
 *   GET /stable/release.json  -> manifest synthesized from the GitHub API
 *                                latest-release payload (edge-cached)
 *   GET /stable/<asset>       -> streams the asset of the LATEST release
 *                                (github.com/<repo>/releases/latest/download)
 *   POST /crash-report        -> opt-in anonymous crash telemetry from the
 *                                app; stored via the CRASH_REPORTS Analytics
 *                                Engine binding (501 when not bound)
 *
 * Deploy: `npx wrangler deploy` from this directory.
 */

/* global fetch, Response, Headers, URL */

const REPO = "JasonZhangDad/MgTerminal-releases";
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const MANIFEST_TTL_SECONDS = 300;
const ASSET_TTL_SECONDS = 3600;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
};

const CRASH_REPORT_MAX_BYTES = 32 * 1024;

/** Minimal shape check for an app crash-report payload. */
export function validateCrashReport(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    payload.schema === 1 &&
    typeof payload.message === "string" &&
    typeof payload.appVersion === "string" &&
    typeof payload.platform === "string",
  );
}

async function serveCrashReport(request, env) {
  const binding = env?.CRASH_REPORTS;
  if (!binding || typeof binding.writeDataPoint !== "function") {
    return new Response("crash reporting not configured", { status: 501, headers: CORS_HEADERS });
  }

  const body = await request.text();
  if (body.length > CRASH_REPORT_MAX_BYTES) {
    return new Response("payload too large", { status: 413, headers: CORS_HEADERS });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }
  if (!validateCrashReport(payload)) {
    return new Response("invalid crash report", { status: 400, headers: CORS_HEADERS });
  }

  binding.writeDataPoint({
    blobs: [
      String(payload.source ?? "").slice(0, 96),
      payload.message.slice(0, 256),
      payload.appVersion.slice(0, 32),
      payload.platform.slice(0, 16),
      String(payload.arch ?? "").slice(0, 16),
      String(payload.electronVersion ?? "").slice(0, 32),
      String(payload.osVersion ?? "").slice(0, 32),
    ],
    doubles: [Number(payload.uptimeSeconds) || 0],
    indexes: [payload.appVersion.slice(0, 32)],
  });
  return new Response(null, { status: 202, headers: CORS_HEADERS });
}

/** Map the GitHub API release payload to the mirror manifest schema. */
export function buildManifest(apiRelease, origin) {
  const tag = String(apiRelease.tag_name || "");
  return {
    version: tag.replace(/^v/i, ""),
    tag,
    publishedAt: apiRelease.published_at || "",
    files: (apiRelease.assets || []).map((asset) => ({
      name: asset.name,
      size: asset.size ?? 0,
      url: `${origin}/stable/${asset.name}`,
    })),
  };
}

/** Extract the asset filename from /stable/<name>; null for anything else. */
export function resolveAssetName(pathname) {
  const match = /^\/stable\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  const name = decodeURIComponent(match[1]);
  if (!name || name === "release.json") return null;
  return name;
}

async function serveManifest(origin) {
  const upstream = await fetch(API_LATEST, {
    headers: {
      "User-Agent": "mgterminal-mirror-worker",
      Accept: "application/vnd.github+json",
    },
    cf: { cacheTtl: MANIFEST_TTL_SECONDS, cacheEverything: true },
  });
  if (!upstream.ok) {
    return new Response(`GitHub API ${upstream.status}`, { status: 502, headers: CORS_HEADERS });
  }
  const manifest = buildManifest(await upstream.json(), origin);
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${MANIFEST_TTL_SECONDS}`,
    },
  });
}

async function serveAsset(name, request) {
  // Forward Range so electron-updater differential downloads and resumed
  // downloads get 206 partial responses instead of the whole file.
  const upstreamHeaders = {};
  const range = request.headers.get("Range");
  if (range) upstreamHeaders.Range = range;

  const upstream = await fetch(
    `https://github.com/${REPO}/releases/latest/download/${encodeURIComponent(name)}`,
    {
      headers: upstreamHeaders,
      redirect: "follow",
      // Edge caching swallows Range and always answers 200 with the whole
      // file, so ranged requests (resume / differential update) skip cache.
      cf: range ? undefined : { cacheTtl: ASSET_TTL_SECONDS, cacheEverything: true },
    },
  );
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`upstream ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
      headers: CORS_HEADERS,
    });
  }
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/crash-report") {
      return serveCrashReport(request, env);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }
    if (url.pathname === "/stable/release.json") {
      return serveManifest(url.origin);
    }
    const assetName = resolveAssetName(url.pathname);
    if (assetName) {
      return serveAsset(assetName, request);
    }
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
