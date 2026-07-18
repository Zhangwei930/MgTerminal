/**
 * Per-locale changelog sources. Root CHANGELOG.md is the canonical zh-CN
 * version; every other UI locale ships a translated copy whose structure is
 * enforced by application/i18n/locales/changelogLocales.test.ts.
 */

import zhCN from '../../../CHANGELOG.md?raw';
import de from './de.md?raw';
import en from './en.md?raw';
import es from './es.md?raw';
import fr from './fr.md?raw';
import ja from './ja.md?raw';
import ko from './ko.md?raw';
import pt from './pt.md?raw';
import ru from './ru.md?raw';
import zhTW from './zh-TW.md?raw';

import { DEFAULT_UI_LOCALE } from '../../../infrastructure/config/i18n';

const CHANGELOG_BY_LOCALE: Record<string, string> = {
  en,
  ru,
  ja,
  ko,
  de,
  fr,
  es,
  pt,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
};

export const getChangelogRaw = (resolvedLocale: string): string =>
  CHANGELOG_BY_LOCALE[resolvedLocale] ?? CHANGELOG_BY_LOCALE[DEFAULT_UI_LOCALE];
