/**
 * Desktop pet custom image storage (Settings → AI → Pet).
 *
 * The image bytes live on disk under userData/pet-assets/, not in localStorage:
 * a sprite sheet's base64 form can run several MB, and localStorage is a small
 * shared quota across all of the app's other data. Only the tiny {cols, rows,
 * frameRanges, version} metadata is kept in localStorage (see
 * application/state/usePetImageConfig.ts) — the renderer fetches the actual
 * image bytes through the IPC handlers here, keyed off that version bumping.
 */

const fs = require("node:fs");
const path = require("node:path");

const PET_ASSETS_DIR = "pet-assets";
// Sprite sheets can legitimately run a few MB; this is a sanity ceiling against
// a corrupted/malicious payload, not a tight product limit like the old
// localStorage-bound cap.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:png|webp));base64,([a-zA-Z0-9+/=]+)$/;
const KNOWN_EXTENSIONS = [
  { ext: "png", mime: "image/png" },
  { ext: "webp", mime: "image/webp" },
];

function getPetAssetsDir(userDataPath) {
  if (!userDataPath) return null;
  return path.join(userDataPath, PET_ASSETS_DIR);
}

function extensionForMime(mime) {
  return mime === "image/webp" ? "webp" : "png";
}

function findExistingPetImageFile(userDataPath) {
  const dir = getPetAssetsDir(userDataPath);
  if (!dir || !fs.existsSync(dir)) return null;
  for (const { ext, mime } of KNOWN_EXTENSIONS) {
    const filePath = path.join(dir, `custom-image.${ext}`);
    if (fs.existsSync(filePath)) return { filePath, mime };
  }
  return null;
}

/** Parses a `data:image/(png|webp);base64,...` URL into its mime type and raw bytes. */
function parseImageDataUrl(dataUrl) {
  const match = typeof dataUrl === "string" ? DATA_URL_RE.exec(dataUrl) : null;
  if (!match) return null;
  const [, mime, base64] = match;
  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return null;
  }
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer };
}

function savePetImageFile(userDataPath, dataUrl) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) return { success: false, error: "Invalid or oversized image data" };
  const dir = getPetAssetsDir(userDataPath);
  if (!dir) return { success: false, error: "No user data directory available" };
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const { ext } of KNOWN_EXTENSIONS) {
      const stale = path.join(dir, `custom-image.${ext}`);
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    }
    const filePath = path.join(dir, `custom-image.${extensionForMime(parsed.mime)}`);
    fs.writeFileSync(filePath, parsed.buffer, { mode: 0o600 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "Failed to save image" };
  }
}

function readPetImageFile(userDataPath) {
  const found = findExistingPetImageFile(userDataPath);
  if (!found) return { success: false };
  try {
    const buffer = fs.readFileSync(found.filePath);
    return { success: true, dataUrl: `data:${found.mime};base64,${buffer.toString("base64")}` };
  } catch (err) {
    return { success: false, error: err?.message || "Failed to read image" };
  }
}

function clearPetImageFile(userDataPath) {
  const dir = getPetAssetsDir(userDataPath);
  if (!dir) return { success: true };
  try {
    for (const { ext } of KNOWN_EXTENSIONS) {
      const filePath = path.join(dir, `custom-image.${ext}`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "Failed to clear image" };
  }
}

module.exports = {
  savePetImageFile,
  readPetImageFile,
  clearPetImageFile,
  parseImageDataUrl,
  getPetAssetsDir,
  MAX_IMAGE_BYTES,
};
