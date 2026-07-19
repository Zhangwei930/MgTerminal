import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./dialog.tsx', import.meta.url), 'utf8');

test('dialog overlay and content opt out of the Electron drag region', () => {
  // Regression: without app-no-drag, a Dialog portaled over a window whose
  // header is `-webkit-app-region: drag` (e.g. the Settings window) has its
  // content — including the top-right X close button — sit inside the OS drag
  // region, so clicks are consumed as window drags and the dialog cannot be
  // closed. Every other overlay (aside-panel, combobox, context-menu) already
  // sets app-no-drag; the Dialog must too. (.app-no-drag cascades to children,
  // so the close button becomes clickable.)
  const overlayBlock = source.slice(
    source.indexOf('const DialogOverlay'),
    source.indexOf('DialogOverlay.displayName'),
  );
  assert.match(overlayBlock, /app-no-drag/, 'DialogOverlay must be app-no-drag');

  const contentBlock = source.slice(
    source.indexOf('const DialogContent'),
    source.indexOf('DialogContent.displayName'),
  );
  assert.match(contentBlock, /app-no-drag/, 'DialogContent must be app-no-drag');
});
