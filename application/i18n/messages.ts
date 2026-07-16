import en, { type Messages } from './locales/en';
import zhCN from './locales/zh-CN';
import zhTW from './locales/zh-TW';
import ru from './locales/ru';
import ja from './locales/ja';
import ko from './locales/ko';
import de from './locales/de';
import fr from './locales/fr';
import es from './locales/es';
import pt from './locales/pt';

// Keep keys stable; add new locales by adding another import and map entry.
export { type Messages };

export const MESSAGES_BY_LOCALE: Record<string, Messages> = {
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

