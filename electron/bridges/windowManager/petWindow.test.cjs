const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createPetWindowApi,
  buildPetWindowOptions,
  resolveDefaultPetPosition,
  isPositionOnAnyDisplay,
  resolvePetPosition,
  PET_WINDOW_WIDTH,
  PET_WINDOW_HEIGHT,
} = require("./petWindow.cjs");

class FakeWebContents extends EventEmitter {
  isDestroyed() { return false; }
  setWindowOpenHandler() {}
}

class FakeBrowserWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.destroyed = false;
    this.visible = false;
    this.webContents = new FakeWebContents();
    this.loadURLCalls = [];
    this.x = typeof options?.x === "number" ? options.x : 0;
    this.y = typeof options?.y === "number" ? options.y : 0;
  }
  isDestroyed() { return this.destroyed; }
  show() { this.visible = true; }
  hide() { this.visible = false; }
  isVisible() { return this.visible; }
  close() { this.destroyed = true; this.emit("closed"); }
  loadURL(url) { this.loadURLCalls.push(url); return Promise.resolve(); }
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  getPosition() { return [this.x, this.y]; }
  setPosition(x, y) { this.x = x; this.y = y; this.emit("move"); }
}

class FakeScreen extends EventEmitter {
  constructor(displays) {
    super();
    this.displays = displays;
  }
  getPrimaryDisplay() { return this.displays[0]; }
  getAllDisplays() { return this.displays; }
}

const PRIMARY_DISPLAY = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 } };

function fakeElectronModule({ displays = [PRIMARY_DISPLAY] } = {}) {
  const created = [];
  const BrowserWindow = function BrowserWindow(options) {
    const win = new FakeBrowserWindow(options);
    created.push(win);
    return win;
  };
  return {
    created,
    module: {
      BrowserWindow,
      screen: new FakeScreen(displays),
    },
  };
}

function makeTempUserDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pet-window-test-"));
}

test("buildPetWindowOptions produces a frameless, transparent, always-on-top overlay", () => {
  const options = buildPetWindowOptions({ preload: "/preload.cjs", x: 10, y: 20 });
  assert.equal(options.frame, false);
  assert.equal(options.transparent, true);
  assert.equal(options.alwaysOnTop, true);
  assert.equal(options.skipTaskbar, true);
  assert.equal(options.resizable, false);
  assert.equal(options.hasShadow, false);
  assert.equal(options.width, PET_WINDOW_WIDTH);
  assert.equal(options.height, PET_WINDOW_HEIGHT);
  assert.equal(options.x, 10);
  assert.equal(options.y, 20);
  assert.equal(options.webPreferences.preload, "/preload.cjs");
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, false);
  assert.equal(
    options.webPreferences.backgroundThrottling,
    false,
    "the idle animation must not be throttled just because the pet never has OS focus",
  );
});

test("buildPetWindowOptions omits x/y when no position is given", () => {
  const options = buildPetWindowOptions({ preload: "/preload.cjs" });
  assert.equal("x" in options, false);
  assert.equal("y" in options, false);
});

test("resolveDefaultPetPosition anchors the pet to the bottom-right of the primary display's work area", () => {
  const { module: electronModule } = fakeElectronModule();
  const { x, y } = resolveDefaultPetPosition(electronModule);
  assert.equal(x, 1920 - PET_WINDOW_WIDTH - 24);
  assert.equal(y, 1080 - PET_WINDOW_HEIGHT - 24);
});

test("resolveDefaultPetPosition falls back to an empty position when screen is unavailable", () => {
  assert.deepEqual(resolveDefaultPetPosition({}), {});
});

test("isPositionOnAnyDisplay accepts a position with a visible corner on some display", () => {
  const size = { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT };
  assert.equal(isPositionOnAnyDisplay({ x: 100, y: 100 }, [PRIMARY_DISPLAY], size), true);
});

test("isPositionOnAnyDisplay rejects a position off every connected display", () => {
  const size = { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT };
  assert.equal(isPositionOnAnyDisplay({ x: 5000, y: 5000 }, [PRIMARY_DISPLAY], size), false);
});

test("isPositionOnAnyDisplay rejects malformed or missing positions", () => {
  const size = { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT };
  assert.equal(isPositionOnAnyDisplay(null, [PRIMARY_DISPLAY], size), false);
  assert.equal(isPositionOnAnyDisplay({ x: "10", y: 10 }, [PRIMARY_DISPLAY], size), false);
  assert.equal(isPositionOnAnyDisplay({ x: 10, y: 10 }, [], size), false);
});

test("resolvePetPosition uses a saved position when it's still on some display", () => {
  const { module: electronModule } = fakeElectronModule();
  const userDataPath = makeTempUserDataDir();
  fs.writeFileSync(path.join(userDataPath, "pet-window-state.json"), JSON.stringify({ x: 300, y: 300 }));

  assert.deepEqual(resolvePetPosition(electronModule, userDataPath), { x: 300, y: 300 });
});

test("resolvePetPosition falls back to the default corner when no saved position exists", () => {
  const { module: electronModule } = fakeElectronModule();
  const userDataPath = makeTempUserDataDir();

  assert.deepEqual(resolvePetPosition(electronModule, userDataPath), resolveDefaultPetPosition(electronModule));
});

test("resolvePetPosition falls back to the default corner when the saved monitor is gone", () => {
  const { module: electronModule } = fakeElectronModule();
  const userDataPath = makeTempUserDataDir();
  // Saved from a second monitor that isn't connected anymore.
  fs.writeFileSync(path.join(userDataPath, "pet-window-state.json"), JSON.stringify({ x: 5000, y: 5000 }));

  assert.deepEqual(resolvePetPosition(electronModule, userDataPath), resolveDefaultPetPosition(electronModule));
});

test("ensurePetWindow reuses the existing window instead of creating a second one", () => {
  const { created, module: electronModule } = fakeElectronModule();
  const api = createPetWindowApi({ getDevRendererBaseUrl: () => "http://localhost:5173", electronApp: { getPath: () => null } });

  const win1 = api.ensurePetWindow(electronModule, { preload: "/preload.cjs", isDev: false });
  const win2 = api.ensurePetWindow(electronModule, { preload: "/preload.cjs", isDev: false });

  assert.equal(win1, win2);
  assert.equal(created.length, 1);
  assert.equal(created[0].loadURLCalls[0], "app://magiesTerminal/index.html#/pet");
});

test("ensurePetWindow creates a fresh window after the previous one was closed", () => {
  const { created, module: electronModule } = fakeElectronModule();
  const api = createPetWindowApi({ getDevRendererBaseUrl: () => "http://localhost:5173", electronApp: { getPath: () => null } });

  const win1 = api.ensurePetWindow(electronModule, { preload: "/preload.cjs", isDev: false });
  win1.close();
  const win2 = api.ensurePetWindow(electronModule, { preload: "/preload.cjs", isDev: false });

  assert.notEqual(win1, win2);
  assert.equal(created.length, 2);
});

test("hidePetWindow and closePetWindow are safe no-ops before any window exists", () => {
  const api = createPetWindowApi({ getDevRendererBaseUrl: () => "http://localhost:5173", electronApp: { getPath: () => null } });
  assert.doesNotThrow(() => api.hidePetWindow());
  assert.doesNotThrow(() => api.closePetWindow());
  assert.equal(api.isPetWindowVisible(), false);
});

test("showPetWindow makes the window visible", () => {
  const { module: electronModule } = fakeElectronModule();
  const api = createPetWindowApi({ getDevRendererBaseUrl: () => "http://localhost:5173", electronApp: { getPath: () => null } });

  const win = api.showPetWindow(electronModule, { preload: "/preload.cjs", isDev: false });

  assert.equal(win.isVisible(), true);
  assert.equal(api.isPetWindowVisible(), true);

  api.hidePetWindow();
  assert.equal(win.isVisible(), false);
  assert.equal(api.isPetWindowVisible(), false);
});

test("moving the pet window persists its position to disk, debounced", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { module: electronModule } = fakeElectronModule();
  const userDataPath = makeTempUserDataDir();
  const api = createPetWindowApi({
    getDevRendererBaseUrl: () => "http://localhost:5173",
    electronApp: { getPath: () => userDataPath },
  });

  const win = api.ensurePetWindow(electronModule, { preload: "/preload.cjs", isDev: false });
  win.setPosition(111, 222);
  win.setPosition(333, 444); // a second move within the debounce window replaces the first

  const stateFile = path.join(userDataPath, "pet-window-state.json");
  assert.equal(fs.existsSync(stateFile), false, "save should be debounced, not immediate");

  t.mock.timers.tick(500);
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, "utf8")), { x: 333, y: 444 });
});

test("resetPetWindowPosition moves the pet back to the default corner and persists it", () => {
  const { module: electronModule } = fakeElectronModule();
  const userDataPath = makeTempUserDataDir();
  const api = createPetWindowApi({
    getDevRendererBaseUrl: () => "http://localhost:5173",
    electronApp: { getPath: () => userDataPath },
  });

  const win = api.ensurePetWindow(electronModule, { preload: "/preload.cjs", isDev: false });
  win.setPosition(900, 900);

  api.resetPetWindowPosition(electronModule);

  const expected = resolveDefaultPetPosition(electronModule);
  assert.deepEqual(win.getPosition(), [expected.x, expected.y]);
  const stateFile = path.join(userDataPath, "pet-window-state.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, "utf8")), expected);
});

test("a display-removed event nudges an off-screen pet back onto the default corner", () => {
  const { module: electronModule } = fakeElectronModule();
  const userDataPath = makeTempUserDataDir();
  const api = createPetWindowApi({
    getDevRendererBaseUrl: () => "http://localhost:5173",
    electronApp: { getPath: () => userDataPath },
  });

  const win = api.ensurePetWindow(electronModule, { preload: "/preload.cjs", isDev: false });
  // Simulate the pet having been dragged onto a second monitor that's about to disappear.
  win.setPosition(2500, 200);

  electronModule.screen.emit("display-removed");

  const expected = resolveDefaultPetPosition(electronModule);
  assert.deepEqual(win.getPosition(), [expected.x, expected.y]);
});
