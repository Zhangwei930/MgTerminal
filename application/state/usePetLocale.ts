import { useEffect, useState } from 'react';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import { STORAGE_KEY_UI_LANGUAGE } from '../../infrastructure/config/storageKeys';
import { DEFAULT_UI_LOCALE } from '../../infrastructure/config/i18n';

function readLocale(): string {
  return localStorageAdapter.readString(STORAGE_KEY_UI_LANGUAGE) ?? DEFAULT_UI_LOCALE;
}

/**
 * Reactive read of the user's UI language for windows that only need the
 * locale (e.g. the pet overlay), instead of pulling in the full useSettingsState
 * hook. I18nProvider sanitizes whatever locale it's given via resolveSupportedLocale.
 */
export function usePetLocale(): string {
  const [locale, setLocale] = useState(() => readLocale());

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY_UI_LANGUAGE) return;
      setLocale(readLocale());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return locale;
}
