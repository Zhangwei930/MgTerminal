const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('renderer CSP blocks inline scripts and framing', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || '';
  const scriptSource = csp.match(/script-src ([^;]+)/)?.[1] || '';

  assert.doesNotMatch(scriptSource, /'unsafe-inline'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
});

test('packaged Electron disables unsafe runtime switches and validates app.asar', () => {
  const config = require(path.join(root, 'electron-builder.config.cjs'));

  assert.deepEqual(config.electronFuses, {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
  });
});

test('macOS hardened runtime does not disable library validation', () => {
  const entitlements = fs.readFileSync(path.join(root, 'electron/entitlements.mac.plist'), 'utf8');

  assert.doesNotMatch(entitlements, /com\.apple\.security\.cs\.disable-library-validation/);
});

test('incoming SSH links require explicit user confirmation before connecting', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const handler = appSource.slice(
    appSource.indexOf('const _handleSshDeepLink'),
    appSource.indexOf('const _handleTelnetDeepLink'),
  );

  assert.match(handler, /globalThis\.confirm/);
  assert.match(handler, /deepLink\.ssh\.confirm/);
});
