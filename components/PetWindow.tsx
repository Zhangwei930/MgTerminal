import React, { useEffect } from 'react';
import { I18nProvider } from '../application/i18n/I18nProvider';
import { usePetLocale } from '../application/state/usePetLocale';
import { usePetWindowSettingsSync } from '../application/state/usePetWindowSettingsSync';
import { PetWidget } from './pet/PetWidget';

/**
 * Root component for the `#/pet` overlay window (see electron/bridges/windowManager/petWindow.cjs).
 * index.css sets an opaque `body { background-color: hsl(var(--background)) }` for every route,
 * which paints over the BrowserWindow's `transparent: true` unless overridden here — otherwise the
 * pet renders inside a solid card instead of floating directly on the desktop.
 */
export default function PetWindow(): React.ReactElement {
  const locale = usePetLocale();
  usePetWindowSettingsSync();

  useEffect(() => {
    const { documentElement } = document;
    documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  return (
    <I18nProvider locale={locale}>
      <div className="h-screen w-screen overflow-hidden bg-transparent">
        <PetWidget />
      </div>
    </I18nProvider>
  );
}
