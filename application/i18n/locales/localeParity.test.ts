import assert from "node:assert/strict";
import test from "node:test";

import en from "./en.ts";
import ru from "./ru.ts";
import zhCN from "./zh-CN.ts";

// ru and zh-CN are the fully localized locales (see settingsLocales.test.ts);
// every en key must exist so no UI string silently falls back to English.
const FULLY_LOCALIZED = [
  { name: "ru", messages: ru },
  { name: "zh-CN", messages: zhCN },
];

test("fully localized locales cover every en message key", () => {
  const enKeys = Object.keys(en);
  for (const locale of FULLY_LOCALIZED) {
    const missing = enKeys.filter((key) => !(key in locale.messages));
    assert.deepEqual(
      missing,
      [],
      `${locale.name} is missing ${missing.length} en keys`,
    );
  }
});
