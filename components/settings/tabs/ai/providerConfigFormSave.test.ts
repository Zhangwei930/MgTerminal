import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression test for the "保存不了 AI 配置" silent failure: encryptField fails
// closed when the credential bridge / macOS Keychain is unavailable, and the
// save button invoked handleSave with `void`, so the rejection vanished and
// clicking 保存 did nothing with zero feedback. The failure must be caught and
// surfaced to the user instead.
const source = readFileSync(
  path.join(import.meta.dirname, "ProviderConfigForm.tsx"),
  "utf8",
);

test("provider save surfaces API key encryption failures instead of swallowing them", () => {
  const saveStart = source.indexOf("const handleSave");
  const saveEnd = source.indexOf("}, [", saveStart);
  const handleSave = source.slice(saveStart, saveEnd);

  assert.notEqual(saveStart, -1, "handleSave must exist");
  assert.match(
    handleSave,
    /try\s*\{[^}]*await encryptField\(form\.apiKey\)/,
    "API key encryption must run inside a try block",
  );
  assert.match(
    handleSave,
    /setApiKeyError\(/,
    "encryption failure must set a user-visible API key error",
  );
});

test("the API key error is rendered and localized in both locales", () => {
  assert.match(source, /\{apiKeyError\s*&&/, "form must render apiKeyError");

  for (const locale of ["en", "zh-CN"]) {
    const messages = readFileSync(
      path.join(import.meta.dirname, "../../../../application/i18n/locales", locale, "ai.ts"),
      "utf8",
    );
    assert.match(
      messages,
      /'ai\.providers\.apiKey\.encryptError':/,
      `${locale} locale must define ai.providers.apiKey.encryptError`,
    );
  }
});

test("a failed-to-decrypt stored key is preserved on save, never re-encrypted or dropped", () => {
  const saveStart = source.indexOf("const handleSave");
  const saveEnd = source.indexOf("}, [", saveStart);
  const handleSave = source.slice(saveStart, saveEnd);

  // Ciphertext that leaked into the form must not be re-encrypted into a nested blob.
  assert.match(
    handleSave,
    /isEncryptedCredentialPlaceholder\(form\.apiKey\)/,
    "save must detect a ciphertext blob in the form and avoid re-encrypting it",
  );
  // When the stored key could not be decrypted for display, preserve it instead
  // of overwriting with undefined.
  assert.match(
    handleSave,
    /apiKeyLoadFailed[\s\S]*updates\.apiKey\s*=\s*provider\.apiKey/,
    "save must keep the stored key when it failed to load",
  );
});

test("the decrypt-load error is rendered and localized in both locales", () => {
  assert.match(source, /apiKeyLoadFailed/, "form must track decrypt-load failure");
  assert.match(
    source,
    /ai\.providers\.apiKey\.decryptError/,
    "form must render the decryptError message",
  );

  for (const locale of ["en", "zh-CN"]) {
    const messages = readFileSync(
      path.join(import.meta.dirname, "../../../../application/i18n/locales", locale, "ai.ts"),
      "utf8",
    );
    assert.match(
      messages,
      /'ai\.providers\.apiKey\.decryptError':/,
      `${locale} locale must define ai.providers.apiKey.decryptError`,
    );
  }
});
