/* eslint-disable no-undef */

// Small always-on-top overlay window for the desktop AI-status pet (Settings → AI → Pet).
// Unlike the settings/terminal-popup windows, it needs no main-process-pushed config:
// its enabled flag, custom image, and live AI status all travel through localStorage,
// which every window loading the app:// origin shares (see application/state/usePetStatusBroadcaster.ts
// and components/pet/PetWidget.tsx). Its screen position, however, is main-process-only
// state (see below) since the renderer has no persistent storage that survives outside
// the browser origin's quota and can't be read before the window exists.

const path = require("node:path");
const fs = require("node:fs");

const PET_WINDOW_WIDTH = 220;
const PET_WINDOW_HEIGHT = 240;
const PET_WINDOW_SCREEN_MARGIN = 24;
const PET_STATE_FILE = "pet-window-state.json";
const POSITION_SAVE_DEBOUNCE_MS = 400;
/** Minimum px of the pet window that must overlap a display to count as "on screen". */
const MIN_VISIBLE_OVERLAP_PX = 20;

function buildPetWindowOptions({ preload, x, y } = {}) {
  return {
    width: PET_WINDOW_WIDTH,
    height: PET_WINDOW_HEIGHT,
    ...(typeof x === "number" && typeof y === "number" ? { x, y } : {}),
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // The pet is a decorative overlay that the user rarely gives OS focus to
      // (only while dragging it). Electron throttles CSS animations/timers for
      // unfocused windows by default, which would leave the idle "breathing"
      // animation looking frozen almost all the time.
      backgroundThrottling: false,
    },
  };
}

function resolveDefaultPetPosition(electronModule) {
  try {
    const { screen } = electronModule;
    const display = screen.getPrimaryDisplay();
    const { x, y, width, height } = display.workArea;
    return {
      x: Math.round(x + width - PET_WINDOW_WIDTH - PET_WINDOW_SCREEN_MARGIN),
      y: Math.round(y + height - PET_WINDOW_HEIGHT - PET_WINDOW_SCREEN_MARGIN),
    };
  } catch {
    return {};
  }
}

/**
 * A saved position only counts as usable if at least a corner of the pet
 * would land on some currently-connected display — otherwise a monitor that
 * existed at save time but is unplugged now would strand the pet off-screen
 * with no way to reach it.
 */
function isPositionOnAnyDisplay(position, displays, size) {
  if (!position || typeof position.x !== "number" || typeof position.y !== "number") return false;
  if (!Array.isArray(displays) || displays.length === 0) return false;
  const winLeft = position.x;
  const winTop = position.y;
  const winRight = winLeft + size.width;
  const winBottom = winTop + size.height;
  return displays.some((display) => {
    const { x, y, width, height } = display.bounds;
    const overlapX = Math.min(winRight, x + width) - Math.max(winLeft, x);
    const overlapY = Math.min(winBottom, y + height) - Math.max(winTop, y);
    return overlapX > MIN_VISIBLE_OVERLAP_PX && overlapY > MIN_VISIBLE_OVERLAP_PX;
  });
}

function getPetStateFilePath(userDataPath) {
  if (!userDataPath) return null;
  return path.join(userDataPath, PET_STATE_FILE);
}

function loadPetPosition(userDataPath) {
  try {
    const filePath = getPetStateFilePath(userDataPath);
    if (!filePath || !fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
      return { x: parsed.x, y: parsed.y };
    }
    return null;
  } catch {
    return null;
  }
}

function savePetPositionSync(userDataPath, position) {
  try {
    const filePath = getPetStateFilePath(userDataPath);
    if (!filePath) return false;
    fs.writeFileSync(filePath, JSON.stringify(position), { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function resolvePetPosition(electronModule, userDataPath) {
  const { screen } = electronModule;
  const saved = loadPetPosition(userDataPath);
  const size = { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT };
  if (saved && isPositionOnAnyDisplay(saved, screen.getAllDisplays(), size)) {
    return saved;
  }
  return resolveDefaultPetPosition(electronModule);
}

function createPetWindowApi(ctx) {
  with (ctx) {
    let petWindow = null;
    let saveTimer = null;
    let displayListenersAttached = false;

    function isLivePetWindow() {
      return Boolean(petWindow && !petWindow.isDestroyed());
    }

    function queuePositionSave(electronModule) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        if (!isLivePetWindow()) return;
        const [x, y] = petWindow.getPosition();
        savePetPositionSync(electronApp?.getPath?.("userData"), { x, y });
      }, POSITION_SAVE_DEBOUNCE_MS);
    }

    /** Nudges the pet back on-screen if the display it was on just got disconnected/resized. */
    function reclampToDisplays(electronModule) {
      if (!isLivePetWindow()) return;
      const { screen } = electronModule;
      const [x, y] = petWindow.getPosition();
      const size = { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT };
      if (isPositionOnAnyDisplay({ x, y }, screen.getAllDisplays(), size)) return;
      const fallback = resolveDefaultPetPosition(electronModule);
      petWindow.setPosition(fallback.x, fallback.y);
      savePetPositionSync(electronApp?.getPath?.("userData"), fallback);
    }

    function attachDisplayListeners(electronModule) {
      if (displayListenersAttached) return;
      displayListenersAttached = true;
      const { screen } = electronModule;
      const handler = () => reclampToDisplays(electronModule);
      screen.on("display-added", handler);
      screen.on("display-removed", handler);
      screen.on("display-metrics-changed", handler);
    }

    function ensurePetWindow(electronModule, options = {}) {
      const { BrowserWindow } = electronModule;
      if (isLivePetWindow()) return petWindow;

      const { preload, devServerUrl, isDev } = options;
      const { x, y } = resolvePetPosition(electronModule, electronApp?.getPath?.("userData"));
      const win = new BrowserWindow(buildPetWindowOptions({ preload, x, y }));
      petWindow = win;

      try {
        // "screen-saver" level keeps the pet above fullscreen apps on macOS, matching
        // how Codex-style pets stay visible even when another app is frontmost.
        win.setAlwaysOnTop(true, "screen-saver");
      } catch {
        // ignore - not supported on all platforms
      }

      try {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } catch {
        // ignore - not supported on all platforms
      }

      win.webContents?.setWindowOpenHandler?.(() => ({ action: "deny" }));

      win.on("move", () => queuePositionSave(electronModule));
      win.on("closed", () => {
        if (petWindow === win) petWindow = null;
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
      });

      attachDisplayListeners(electronModule);

      const petPath = "#/pet";
      if (isDev) {
        const baseUrl = getDevRendererBaseUrl(devServerUrl);
        win.loadURL(`${baseUrl}${petPath}`).catch(() => {
          if (!win.isDestroyed()) win.loadURL(`app://magiesTerminal/index.html${petPath}`);
        });
      } else {
        win.loadURL(`app://magiesTerminal/index.html${petPath}`);
      }

      return win;
    }

    function showPetWindow(electronModule, options = {}) {
      const win = ensurePetWindow(electronModule, options);
      win.show();
      return win;
    }

    function hidePetWindow() {
      if (!isLivePetWindow()) return;
      petWindow.hide();
    }

    function closePetWindow() {
      if (!isLivePetWindow()) return;
      petWindow.close();
    }

    function isPetWindowVisible() {
      return isLivePetWindow() && petWindow.isVisible();
    }

    // The pet is dragged via renderer pointer events (not `-webkit-app-region: drag`):
    // on macOS, native window dragging runs its own modal move-loop that stalls the
    // renderer's compositor, freezing CSS animations for the whole drag. Moving the
    // window from here on every pointermove keeps the renderer's run loop live, so
    // the pet keeps animating while it's being dragged. The window's own "move" event
    // (registered above) picks up the debounced position save either way.
    function movePetWindowBy(dx, dy) {
      if (!isLivePetWindow()) return;
      const [x, y] = petWindow.getPosition();
      petWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
    }

    function resetPetWindowPosition(electronModule) {
      if (!isLivePetWindow()) return;
      const fallback = resolveDefaultPetPosition(electronModule);
      petWindow.setPosition(fallback.x, fallback.y);
      savePetPositionSync(electronApp?.getPath?.("userData"), fallback);
    }

    function setPetWindowOpacity(opacity) {
      if (!isLivePetWindow()) return;
      const clamped = Math.min(1, Math.max(0.3, Number(opacity)));
      if (Number.isFinite(clamped)) petWindow.setOpacity(clamped);
    }

    function setPetWindowAlwaysOnTop(enabled) {
      if (!isLivePetWindow()) return;
      if (enabled) petWindow.setAlwaysOnTop(true, "screen-saver");
      else petWindow.setAlwaysOnTop(false);
    }

    return {
      ensurePetWindow,
      showPetWindow,
      hidePetWindow,
      closePetWindow,
      isPetWindowVisible,
      movePetWindowBy,
      resetPetWindowPosition,
      setPetWindowOpacity,
      setPetWindowAlwaysOnTop,
    };
  }
}

module.exports = {
  createPetWindowApi,
  buildPetWindowOptions,
  resolveDefaultPetPosition,
  isPositionOnAnyDisplay,
  resolvePetPosition,
  PET_WINDOW_WIDTH,
  PET_WINDOW_HEIGHT,
};
