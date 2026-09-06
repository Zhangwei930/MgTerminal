const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('renderer CSP blocks inline scripts', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || '';
  const scriptSource = csp.match(/script-src ([^;]+)/)?.[1] || '';

  assert.doesNotMatch(scriptSource, /'unsafe-inline'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
});

test('index.html ships no inline script for that CSP to block', () => {
  // script-src has no 'unsafe-inline', so an inline <script> is not merely
  // discouraged — the browser refuses to run it. The pre-paint theme script
  // was silently dead this way.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .filter(([, body]) => body.trim().length > 0);

  assert.deepEqual(inline.map(([, body]) => body.trim().slice(0, 60)), []);
});

test('frame-ancestors is delivered as a header, where it actually applies', () => {
  // A <meta> CSP silently ignores frame-ancestors — the browser logs a warning
  // and the directive does nothing. It has to come from a response header.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const metaCsp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || '';
  assert.doesNotMatch(metaCsp, /frame-ancestors/, 'meta must not pretend to set it');

  const main = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
  assert.match(main, /"Content-Security-Policy":\s*"frame-ancestors 'none'"/);

  const viteConfig = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /'Content-Security-Policy': "frame-ancestors 'none'"/);
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

/** True when `version` is at or above `floor`, comparing numerically. */
function atLeast(version, floor) {
  const parts = (v) => String(v).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [a, b] = [parts(version), parts(floor)];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return true;
}

test('dependency overrides hold the floor for reachable advisories', () => {
  // Floors, not exact versions. Pinning the exact string made this test fail
  // on the next security bump — the opposite of what it is for. Each floor is
  // the first release carrying the fix; raise one only when a new advisory
  // moves it.
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const floors = {
    // DOMPurify: detached subtree stays executable after IN_PLACE hook removal
    dompurify: '3.4.13',
    // undici: response desync, CRLF injection, cookie attribute injection
    undici: '6.28.0',
    // hono: CORS ReDoS, memo() cross-request disclosure, proxy header leak
    hono: '4.12.34',
    // js-yaml: quadratic CPU via merge keys and !!omap
    'js-yaml': '4.3.1',
  };
  for (const [name, floor] of Object.entries(floors)) {
    const pinned = pkg.overrides[name];
    assert.ok(pinned, `no override pinned for ${name}`);
    assert.ok(
      atLeast(pinned, floor),
      `${name} is pinned at ${pinned}, below the ${floor} that carries the fix`,
    );
  }
});

test('afterPack repairs ASAR integrity before macOS signing', () => {
  const source = fs.readFileSync(path.join(root, 'scripts/afterPackMacUuid.cjs'), 'utf8');
  assert.match(source, /repairAsarFileIntegrity/);
  assert.match(source, /updateMacAsarIntegrityPlist/);
  assert.match(source, /ElectronAsarIntegrity/);
});
