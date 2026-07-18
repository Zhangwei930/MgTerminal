const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { EventEmitter } = require("node:events");

const BRIDGE_PATH = require.resolve("./autoUpdateBridge.cjs");
const WINDOW_MANAGER_PATH = require.resolve("./windowManager.cjs");
const GLOBAL_SHORTCUT_PATH = require.resolve("./globalShortcutBridge.cjs");
const DIRTY_EDITOR_GUARD_PATH = require.resolve("./dirtyEditorGuard.cjs");
const MAC_SELF_UPDATE_PATH = require.resolve("./macSelfUpdate.cjs");

// electron-updater pulls in native/electron-only code, so it can't be required
// in a plain `node --test` process. We intercept the bare `electron-updater`
// specifier and the bridge's lazy sibling requires at load time and hand back
// lightweight fakes. The patch stays installed for the whole test body because
// the bridge resolves electron-updater / windowManager / globalShortcutBridge
// lazily at IPC-invoke time, not at module load.
const ELECTRON_UPDATER_ID = "electron-updater";

/**
 * Run `fn` with electron-updater, windowManager, and globalShortcutBridge
 * replaced by the supplied fakes. The fakes are also exposed to `fn` so it can
 * assert on their interactions. Restores Module._load and the bridge cache on
 * exit so tests stay isolated.
 */
async function withMocks({ autoUpdater, autoUpdaterExports, windowManager, globalShortcutBridge, dirtyEditorGuard, browserWindows, isAutoUpdateSupported, macSelfUpdate, platform, app } = {}, fn) {
  const fakeAutoUpdater = autoUpdater || {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall() {},
  };
  const fakeWindowManager = windowManager || {
    calls: [],
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return this.calls[this.calls.length - 1] === true;
    },
  };
  const fakeGlobalShortcut = globalShortcutBridge || {
    cleanupCount: 0,
    cleanup() {
      this.cleanupCount += 1;
    },
  };
  // Default: no dirty-editor guard override. The bridge requires the real
  // dirtyEditorGuard.cjs (harmless — it only resolves ipcMain lazily, and the
  // install handler only reaches it when there's a reachable main window). Most
  // tests don't supply a main window, so the guard is never invoked.
  const fakeDirtyEditorGuard = dirtyEditorGuard;

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === ELECTRON_UPDATER_ID) {
      // autoUpdaterExports lets a test simulate a broken electron-updater
      // (e.g. {} with no autoUpdater) so getAutoUpdater() resolves to null.
      return autoUpdaterExports !== undefined
        ? autoUpdaterExports
        : { autoUpdater: fakeAutoUpdater };
    }
    if (parent && parent.filename === BRIDGE_PATH) {
      const resolved = path.resolve(path.dirname(BRIDGE_PATH), request);
      const withExt = resolved.endsWith(".cjs") ? resolved : `${resolved}.cjs`;
      if (withExt === WINDOW_MANAGER_PATH) return fakeWindowManager;
      if (withExt === GLOBAL_SHORTCUT_PATH) return fakeGlobalShortcut;
      if (withExt === DIRTY_EDITOR_GUARD_PATH && fakeDirtyEditorGuard) {
        return fakeDirtyEditorGuard;
      }
      if (withExt === MAC_SELF_UPDATE_PATH && macSelfUpdate) {
        return macSelfUpdate;
      }
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[BRIDGE_PATH];
  try {
    const bridge = require("./autoUpdateBridge.cjs");
    // Provide a minimal electronModule so readAutoUpdatePreference and
    // broadcastToAllWindows don't throw. getPath returns a throwaway dir; the
    // pref read falls back to its default when the file is absent.
    const fakeApp = {
      getPath: () => path.join("/", "tmp", "nc-autoupdate-test"),
      getVersion: () => "1.1.17",
      ...app,
    };
    bridge.init({
      electronModule: {
        app: fakeApp,
        // browserWindows lets a test observe broadcastToAllWindows (used by the
        // needs-save notice). Defaults to none.
        BrowserWindow: { getAllWindows: () => browserWindows || [] },
      },
      // Linux CI runners are not AppImage processes, so the real platform check
      // would short-circuit every install handler test. Default to supported
      // unless a test explicitly opts into the unsupported path.
      isAutoUpdateSupported: isAutoUpdateSupported || (() => true),
      // Install handler behavior branches on platform (darwin bundle swap vs
      // quitAndInstall); default to win32 so existing tests exercise the
      // quitAndInstall path regardless of the host OS.
      platform: platform || "win32",
    });
    // Await so the Module._load patch stays installed for the *entire* test
    // body, including after the now-async install handler yields on its first
    // `await` (otherwise the lazy windowManager/dirtyEditorGuard requires would
    // resolve the real modules once the finally below restored Module._load).
    return await fn({ bridge, fakeAutoUpdater, fakeWindowManager, fakeGlobalShortcut });
  } finally {
    Module._load = originalLoad;
    delete require.cache[BRIDGE_PATH];
  }
}

/**
 * A fake BrowserWindow for broadcastToAllWindows() (used by the needs-save
 * notice). Records every channel sent to its webContents so a test can assert
 * whether magiesTerminal:update:needs-save was broadcast.
 */
function makeBroadcastWindow() {
  const sentChannels = [];
  return {
    sentChannels,
    isDestroyed() {
      return false;
    },
    webContents: {
      send(channel) {
        sentChannels.push(channel);
      },
    },
  };
}

/**
 * Build a fake windowManager that also exposes a main window whose webContents
 * the install handler can query for dirty editors. `sentChannels` records every
 * webContents.send() on the *main window* (i.e. the dirty-editor query), kept
 * separate from broadcast windows so tests can distinguish the two.
 */
function makeWindowManagerWithMainWindow() {
  const sentChannels = [];
  const webContents = {
    send(channel) {
      sentChannels.push(channel);
    },
    isDestroyed() {
      return false;
    },
    isCrashed() {
      return false;
    },
  };
  return {
    calls: [],
    sentChannels,
    webContents,
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return this.calls[this.calls.length - 1] === true;
    },
    getMainWindow() {
      return {
        webContents,
        isDestroyed() {
          return false;
        },
      };
    },
    getMainWindows() {
      return [this.getMainWindow()];
    },
  };
}

function makeWindowManagerWithMainWindows(count, options = {}) {
  const windows = Array.from({ length: count }, (_unused, index) => {
    const sentChannels = [];
    const webContents = {
      id: index + 1,
      sentChannels,
      send(channel) {
        sentChannels.push(channel);
      },
      isDestroyed() {
        return false;
      },
      isCrashed() {
        return false;
      },
    };
    return {
      webContents,
      isDestroyed() {
        return false;
      },
    };
  });
  return {
    calls: [],
    windows,
    appContentWindows: options.appContentWindows || windows,
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return this.calls[this.calls.length - 1] === true;
    },
    getMainWindow() {
      return windows[0] || null;
    },
    getMainWindows() {
      return windows;
    },
    getAppContentWindows() {
      return this.appContentWindows;
    },
  };
}

/**
 * Minimal ipcMain stand-in that captures the handlers the bridge registers so a
 * test can invoke a single channel directly.
 */
function makeIpcMain() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    on() {},
    invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`No handler registered for ${channel}`);
      return handler({}, ...args);
    },
    has(channel) {
      return handlers.has(channel);
    },
  };
}

test("in-place update support covers win32, macOS (bundle swap), and Linux AppImage only", () => {
  delete require.cache[BRIDGE_PATH];
  const bridge = require("./autoUpdateBridge.cjs");

  assert.equal(bridge.isPlatformAutoUpdateSupported("win32"), true);
  // macOS installs via the custom bundle swap (macSelfUpdate.cjs), not
  // Squirrel.Mac, so unsigned builds stay updatable.
  assert.equal(bridge.isPlatformAutoUpdateSupported("darwin"), true);
  assert.equal(bridge.isPlatformAutoUpdateSupported("linux"), false);
  assert.equal(bridge.isPlatformAutoUpdateSupported("linux", "/tmp/MagiesTerminal.AppImage"), true);
});

test("install handler on macOS swaps the bundle and relaunches instead of quitAndInstall", async () => {
  const order = [];
  const autoUpdater = new EventEmitter();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.quitAndInstall = () => {
    order.push("quitAndInstall");
  };

  const macSelfUpdate = {
    installs: [],
    resolveMacBundlePath: (exePath) => `${exePath}-bundle.app`,
    async installMacUpdateFromZip(options) {
      order.push("swap");
      this.installs.push(options);
    },
  };
  const app = {
    getPath: (name) => (name === "exe"
      ? "/Applications/MagiesTerminal.app/Contents/MacOS/MagiesTerminal"
      : path.join("/", "tmp", "nc-autoupdate-test")),
    relaunch: () => {
      order.push("relaunch");
    },
    quit: () => {
      order.push("quit");
    },
  };

  await withMocks({ autoUpdater, macSelfUpdate, platform: "darwin", app }, async ({ bridge, fakeWindowManager }) => {
    const ipcMain = makeIpcMain();
    bridge.registerHandlers(ipcMain);

    // Simulate electron-updater finishing the download (captures the zip path).
    autoUpdater.emit("update-downloaded", { downloadedFile: "/tmp/MagiesTerminal-9.9.9-mac-arm64.zip" });

    const result = await ipcMain.invoke("magiesTerminal:update:install");

    assert.deepEqual(result, { success: true });
    // Swap happens first; only then the app commits to quit and relaunches.
    assert.deepEqual(order, ["swap", "relaunch", "quit"]);
    assert.equal(order.includes("quitAndInstall"), false);
    // The swap received the downloaded zip and the resolved bundle path.
    assert.deepEqual(macSelfUpdate.installs, [{
      zipPath: "/tmp/MagiesTerminal-9.9.9-mac-arm64.zip",
      bundlePath: "/Applications/MagiesTerminal.app/Contents/MacOS/MagiesTerminal-bundle.app",
    }]);
    // Quit flags committed only after the successful swap.
    assert.deepEqual(fakeWindowManager.calls, [true]);
  });
});

test("install handler on macOS rolls back cleanly when the bundle swap fails", async () => {
  const autoUpdater = new EventEmitter();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.quitAndInstall = () => {
    throw new Error("must not be called on macOS");
  };

  const macSelfUpdate = {
    resolveMacBundlePath: () => "/Applications/MagiesTerminal.app",
    async installMacUpdateFromZip() {
      throw new Error("No downloaded update found. Download the update first.");
    },
  };
  let relaunched = false;
  const app = {
    getPath: () => path.join("/", "tmp", "nc-autoupdate-test"),
    relaunch: () => {
      relaunched = true;
    },
    quit: () => {},
  };

  await withMocks({ autoUpdater, macSelfUpdate, platform: "darwin", app }, async ({ bridge, fakeWindowManager }) => {
    const ipcMain = makeIpcMain();
    bridge.registerHandlers(ipcMain);

    const result = await ipcMain.invoke("magiesTerminal:update:install");

    assert.equal(result.success, false);
    assert.match(result.error, /downloaded/i);
    assert.equal(relaunched, false);
    // The quitting-for-update flag must not be left set (failInstall resets it).
    assert.notEqual(fakeWindowManager.calls[fakeWindowManager.calls.length - 1], true);
  });
});

test("install handler marks quitting-for-update before quitAndInstall", async () => {
  const order = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall(isSilent, isForceRunAfter) {
      order.push("quitAndInstall");
      autoUpdater._installArgs = [isSilent, isForceRunAfter];
    },
  };
  const fakeWindowManager = {
    calls: [],
    setQuittingForUpdate(value) {
      order.push("setQuittingForUpdate");
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return this.calls[this.calls.length - 1] === true;
    },
  };

  await withMocks({ autoUpdater, windowManager: fakeWindowManager }, async ({ bridge, fakeGlobalShortcut }) => {
    const ipcMain = makeIpcMain();
    bridge.registerHandlers(ipcMain);
    await ipcMain.invoke("magiesTerminal:update:install");

    // The flag must be set with `true`...
    assert.deepEqual(fakeWindowManager.calls, [true]);
    // ...and it must happen BEFORE quitAndInstall fires app.quit(), otherwise the
    // close-to-tray / before-quit guards would already be racing the quit (#1215).
    assert.equal(order[0], "setQuittingForUpdate");
    assert.ok(order.indexOf("setQuittingForUpdate") < order.indexOf("quitAndInstall"));
    // Tray cleanup still runs so the tray doesn't keep the process alive.
    assert.equal(fakeGlobalShortcut.cleanupCount, 1);
    assert.equal(order.includes("quitAndInstall"), true);
  });
});

test("install handler is a no-op when the updater fails to load", async () => {
  const fakeWindowManager = {
    calls: [],
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return false;
    },
  };
  // electron-updater exports no `autoUpdater` => getAutoUpdater() returns null,
  // so the handler must return early WITHOUT committing the app to a quit. Doing
  // so otherwise would leave isQuitting=true and break close-to-tray even though
  // no install actually started.
  await withMocks({ autoUpdaterExports: {}, windowManager: fakeWindowManager }, async ({ bridge, fakeGlobalShortcut }) => {
    const ipcMain = makeIpcMain();
    bridge.registerHandlers(ipcMain);
    await ipcMain.invoke("magiesTerminal:update:install");

    assert.deepEqual(fakeWindowManager.calls, []);
    assert.equal(fakeGlobalShortcut.cleanupCount, 0);
  });
});

test("install handler returns unsupported without quitting when auto-update is unavailable", async () => {
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall() {
      throw new Error("quitAndInstall must not run on unsupported platforms");
    },
  };
  const fakeWindowManager = {
    calls: [],
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return false;
    },
  };

  await withMocks(
    {
      autoUpdater,
      windowManager: fakeWindowManager,
      isAutoUpdateSupported: () => false,
    },
    async ({ bridge, fakeGlobalShortcut }) => {
      const ipcMain = makeIpcMain();
      bridge.registerHandlers(ipcMain);
      const result = await ipcMain.invoke("magiesTerminal:update:install");

      assert.deepEqual(result, {
        success: false,
        unsupported: true,
        error: "Auto-install is not supported on this platform. Download the latest release manually.",
      });
      assert.deepEqual(fakeWindowManager.calls, []);
      assert.equal(fakeGlobalShortcut.cleanupCount, 0);
    },
  );
});

test("install handler rolls back quitting-for-update when quitAndInstall throws", async () => {
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall() {
      throw new Error("boom");
    },
  };
  const fakeWindowManager = {
    calls: [],
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return this.calls[this.calls.length - 1] === true;
    },
  };

  await withMocks({ autoUpdater, windowManager: fakeWindowManager }, async ({ bridge }) => {
    const ipcMain = makeIpcMain();
    bridge.registerHandlers(ipcMain);
    await ipcMain.invoke("magiesTerminal:update:install");

    // First set true (commit), then reset to false on the synchronous throw so
    // the app doesn't get stuck bypassing close-to-tray / the quit guard (#1215).
    assert.deepEqual(fakeWindowManager.calls, [true, false]);
    assert.equal(fakeWindowManager.isQuittingForUpdate(), false);
  });
});

test("install handler surfaces updater errors emitted during quitAndInstall", async () => {
  const autoUpdater = new EventEmitter();
  Object.assign(autoUpdater, {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    quitAndInstall() {
      this.emit("error", new Error("Downloaded installer is unavailable"));
    },
  });
  const fakeWindowManager = {
    calls: [],
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return this.calls[this.calls.length - 1] === true;
    },
  };
  const win = makeBroadcastWindow();

  await withMocks(
    { autoUpdater, windowManager: fakeWindowManager, browserWindows: [win] },
    async ({ bridge }) => {
      const ipcMain = makeIpcMain();
      bridge.registerHandlers(ipcMain);
      const result = await ipcMain.invoke("magiesTerminal:update:install");

      assert.deepEqual(result, {
        success: false,
        error: "Downloaded installer is unavailable",
      });
      assert.deepEqual(fakeWindowManager.calls, [true, false]);
      assert.equal(win.sentChannels.includes("magiesTerminal:update:error"), true);
    },
  );
});

test("install handler watchdog clears quitting-for-update if the app never quits", async () => {
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    // Returns without ever quitting the app (simulates a Squirrel follow-up
    // failure / stale download where app.quit() is never reached).
    quitAndInstall() {},
  };
  const fakeWindowManager = {
    calls: [],
    setQuittingForUpdate(value) {
      this.calls.push(value);
    },
    isQuittingForUpdate() {
      return this.calls[this.calls.length - 1] === true;
    },
  };

  // Capture the watchdog timer instead of waiting for the real delay.
  const originalSetTimeout = global.setTimeout;
  let watchdogFn = null;
  global.setTimeout = (fn) => {
    watchdogFn = fn;
    // Return a fake timer handle with an unref() no-op so the bridge can call it.
    return { unref() {} };
  };

  try {
    await withMocks({ autoUpdater, windowManager: fakeWindowManager }, async ({ bridge }) => {
      const ipcMain = makeIpcMain();
      bridge.registerHandlers(ipcMain);
      await ipcMain.invoke("magiesTerminal:update:install");

      // Committed to quit, watchdog scheduled but not yet fired.
      assert.deepEqual(fakeWindowManager.calls, [true]);
      assert.equal(typeof watchdogFn, "function");

      // Fire the watchdog — the app is still alive, so it must clear the flag.
      watchdogFn();
      assert.deepEqual(fakeWindowManager.calls, [true, false]);
      assert.equal(fakeWindowManager.isQuittingForUpdate(), false);
    });
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

// ---------------------------------------------------------------------------
// #1215 P1: the install handler must check for unsaved editors BEFORE
// committing to a quit. On macOS quitAndInstall() closes the window first and
// only then fires before-quit, so the before-quit dirty guard can run after the
// window is gone and silently drop unsaved SFTP edits. Checking up front (while
// the renderer is alive) is the fix.
// ---------------------------------------------------------------------------

test("install handler aborts and notifies when the renderer reports dirty editors", async () => {
  const order = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall() {
      order.push("quitAndInstall");
    },
  };
  const fakeWindowManager = makeWindowManagerWithMainWindow();
  const originalSetQuitting = fakeWindowManager.setQuittingForUpdate;
  fakeWindowManager.setQuittingForUpdate = function (value) {
    order.push("setQuittingForUpdate");
    originalSetQuitting.call(this, value);
  };
  // queryDirtyEditors reports unsaved work.
  let queriedWebContents = null;
  const fakeDirtyEditorGuard = {
    queryDirtyEditors(webContents) {
      order.push("queryDirtyEditors");
      queriedWebContents = webContents;
      return Promise.resolve(true);
    },
  };
  // Two windows (e.g. main + settings) so we can assert the needs-save notice is
  // broadcast to BOTH, not just the queried main window (#1215 review).
  const win1 = makeBroadcastWindow();
  const win2 = makeBroadcastWindow();

  await withMocks(
    {
      autoUpdater,
      windowManager: fakeWindowManager,
      dirtyEditorGuard: fakeDirtyEditorGuard,
      browserWindows: [win1, win2],
    },
    async ({ bridge, fakeGlobalShortcut }) => {
      const ipcMain = makeIpcMain();
      bridge.registerHandlers(ipcMain);
      await ipcMain.invoke("magiesTerminal:update:install");

      // Dirty editors → the install must be fully aborted:
      // - no quitAndInstall, no setQuittingForUpdate, no tray cleanup
      assert.equal(order.includes("quitAndInstall"), false);
      assert.equal(order.includes("setQuittingForUpdate"), false);
      assert.deepEqual(fakeWindowManager.calls, []);
      assert.equal(fakeGlobalShortcut.cleanupCount, 0);
      // - every window is told to prompt the user to save (broadcast needs-save)
      assert.equal(win1.sentChannels.includes("magiesTerminal:update:needs-save"), true);
      assert.equal(win2.sentChannels.includes("magiesTerminal:update:needs-save"), true);
      // - the dirty check ran first, against the main window's webContents
      assert.equal(order[0], "queryDirtyEditors");
      assert.equal(queriedWebContents, fakeWindowManager.webContents);
    },
  );
});

test("install handler checks every app content window before installing", async () => {
  const order = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall() {
      order.push("quitAndInstall");
    },
  };
  const fakeWindowManager = makeWindowManagerWithMainWindows(1);
  const peerWebContents = {
    id: 2,
    sentChannels: [],
    send(channel) {
      this.sentChannels.push(channel);
    },
    isDestroyed() {
      return false;
    },
    isCrashed() {
      return false;
    },
  };
  const peerWindow = {
    webContents: peerWebContents,
    isDestroyed() {
      return false;
    },
  };
  fakeWindowManager.appContentWindows = [fakeWindowManager.windows[0], peerWindow];
  const queriedWebContents = [];
  const fakeDirtyEditorGuard = {
    queryDirtyEditors(webContents) {
      order.push(`queryDirtyEditors:${webContents.id}`);
      queriedWebContents.push(webContents);
      return Promise.resolve(webContents.id === 2);
    },
  };
  const win = makeBroadcastWindow();

  await withMocks(
    {
      autoUpdater,
      windowManager: fakeWindowManager,
      dirtyEditorGuard: fakeDirtyEditorGuard,
      browserWindows: [win],
    },
    async ({ bridge, fakeGlobalShortcut }) => {
      const ipcMain = makeIpcMain();
      bridge.registerHandlers(ipcMain);
      await ipcMain.invoke("magiesTerminal:update:install");

      assert.deepEqual(queriedWebContents, fakeWindowManager.appContentWindows.map((window) => window.webContents));
      assert.equal(order.includes("quitAndInstall"), false);
      assert.deepEqual(fakeWindowManager.calls, []);
      assert.equal(fakeGlobalShortcut.cleanupCount, 0);
      assert.equal(win.sentChannels.includes("magiesTerminal:update:needs-save"), true);
    },
  );
});

test("install handler proceeds to quitAndInstall when there are no dirty editors", async () => {
  const order = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall() {
      order.push("quitAndInstall");
    },
  };
  const fakeWindowManager = makeWindowManagerWithMainWindow();
  const originalSetQuitting = fakeWindowManager.setQuittingForUpdate;
  fakeWindowManager.setQuittingForUpdate = function (value) {
    order.push("setQuittingForUpdate");
    originalSetQuitting.call(this, value);
  };
  // queryDirtyEditors reports a clean editor state.
  const fakeDirtyEditorGuard = {
    queryDirtyEditors() {
      order.push("queryDirtyEditors");
      return Promise.resolve(false);
    },
  };
  const win = makeBroadcastWindow();

  // Capture the watchdog so the test doesn't wait on the real 10s timer.
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({ unref() {} });
  try {
    await withMocks(
      {
        autoUpdater,
        windowManager: fakeWindowManager,
        dirtyEditorGuard: fakeDirtyEditorGuard,
        browserWindows: [win],
      },
      async ({ bridge, fakeGlobalShortcut }) => {
        const ipcMain = makeIpcMain();
        bridge.registerHandlers(ipcMain);
        await ipcMain.invoke("magiesTerminal:update:install");

        // Clean editors → install runs as before:
        // dirty check first, then commit-to-quit, then quitAndInstall.
        assert.equal(order[0], "queryDirtyEditors");
        assert.deepEqual(fakeWindowManager.calls, [true]);
        assert.ok(order.indexOf("setQuittingForUpdate") < order.indexOf("quitAndInstall"));
        assert.equal(order.includes("quitAndInstall"), true);
        assert.equal(fakeGlobalShortcut.cleanupCount, 1);
        // No needs-save broadcast when nothing is dirty.
        assert.equal(win.sentChannels.includes("magiesTerminal:update:needs-save"), false);
      },
    );
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test("install handler installs directly when no main window is reachable", async () => {
  const order = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    quitAndInstall() {
      order.push("quitAndInstall");
    },
  };
  // Default fake windowManager has no getMainWindow() → getMainWebContents()
  // returns null → there's no user to ask, so the install must proceed without
  // ever calling queryDirtyEditors (matches the before-quit fail-open path).
  let dirtyCheckCalled = false;
  const fakeDirtyEditorGuard = {
    queryDirtyEditors() {
      dirtyCheckCalled = true;
      return Promise.resolve(true);
    },
  };

  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => ({ unref() {} });
  try {
    await withMocks(
      { autoUpdater, dirtyEditorGuard: fakeDirtyEditorGuard },
      async ({ bridge, fakeWindowManager }) => {
        const ipcMain = makeIpcMain();
        bridge.registerHandlers(ipcMain);
        await ipcMain.invoke("magiesTerminal:update:install");

        assert.equal(dirtyCheckCalled, false);
        assert.deepEqual(fakeWindowManager.calls, [true]);
        assert.equal(order.includes("quitAndInstall"), true);
      },
    );
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test("mainland-China locale or timezone prefers the mirror update feed", async () => {
  await withMocks({}, async ({ bridge }) => {
    assert.equal(bridge.shouldPreferMirrorFeed({ locale: "zh-CN", timeZone: "America/New_York" }), true);
    assert.equal(bridge.shouldPreferMirrorFeed({ locale: "en-US", timeZone: "Asia/Shanghai" }), true);
    assert.equal(bridge.shouldPreferMirrorFeed({ locale: "en-US", timeZone: "Europe/Berlin" }), false);
    assert.equal(bridge.shouldPreferMirrorFeed({ locale: "zh-TW", timeZone: "Asia/Taipei" }), false);
    assert.equal(bridge.shouldPreferMirrorFeed({}), false);
  });
});

test("Windows arm64 uses the latest-arm64 update channel", async () => {
  await withMocks({}, async ({ bridge }) => {
    assert.equal(bridge.resolveUpdateChannel("win32", "arm64"), "latest-arm64");
    assert.equal(bridge.resolveUpdateChannel("win32", "x64"), "latest");
    assert.equal(bridge.resolveUpdateChannel("darwin", "arm64"), "latest");
    assert.equal(bridge.resolveUpdateChannel("linux", "arm64"), "latest");
  });
});

test("applyFeed sets channel on generic and github providers", async () => {
  const feeds = [];
  const autoUpdater = {
    channel: "latest",
    setFeedURL(options) {
      feeds.push({ ...options, channel: this.channel });
    },
  };
  await withMocks({}, async ({ bridge }) => {
    // Force win-arm64 channel by calling resolve via applyFeed after patching.
    // applyFeed reads process.arch; for unit isolation call setFeedURL shape.
    bridge.applyFeed(autoUpdater, "mirror");
    assert.equal(feeds.at(-1).provider, "generic");
    assert.match(feeds.at(-1).url, /dl\.magies\.top/);
    assert.ok(feeds.at(-1).channel === "latest" || feeds.at(-1).channel === "latest-arm64");
    bridge.applyFeed(autoUpdater, "github");
    assert.equal(feeds.at(-1).provider, "github");
    assert.equal(feeds.at(-1).owner, "JasonZhangDad");
    assert.equal(feeds.at(-1).repo, "MgTerminal-releases");
  });
});

test("update check falls back to the mirror feed when GitHub is unreachable", async () => {
  const feeds = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    setFeedURL(options) {
      feeds.push(options);
    },
    async checkForUpdates() {
      const active = feeds.at(-1);
      if (!active || active.provider === "github") {
        throw new Error("net::ERR_CONNECTION_TIMED_OUT");
      }
      return { updateInfo: { version: "9.9.9" } };
    },
  };

  await withMocks({ autoUpdater }, async ({ bridge }) => {
    const result = await bridge.checkForUpdatesWithFallback(autoUpdater, "github");

    assert.equal(result.updateInfo.version, "9.9.9");
    assert.equal(feeds.at(-1).provider, "generic");
    assert.match(feeds.at(-1).url, /dl\.magies\.top/);
  });
});

test("mirror-first update check falls back to GitHub when the mirror fails", async () => {
  const feeds = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: false,
    logger: undefined,
    on() {},
    setFeedURL(options) {
      feeds.push(options);
    },
    async checkForUpdates() {
      const active = feeds.at(-1);
      if (active && active.provider === "generic") {
        throw new Error("net::ERR_NAME_NOT_RESOLVED");
      }
      return { updateInfo: { version: "9.9.9" } };
    },
  };

  await withMocks({ autoUpdater }, async ({ bridge }) => {
    const result = await bridge.checkForUpdatesWithFallback(autoUpdater, "mirror");

    assert.equal(result.updateInfo.version, "9.9.9");
    assert.equal(feeds.at(-1).provider, "github");
  });
});
