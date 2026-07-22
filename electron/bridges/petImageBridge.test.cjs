const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  savePetImageFile,
  readPetImageFile,
  clearPetImageFile,
  parseImageDataUrl,
  getPetAssetsDir,
  MAX_IMAGE_BYTES,
} = require("./petImageBridge.cjs");

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

function makeTempUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pet-image-test-"));
}

test("parseImageDataUrl accepts a well-formed PNG data URL", () => {
  const parsed = parseImageDataUrl(TINY_PNG_DATA_URL);
  assert.equal(parsed.mime, "image/png");
  assert.ok(parsed.buffer.length > 0);
});

test("parseImageDataUrl rejects non-data-URL input, wrong mime types, and empty payloads", () => {
  assert.equal(parseImageDataUrl("not-a-data-url"), null);
  assert.equal(parseImageDataUrl("data:image/gif;base64,AAAA"), null, "only png/webp are accepted");
  assert.equal(parseImageDataUrl("data:image/png;base64,"), null);
  assert.equal(parseImageDataUrl(null), null);
  assert.equal(parseImageDataUrl(42), null);
});

test("parseImageDataUrl rejects a payload over the size ceiling", () => {
  const hugeBase64 = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1).toString("base64");
  assert.equal(parseImageDataUrl(`data:image/png;base64,${hugeBase64}`), null);
});

test("savePetImageFile writes to userData/pet-assets and readPetImageFile round-trips it", () => {
  const userDataPath = makeTempUserDataDir();

  const saveResult = savePetImageFile(userDataPath, TINY_PNG_DATA_URL);
  assert.equal(saveResult.success, true);
  assert.ok(fs.existsSync(path.join(getPetAssetsDir(userDataPath), "custom-image.png")));

  const readResult = readPetImageFile(userDataPath);
  assert.equal(readResult.success, true);
  assert.equal(readResult.dataUrl, TINY_PNG_DATA_URL);
});

test("savePetImageFile rejects invalid image data without touching disk", () => {
  const userDataPath = makeTempUserDataDir();
  const result = savePetImageFile(userDataPath, "garbage");
  assert.equal(result.success, false);
  assert.equal(fs.existsSync(getPetAssetsDir(userDataPath)), false);
});

test("savePetImageFile replaces a previous image saved under a different extension", () => {
  const userDataPath = makeTempUserDataDir();
  const webpLikeButActuallyPng = TINY_PNG_DATA_URL; // reuse a valid png payload

  savePetImageFile(userDataPath, webpLikeButActuallyPng);
  assert.ok(fs.existsSync(path.join(getPetAssetsDir(userDataPath), "custom-image.png")));

  // Re-saving shouldn't leave two files around, even hypothetically across mime changes.
  savePetImageFile(userDataPath, TINY_PNG_DATA_URL);
  const filesAfter = fs.readdirSync(getPetAssetsDir(userDataPath));
  assert.deepEqual(filesAfter, ["custom-image.png"]);
});

test("readPetImageFile reports failure when no image has been saved", () => {
  const userDataPath = makeTempUserDataDir();
  const result = readPetImageFile(userDataPath);
  assert.equal(result.success, false);
});

test("clearPetImageFile removes the saved image and is a safe no-op when nothing exists", () => {
  const userDataPath = makeTempUserDataDir();
  savePetImageFile(userDataPath, TINY_PNG_DATA_URL);
  assert.equal(readPetImageFile(userDataPath).success, true);

  assert.equal(clearPetImageFile(userDataPath).success, true);
  assert.equal(readPetImageFile(userDataPath).success, false);

  // Clearing again (nothing left to clear) must not throw or fail.
  assert.equal(clearPetImageFile(userDataPath).success, true);
});
