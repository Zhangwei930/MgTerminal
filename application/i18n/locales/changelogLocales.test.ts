import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { parseChangelog } from '../../../domain/changelog';
import { SUPPORTED_UI_LOCALES } from '../../../infrastructure/config/i18n';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const changelogDir = path.join(repoRoot, 'application/i18n/changelog');

// Root CHANGELOG.md is the canonical zh-CN source; every other UI locale ships
// a translated copy that must mirror its structure exactly.
const canonical = parseChangelog(readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8'));

const translatedLocales = SUPPORTED_UI_LOCALES.map((l) => l.id).filter((id) => id !== 'zh-CN');

test('canonical changelog parses into entries', () => {
  assert.ok(canonical.length > 0);
});

for (const locale of translatedLocales) {
  test(`changelog ${locale} mirrors canonical structure`, () => {
    const raw = readFileSync(path.join(changelogDir, `${locale}.md`), 'utf8');
    const parsed = parseChangelog(raw);
    assert.equal(parsed.length, canonical.length, 'entry count');
    parsed.forEach((entry, i) => {
      const ref = canonical[i];
      assert.equal(entry.version, ref.version, `version at index ${i}`);
      assert.equal(entry.date, ref.date, `date for v${ref.version}`);
      assert.equal(entry.sections.length, ref.sections.length, `section count for v${ref.version}`);
      entry.sections.forEach((section, j) => {
        assert.ok(section.title.length > 0, `empty section title in v${ref.version}`);
        assert.equal(
          section.items.length,
          ref.sections[j].items.length,
          `item count for v${ref.version} section "${ref.sections[j].title}"`,
        );
      });
    });
  });
}
