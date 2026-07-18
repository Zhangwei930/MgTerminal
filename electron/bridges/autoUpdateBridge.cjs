/**
 * Auto-Update Bridge
 *
 * Wraps electron-updater to provide IPC-driven update checks, downloads, and
 * install-on-quit. Designed around a "prompt" model: the renderer asks to
 * check, then explicitly triggers download and install.
 *
 * Platforms where auto-update is NOT supported (Linux deb/rpm/snap) get a
 * graceful { available: false, error } response so the renderer can fall back
 * to a manual "open GitHub releases" link.
 */

let _deps = null;

/**
 * Read the persisted auto-update preference from a JSON file in userData.
 * Returns true (default) if the file doesn't exist or is unreadable.
 */
function readAutoUpdatePreference() {
  try {
    const { app } = _deps?.electronModule || {};
    if (!app) return true;
    const path = require('path');
    const fs = require('fs');
    const prefPath = path.join(app.getPath('userData'), 'auto-update-pref.json');
    const data = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
    return data.enabled !== false;
  } catch {
    return true; // default to enabled
  }
}

/**
 * Persist the auto-update preference to a JSON file in userData.
 */
function writeAutoUpdatePreference(enabled) {
  try {
    const { app } = _deps?.electronModule || {};
    if (!app) return;
    const path = require('path');
    const fs = require('fs');
    const prefPath = path.join(app.getPath('userData'), 'auto-update-pref.json');
    fs.writeFileSync(prefPath, JSON.stringify({ enabled }), 'utf8');
  } catch (err) {
    console.warn('[AutoUpdate] Failed to write preference:', err?.message || err);
  }
}

/**
 * Returns true when the current packaging format supports electron-updater
 * (macOS zip/dmg, Windows NSIS, Linux AppImage).
 *
 * Overridable via init({ isAutoUpdateSupported }) so unit tests on Linux CI
 * (no APPIMAGE env) can exercise the install path without pretending to be
 * an AppImage process.
 */
function isPlatformAutoUpdateSupported(platform, appImagePath) {
  if (platform === "win32") return true;
  // macOS: Squirrel.Mac requires a code-signed app and current releases are
  // unsigned, so the install step is a custom bundle swap (macSelfUpdate.cjs).
  // Check + download still go through electron-updater, which never hands the
  // file to Squirrel while autoInstallOnAppQuit is false.
  if (platform === "darwin") return true;
  // Linux: only AppImage supports in-place update.
  // The APPIMAGE env variable is set by the AppImage runtime.
  return platform === "linux" && Boolean(appImagePath);
}

function defaultIsAutoUpdateSupported() {
  return isPlatformAutoUpdateSupported(process.platform, process.env.APPIMAGE);
}

let _isAutoUpdateSupported = defaultIsAutoUpdateSupported;

function isAutoUpdateSupported() {
  return _isAutoUpdateSupported();
}

/** Lazily resolved autoUpdater — avoids importing electron-updater in
 *  contexts where native modules might not be available. */
let _autoUpdater = null;

/** Guard against duplicate listener registration */
let _listenersRegistered = false;

/** Track whether a download is in progress to distinguish download errors from check errors */
let _isDownloading = false;

/** Track the explicit install phase so updater errors are never mistaken for
 *  harmless check-phase errors. */
let _isInstalling = false;
let _lastInstallError = null;

/** Platform override for tests; defaults to process.platform (set in init). */
let _platform = process.platform;

/** Absolute path of the update file electron-updater downloaded (macOS zip).
 *  Captured from the update-downloaded event; consumed by the macOS
 *  self-update install path. */
let _downloadedFile = null;

/** Track whether a checkForUpdates call is in flight (set before call, cleared on result event) */
let _isChecking = false;

/**
 * Snapshot of the last known update status so newly opened windows can hydrate
 * without waiting for the next IPC event.
 * @type {{ status: 'idle' | 'available' | 'downloading' | 'ready' | 'installing' | 'error', percent: number, error: string | null, version: string | null, isChecking: boolean }}
 */
let _lastStatus = { status: 'idle', percent: 0, error: null, version: null, isChecking: false };
/**
 * R2 download mirror feed (dl.magies.top) for mainland-China users, who cannot
 * reach github.com. CI mirrors every release there (build.yml "Sync release
 * to R2"), including the latest*.yml metadata electron-updater needs, so the
 * generic provider works as a drop-in feed.
 */
const MIRROR_FEED_URL = "https://dl.magies.top/stable";
const GITHUB_FEED = { provider: "github", owner: "JasonZhangDad", repo: "MgTerminal-releases" };
const CN_TIMEZONES = new Set(["Asia/Shanghai", "Asia/Urumqi", "Asia/Chongqing", "Asia/Harbin"]);

/** Region heuristic mirroring updateMirror.ts: zh-CN locale or CN timezone. */
function shouldPreferMirrorFeed({ locale, timeZone } = {}) {
  if (locale && /^zh-CN/i.test(locale)) return true;
  if (timeZone && CN_TIMEZONES.has(timeZone)) return true;
  return false;
}

function detectPreferredFeed() {
  try {
    const { app } = _deps?.electronModule || {};
    const preferMirror = shouldPreferMirrorFeed({
      locale: app?.getLocale?.(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return preferMirror ? "mirror" : "github";
  } catch {
    return "github";
  }
}

/**
 * Windows arm64 publishes to channel "latest-arm64" (latest-arm64.yml) so it
 * cannot clobber x64 latest.yml. electron-updater must request that channel
 * or arm64 clients will try to download x64 installers and fail.
 */
function resolveUpdateChannel(platform = _platform, arch = process.arch) {
  if (platform === "win32" && arch === "arm64") return "latest-arm64";
  return "latest";
}

function applyFeed(updater, feed) {
  const channel = resolveUpdateChannel();
  // Keep channel in sync for both providers (generic uses latest[-arm64].yml).
  try {
    updater.channel = channel;
  } catch {
    // ignore — older electron-updater stubs in tests may not expose channel
  }
  if (feed === "mirror") {
    updater.setFeedURL({ provider: "generic", url: MIRROR_FEED_URL, channel });
  } else {
    updater.setFeedURL({ ...GITHUB_FEED, channel });
  }
}

/**
 * checkForUpdates on the region-preferred feed, retrying once on the other
 * feed when the preferred one fails (GitHub unreachable from mainland China;
 * the mirror could equally be down for everyone else).
 */
async function checkForUpdatesWithFallback(updater, preferredFeed = detectPreferredFeed()) {
  applyFeed(updater, preferredFeed);
  try {
    return await updater.checkForUpdates();
  } catch (err) {
    const fallbackFeed = preferredFeed === "mirror" ? "github" : "mirror";
    console.warn(
      `[AutoUpdate] ${preferredFeed} feed check failed (${err?.message || err}); retrying via ${fallbackFeed} feed`,
    );
    applyFeed(updater, fallbackFeed);
    return await updater.checkForUpdates();
  }
}

function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = readAutoUpdatePreference();
    autoUpdater.autoInstallOnAppQuit = false;
    // Silence the default electron-log transport (we log ourselves).
    autoUpdater.logger = null;
    try {
      autoUpdater.channel = resolveUpdateChannel();
    } catch {
      // ignore
    }
    _autoUpdater = autoUpdater;
    return autoUpdater;
  } catch (err) {
    console.error("[AutoUpdate] Failed to load electron-updater:", err?.message || err);
    return null;
  }
}

/**
 * Register persistent global IPC event listeners for auto-download flow.
 * Called once in init(). Forwards electron-updater events to the renderer
 * even when no manual download was initiated.
 */
function setupGlobalListeners() {
  if (_listenersRegistered) return;
  const updater = getAutoUpdater();
  if (!updater) return;
  _listenersRegistered = true;

  updater.on("update-not-available", () => {
    _isChecking = false;
    // Reset stale status so late-opening windows don't hydrate from a
    // previous 'error' or 'ready' snapshot after a "no update" check.
    _lastStatus = { status: 'idle', percent: 0, error: null, version: null, isChecking: false };
    broadcastToAllWindows("magiesTerminal:update:update-not-available", {});
  });

  updater.on("update-available", (info) => {
    _isChecking = false;
    // Only track as downloading when autoDownload is enabled — otherwise no
    // download will actually start and the status would be stuck at 0%.
    // Use 'available' so late-opening windows can still hydrate the version.
    const willDownload = updater.autoDownload !== false;
    _isDownloading = willDownload;
    _lastStatus = { status: willDownload ? 'downloading' : 'available', percent: 0, error: null, version: info.version || null, isChecking: false };
    broadcastToAllWindows("magiesTerminal:update:update-available", {
      version: info.version || "",
      releaseNotes: typeof info.releaseNotes === "string" ? info.releaseNotes : "",
      releaseDate: info.releaseDate || null,
    });
  });

  updater.on("download-progress", (info) => {
    _lastStatus.percent = Math.round(info.percent ?? 0);
    broadcastToAllWindows("magiesTerminal:update:download-progress", {
      percent: info.percent ?? 0,
      bytesPerSecond: info.bytesPerSecond ?? 0,
      transferred: info.transferred ?? 0,
      total: info.total ?? 0,
    });
  });

  updater.on("update-downloaded", (event) => {
    _isDownloading = false;
    _downloadedFile = event?.downloadedFile || _downloadedFile;
    _lastStatus = { ..._lastStatus, status: 'ready', percent: 100 };
    broadcastToAllWindows("magiesTerminal:update:downloaded");
  });

  updater.on("error", (err) => {
    _isChecking = false;
    if (_isInstalling) {
      failInstall(err?.message || "Update install failed");
      return;
    }
    // Only broadcast download-phase errors; check-phase errors (e.g. network failures
    // during checkForUpdates) are not download failures and must not set autoDownloadStatus.
    if (!_isDownloading) {
      _lastStatus = { ..._lastStatus, isChecking: false };
      console.warn("[AutoUpdate] Check-phase error (not broadcast to renderer):", err?.message || err);
      return;
    }
    _isDownloading = false;
    const errorMsg = err?.message || "Unknown update error";
    _lastStatus = { ..._lastStatus, status: 'error', error: errorMsg };
    broadcastToAllWindows("magiesTerminal:update:error", {
      error: errorMsg,
    });
  });

  console.log("[AutoUpdate] Global listeners registered");
}

/**
 * Trigger an automatic update check after a delay.
 * No-op on platforms that don't support auto-update (Linux deb/rpm/snap).
 * Called from main process after the main window is created.
 *
 * @param {number} delayMs - Milliseconds to wait before checking (default: 5000)
 */
let _autoCheckTimer = null;

function startAutoCheck(delayMs = 5000) {
  if (!isAutoUpdateSupported()) {
    console.log("[AutoUpdate] Platform does not support auto-update, skipping auto-check");
    return;
  }
  // Cancel any existing timer to avoid duplicate concurrent checks
  // (e.g. from multiple windows initializing or re-enable toggle).
  cancelAutoCheck();
  _autoCheckTimer = setTimeout(async () => {
    _autoCheckTimer = null;
    const updater = getAutoUpdater();
    if (!updater) {
      console.warn("[AutoUpdate] Auto-check skipped — updater not available");
      return;
    }
    // Respect autoDownload flag — the renderer may have disabled it via IPC
    // before this timer fires.
    if (updater.autoDownload === false) {
      console.log("[AutoUpdate] Auto-check skipped — autoDownload is disabled");
      return;
    }
    _isChecking = true;
    _lastStatus = { ..._lastStatus, isChecking: true };
    try {
      console.log("[AutoUpdate] Starting automatic update check...");
      await checkForUpdatesWithFallback(updater);
    } catch (err) {
      _isChecking = false;
      _lastStatus = { ..._lastStatus, isChecking: false };
      console.warn("[AutoUpdate] Auto-check failed:", err?.message || err);
    }
  }, delayMs);
}

/**
 * Cancel a pending startAutoCheck timer.  Called when the renderer triggers
 * a manual check to avoid racing with the queued auto-check.
 */
function cancelAutoCheck() {
  if (_autoCheckTimer) {
    clearTimeout(_autoCheckTimer);
    _autoCheckTimer = null;
  }
}

/**
 * Flip the windowManager "quitting for update" flag, swallowing the case where
 * the window manager module isn't available. Used by the install handler to
 * commit the app to a clean quit before quitAndInstall, and to roll back if the
 * install never actually quits (#1215).
 */
function setQuittingForUpdate(enabled) {
  try {
    const windowManager = require("./windowManager.cjs");
    windowManager.setQuittingForUpdate(!!enabled);
  } catch {
    // ignore — window manager may not be available
  }
}

function failInstall(message) {
  const error = message || "Update install failed";
  _isInstalling = false;
  _lastInstallError = error;
  _lastStatus = { ..._lastStatus, status: 'error', error };
  setQuittingForUpdate(false);
  broadcastToAllWindows("magiesTerminal:update:error", { error });
}

/**
 * The webContents for usable app-content windows. Used by the install handler to ask
 * every renderer that can own editor tabs about unsaved work before committing
 * to a quit. Targets registered app-content windows specifically (not
 * getAllWindows()[0]) so we never query tray/settings windows, whose renderers
 * don't participate in the dirty-editor protocol.
 */
function getAppContentWebContentsList() {
  try {
    const windowManager = require("./windowManager.cjs");
    const windows = typeof windowManager.getAppContentWindows === "function"
      ? windowManager.getAppContentWindows()
      : typeof windowManager.getMainWindows === "function"
        ? windowManager.getMainWindows()
        : [windowManager.getMainWindow?.()].filter(Boolean);
    return windows
      .filter((win) => win && !win.isDestroyed?.())
      .map((win) => win.webContents)
      .filter((wc) => wc && !wc.isDestroyed?.() && !wc.isCrashed?.());
  } catch {
    return [];
  }
}

/**
 * Tell the renderer that the update can't install yet because there are unsaved
 * editors. The renderer surfaces a toast asking the user to save, then click
 * "Restart Now" again.
 *
 * Broadcast to ALL windows, not just the main one: the install can be triggered
 * from the Settings window's "Restart to Update" button, and that's the focused
 * window the user is looking at. Sending only to the (possibly hidden/behind)
 * main window would make the click appear to do nothing (#1215 review). The
 * unsaved editors live in the main window, but every window surfaces the same
 * "save first" notice so it lands wherever the user is.
 */
function notifyNeedsSave() {
  broadcastToAllWindows("magiesTerminal:update:needs-save");
}

/** Max time to wait for the renderer's unsaved-editors reply before the install
 *  fails open and proceeds (matches the before-quit guard timeout). */
const INSTALL_DIRTY_CHECK_TIMEOUT_MS = 5000;

/**
 * Ask the main-window renderer whether it has unsaved editor changes, reusing
 * the shared dirty-editor round-trip. Resolves false (fail open) if the helper
 * is unavailable, so a missing module can never block an install. `ipcMain` is
 * the instance passed to registerHandlers; the helper needs it to listen for
 * the reply.
 */
function queryDirtyEditorsSafe(webContents, ipcMain) {
  try {
    const { queryDirtyEditors } = require("./dirtyEditorGuard.cjs");
    return queryDirtyEditors(webContents, INSTALL_DIRTY_CHECK_TIMEOUT_MS, { ipcMain });
  } catch (err) {
    console.warn("[AutoUpdate] dirty-editor guard unavailable:", err?.message || err);
    return Promise.resolve(false);
  }
}

/**
 * If quitAndInstall doesn't lead to the app actually quitting (it returns
 * without app.quit(), e.g. on a Squirrel.Mac follow-up error or a stale
 * downloaded file), the quitting-for-update flags would stay set and
 * permanently bypass close-to-tray + the dirty-editor quit guard. This
 * watchdog clears them if we're still running after a grace period.
 *
 * The grace period is deliberately long. On macOS quitAndInstall() can return
 * while Squirrel.Mac is still pulling the already-downloaded ZIP from the local
 * update server before it actually closes the windows; for a large/slow update
 * that second stage can take well over 10s. If the watchdog cleared isQuitting
 * during that window, the eventual native quit would hit a *non*-quitting
 * close-to-tray handler and get stranded again — the exact #1215 failure. So we
 * only roll back after a window long enough that the app is realistically stuck,
 * not merely slow. The cost of waiting longer is just that close-to-tray stays
 * bypassed a bit longer in the rare genuine-failure case (#1215 review).
 */
let _quittingForUpdateWatchdog = null;
const QUITTING_FOR_UPDATE_WATCHDOG_MS = 60000;

function scheduleQuittingForUpdateWatchdog() {
  if (_quittingForUpdateWatchdog) {
    clearTimeout(_quittingForUpdateWatchdog);
  }
  _quittingForUpdateWatchdog = setTimeout(() => {
    _quittingForUpdateWatchdog = null;
    // Still alive after the grace period — the install did not quit the app.
    console.warn("[AutoUpdate] App still running after quitAndInstall; clearing quitting-for-update state");
    failInstall("Update install did not restart the app. Please download the latest release manually.");
  }, QUITTING_FOR_UPDATE_WATCHDOG_MS);
  // Don't let the watchdog keep the event loop (and thus the process) alive —
  // if the app is otherwise ready to quit, the timer must not block it.
  if (typeof _quittingForUpdateWatchdog.unref === "function") {
    _quittingForUpdateWatchdog.unref();
  }
}

function init(deps) {
  _deps = deps;
  _platform = deps?.platform || process.platform;
  _isAutoUpdateSupported = typeof deps?.isAutoUpdateSupported === "function"
    ? deps.isAutoUpdateSupported
    : defaultIsAutoUpdateSupported;
  setupGlobalListeners();

  // macOS: electron-updater's MacUpdater calls the native (Squirrel.Mac)
  // autoUpdater.setFeedURL after a download completes even though we never use
  // Squirrel to install. On an unsigned app any native error event would be an
  // unhandled EventEmitter 'error' and crash the main process — swallow it.
  if (_platform === "darwin") {
    try {
      _deps?.electronModule?.autoUpdater?.on?.("error", (err) => {
        console.warn("[AutoUpdate] Native Squirrel autoUpdater error (ignored — installs use macSelfUpdate):", err?.message || err);
      });
    } catch {
      // ignore — native autoUpdater unavailable in this context
    }
  }
}

/**
 * Broadcast an IPC event to all non-destroyed BrowserWindows.
 * Ensures both the main window and settings window always receive
 * auto-update events.
 * @param {string} channel
 * @param {unknown} [payload]
 */
function broadcastToAllWindows(channel, payload) {
  try {
    const { BrowserWindow } = _deps?.electronModule || {};
    if (!BrowserWindow) return;
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        if (payload !== undefined) {
          win.webContents.send(channel, payload);
        } else {
          win.webContents.send(channel);
        }
      }
    }
  } catch (err) {
    console.warn("[AutoUpdate] broadcastToAllWindows failed:", err?.message || err);
  }
}

function registerHandlers(ipcMain) {
  // ---- Check for updates ------------------------------------------------
  ipcMain.handle("magiesTerminal:update:check", async () => {
    // Cancel any pending auto-check to prevent concurrent checkForUpdates()
    // calls — electron-updater rejects them and surfaces false errors.
    cancelAutoCheck();

    if (!isAutoUpdateSupported()) {
      return {
        available: false,
        supported: false,
        error: "Auto-update is not supported on this platform/package format.",
      };
    }

    const updater = getAutoUpdater();
    if (!updater) {
      return {
        available: false,
        supported: false,
        error: "Update module failed to load.",
      };
    }

    // If a check is already in flight (e.g. from startAutoCheck), don't
    // start a concurrent one — electron-updater rejects it and surfaces a
    // confusing error.  Return a sentinel so the renderer knows to wait.
    if (_isChecking) {
      return { available: false, supported: true, checking: true };
    }

    // If a download is already in progress or the update is ready to install,
    // skip the check entirely — calling checkForUpdates() while downloading
    // can cause electron-updater to error, which corrupts the download state
    // and forces the user to download manually (GitHub issue #522).
    if (_isDownloading) {
      return { available: true, supported: true, downloading: true, version: _lastStatus.version };
    }
    if (_lastStatus.status === 'ready') {
      return { available: true, supported: true, ready: true, version: _lastStatus.version };
    }

    try {
      _isChecking = true;
      _lastStatus = { ..._lastStatus, isChecking: true };
      const result = await checkForUpdatesWithFallback(updater);
      if (!result || !result.updateInfo) {
        return { available: false, supported: true };
      }

      const { version, releaseNotes, releaseDate } = result.updateInfo;

      // Compare with current version using semver ordering.
      // Only report an update when the feed version is strictly newer,
      // avoiding false positives for pre-release or nightly builds.
      const { app } = _deps?.electronModule || {};
      const currentVersion = app?.getVersion?.() || "0.0.0";
      const isNewer = currentVersion.localeCompare(version, undefined, { numeric: true, sensitivity: 'base' }) < 0;
      if (!isNewer) {
        return { available: false, supported: true };
      }

      return {
        available: true,
        supported: true,
        version,
        releaseNotes: typeof releaseNotes === "string" ? releaseNotes : "",
        releaseDate: releaseDate || null,
      };
    } catch (err) {
      console.warn("[AutoUpdate] Check failed:", err?.message || err);
      return {
        available: false,
        supported: true,
        error: err?.message || "Unknown update check error",
      };
    } finally {
      // Always clear the in-flight flag. Event handlers also clear it, but if
      // checkForUpdates resolves without emitting (or after a throw before the
      // event), leaving _isChecking true blocks every subsequent check and
      // forces the renderer into a false "update failed" path.
      _isChecking = false;
      _lastStatus = { ..._lastStatus, isChecking: false };
    }
  });

  // ---- Download update ---------------------------------------------------
  ipcMain.handle("magiesTerminal:update:download", async () => {
    if (_isDownloading) {
      return { success: true };
    }
    const updater = getAutoUpdater();
    if (!updater) {
      return { success: false, error: "Update module not available." };
    }
    try {
      _isDownloading = true;
      _lastStatus = { ..._lastStatus, status: 'downloading', percent: 0, error: null };
      await updater.downloadUpdate();
      return { success: true };
    } catch (err) {
      _isDownloading = false;
      _lastStatus = { ..._lastStatus, status: 'error', error: err?.message || "Download failed", percent: 0 };
      // Don't broadcast here — the global updater "error" listener already handles it
      console.error("[AutoUpdate] Download failed:", err?.message || err);
      return { success: false, error: err?.message || "Download failed" };
    }
  });

  // ---- Get current update status (for late-opening windows) ---------------
  ipcMain.handle("magiesTerminal:update:getStatus", () => {
    return { ..._lastStatus };
  });

  // ---- Install (quit & install) ------------------------------------------
  ipcMain.handle("magiesTerminal:update:install", async () => {
    if (_isInstalling) {
      return { success: true, installing: true };
    }
    if (!isAutoUpdateSupported()) {
      return {
        success: false,
        unsupported: true,
        error: "Auto-install is not supported on this platform. Download the latest release manually.",
      };
    }

    const updater = getAutoUpdater();
    if (!updater) {
      return { success: false, error: "Update module not available." };
    }

    // Check for unsaved editors BEFORE committing to a quit (#1215 review).
    //
    // On macOS quitAndInstall() closes windows first and only then fires
    // before-quit. Once setQuittingForUpdate(true) lets the main window
    // actually close (instead of hiding to tray), the before-quit dirty-editor
    // guard can run after the window is already gone — isReachableByUser is
    // false, so it commits the quit and silently drops unsaved SFTP edits.
    //
    // So we ask the renderer here, while the window and renderer are still
    // alive. If there's unsaved work in any main window, abort the install
    // (don't touch the quitting flags, don't quitAndInstall) and tell the
    // renderer to prompt the user to save; they can click "Restart Now" again
    // afterwards. If no main window is reachable (no window / crashed
    // renderer) there's no user to ask, so we install directly — matching the
    // before-quit fail-open path.
    const mainWebContents = getAppContentWebContentsList();
    if (mainWebContents.length > 0) {
      const dirtyResults = await Promise.all(
        mainWebContents.map((webContents) => queryDirtyEditorsSafe(webContents, ipcMain)),
      );
      if (dirtyResults.some(Boolean)) {
        // Broadcast so the notice reaches whichever window the user clicked
        // from (main or Settings), not just the main window we queried.
        notifyNeedsSave();
        return { success: false, needsSave: true };
      }
    }

    // macOS: unsigned builds cannot use Squirrel.Mac (quitAndInstall), so the
    // downloaded zip is installed by swapping the .app bundle in place, then
    // relaunching into the new version. The swap happens BEFORE the quit flags
    // are set: it can take a few seconds (ditto extract) and can fail, and a
    // failed swap must leave close-to-tray / quit guards untouched.
    if (_platform === "darwin") {
      const { app } = _deps?.electronModule || {};
      let macSelfUpdate;
      try {
        macSelfUpdate = require("./macSelfUpdate.cjs");
      } catch (err) {
        return { success: false, error: "macOS self-update module unavailable." };
      }
      try {
        _isInstalling = true;
        _lastInstallError = null;
        _lastStatus = { ..._lastStatus, status: 'installing', error: null };
        await macSelfUpdate.installMacUpdateFromZip({
          zipPath: _downloadedFile,
          bundlePath: macSelfUpdate.resolveMacBundlePath(app?.getPath?.("exe") || process.execPath),
        });
      } catch (err) {
        const message = err?.message || "Install failed";
        console.error("[AutoUpdate] macOS self-update failed:", message);
        failInstall(message);
        return { success: false, error: message };
      }
      // Bundle swapped on disk — commit to a real quit and relaunch into the
      // new version. Same quit choreography as the quitAndInstall path below.
      setQuittingForUpdate(true);
      try {
        const globalShortcutBridge = require("./globalShortcutBridge.cjs");
        globalShortcutBridge.cleanup();
      } catch {
        // ignore — bridge may not be available
      }
      app?.relaunch?.();
      app?.quit?.();
      scheduleQuittingForUpdateWatchdog();
      return { success: true };
    }

    // Commit the app to a real quit BEFORE quitAndInstall fires app.quit().
    // Without this the in-place install silently fails (#1215): the main-window
    // close handler hides to tray when close-to-tray is on, so the process
    // stays alive and Squirrel.Mac's ShipIt helper — which waits on the parent
    // PID to die before swapping the bundle — ends up in launchd "pending
    // spawn" limbo and never installs. setQuittingForUpdate(true) sets
    // isQuitting so close-to-tray is bypassed and the window actually closes.
    setQuittingForUpdate(true);

    // On macOS, the system tray keeps the app process alive even after all
    // windows are closed, which prevents quitAndInstall from completing.
    // Destroy the tray (and its panel window) before quitting so the app
    // can exit cleanly and the installer can proceed.
    try {
      const globalShortcutBridge = require("./globalShortcutBridge.cjs");
      globalShortcutBridge.cleanup();
    } catch {
      // ignore — bridge may not be available
    }

    try {
      _isInstalling = true;
      _lastInstallError = null;
      _lastStatus = { ..._lastStatus, status: 'installing', error: null };
      updater.quitAndInstall(false, true);
    } catch (err) {
      // quitAndInstall threw synchronously — the app will NOT quit. Roll back
      // the quitting-for-update flags so later closes/quits behave normally
      // instead of permanently bypassing close-to-tray + the dirty-editor
      // guard (#1215 review).
      console.error("[AutoUpdate] quitAndInstall failed:", err?.message || err);
      const message = err?.message || "Install failed";
      failInstall(message);
      return { success: false, error: message };
    }

    // electron-updater reports several immediate install failures by emitting
    // `error` instead of throwing. The listener above handles the rollback;
    // don't return a false success to the renderer in that case.
    if (!_isInstalling && _lastInstallError) {
      return { success: false, error: _lastInstallError };
    }

    // quitAndInstall can also fail to quit asynchronously (e.g. Squirrel.Mac's
    // follow-up check errors, or a stale/missing downloaded file) — it returns
    // without app.quit() ever firing. A watchdog clears the flags if we're
    // still alive shortly after, so the app doesn't get stuck in a state where
    // every window close bypasses close-to-tray and the dirty-editor guard.
    scheduleQuittingForUpdateWatchdog();
    return { success: true };
  });

  // ---- Get auto-update preference -----------------------------------------
  ipcMain.handle("magiesTerminal:update:getAutoUpdate", () => {
    return { enabled: readAutoUpdatePreference() };
  });

  // ---- Enable/disable auto-update ----------------------------------------
  let _prevAutoDownloadEnabled = readAutoUpdatePreference();
  ipcMain.handle("magiesTerminal:update:setAutoUpdate", (_event, { enabled }) => {
    const wasEnabled = _prevAutoDownloadEnabled;
    _prevAutoDownloadEnabled = !!enabled;
    const updater = getAutoUpdater();
    if (updater) {
      updater.autoDownload = !!enabled;
      console.log("[AutoUpdate] autoDownload set to:", !!enabled);
    }
    // Persist so the preference survives app restarts
    writeAutoUpdatePreference(!!enabled);
    if (!enabled) {
      cancelAutoCheck();
    } else if (!wasEnabled && !_isChecking) {
      // Only re-schedule when actually re-enabling (not on every mount sync),
      // to avoid duplicate checks from multiple windows initializing.
      // Skip if a check is already in flight to prevent concurrent calls.
      startAutoCheck(2000);
    }
    return { success: true };
  });

  console.log("[AutoUpdate] Handlers registered");
}

module.exports = {
  init,
  registerHandlers,
  isAutoUpdateSupported,
  isPlatformAutoUpdateSupported,
  startAutoCheck,
  shouldPreferMirrorFeed,
  checkForUpdatesWithFallback,
  resolveUpdateChannel,
  applyFeed,
};
