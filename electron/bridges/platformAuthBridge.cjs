"use strict";

/**
 * Platform user-presence auth (Touch ID / future Hello).
 * Opt-in vault unlock gate — not a portable passkey identity.
 */

function createPlatformAuthBridge({ electronModule, console: log = console } = {}) {
  const systemPreferences = electronModule?.systemPreferences || null;
  const processRef = global.process;

  const getPlatform = () => processRef?.platform || "unknown";

  const canPromptTouchID = () => {
    try {
      if (getPlatform() !== "darwin") return false;
      return Boolean(systemPreferences?.canPromptTouchID?.());
    } catch (err) {
      log.warn?.("[platformAuth] canPromptTouchID failed", err?.message || err);
      return false;
    }
  };

  const getStatus = () => {
    const platform = getPlatform();
    const touchId = canPromptTouchID();
    return {
      platform,
      available: touchId, // v1: macOS Touch ID only
      methods: touchId ? ["touchId"] : [],
      label: touchId ? "touchId" : platform === "win32" ? "windowsHelloUnavailable" : "unavailable",
    };
  };

  const prompt = async (reason) => {
    const status = getStatus();
    if (!status.available) {
      return { success: false, error: "platform_unavailable", status };
    }
    const message =
      typeof reason === "string" && reason.trim()
        ? reason.trim().slice(0, 200)
        : "Unlock MagiesTerminal vault";
    try {
      await systemPreferences.promptTouchID(message);
      return { success: true, status };
    } catch (err) {
      const msg = err?.message || String(err);
      // User cancel is expected
      if (/cancel|denied|fail/i.test(msg)) {
        return { success: false, error: "cancelled", status, message: msg };
      }
      return { success: false, error: "failed", status, message: msg };
    }
  };

  const register = (ipcMain) => {
    if (!ipcMain) return;
    ipcMain.handle("magiesTerminal:platformAuth:status", async () => getStatus());
    ipcMain.handle("magiesTerminal:platformAuth:prompt", async (_event, payload) => {
      return prompt(payload?.reason);
    });
  };

  return { getStatus, prompt, canPromptTouchID, register };
}

module.exports = { createPlatformAuthBridge };
