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

test('deb verify loads native modules with build Electron after runAsNode fuse is disabled', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/verify-linux-deb-artifact.sh'), 'utf8');

  assert.match(source, /node_modules\/\.bin\/electron/);
  assert.match(source, /loading native module with build Electron runtime/);
  assert.match(source, /electron_bin="\$\(build_electron_bin\)"/);
  assert.doesNotMatch(source, /opt\/MagiesTerminal\/magiesTerminal[\s\S]*ELECTRON_RUN_AS_NODE/);
});

test('macOS hardened runtime does not disable library validation', () => {
  const entitlements = fs.readFileSync(path.join(root, 'electron/entitlements.mac.plist'), 'utf8');

  assert.doesNotMatch(entitlements, /com\.apple\.security\.cs\.disable-library-validation/);
});

test('incoming SSH links require explicit user confirmation before connecting', () => {
  const hookSource = fs.readFileSync(
    path.join(root, 'application/state/useDeepLinkHandlers.ts'),
    'utf8',
  );
  const handler = hookSource.slice(
    hookSource.indexOf('const _handleSshDeepLink'),
    hookSource.indexOf('const _handleTelnetDeepLink'),
  );

  assert.match(handler, /globalThis\.confirm/);
  assert.match(handler, /deepLink\.ssh\.confirm/);
});

test('packaged tray panel and preload ignore VITE_DEV_SERVER_URL', () => {
  const trayBridge = fs.readFileSync(
    path.join(root, 'electron/bridges/globalShortcutBridge.cjs'),
    'utf8',
  );
  const preload = fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8');

  assert.match(trayBridge, /getTrayPanelDevServerUrl/);
  assert.match(trayBridge, /app\?\.isPackaged === true/);
  assert.match(trayBridge, /will-navigate/);
  assert.match(trayBridge, /will-redirect/);
  assert.match(trayBridge, /setWindowOpenHandler/);
  assert.match(preload, /isPackagedPreloadHost/);
  assert.match(preload, /app\.asar/);
});

test('dependency overrides pin reachable XSS and undici DoS fixes', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.overrides.dompurify, '3.4.12');
  assert.equal(pkg.overrides.undici, '6.27.0');
});

test('afterPack repairs ASAR integrity before macOS signing', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/afterPackMacUuid.cjs'), 'utf8');
  assert.match(source, /repairAsarFileIntegrity/);
  assert.match(source, /updateMacAsarIntegrityPlist/);
  assert.match(source, /ElectronAsarIntegrity/);
});
