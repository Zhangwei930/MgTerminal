"use strict";

/**
 * Minimal IPC sender trust checks for privileged main-process handlers.
 * Not a full sandbox replacement — rejects destroyed senders and non-window
 * webContents (e.g. unexpected guests) so vault/credential surfaces are not
 * callable from arbitrary contexts.
 */

const { BrowserWindow } = require("electron");

/**
 * @param {Electron.IpcMainInvokeEvent | { sender?: Electron.WebContents }} event
 * @param {{ allowDestroyed?: boolean }} [options]
 * @returns {{ ok: true, webContents: Electron.WebContents, window: Electron.BrowserWindow | null }
 *   | { ok: false, error: string }}
 */
function validateIpcSender(event, options = {}) {
  const sender = event?.sender;
  if (!sender) {
    return { ok: false, error: "missing_sender" };
  }
  if (!options.allowDestroyed && typeof sender.isDestroyed === "function" && sender.isDestroyed()) {
    return { ok: false, error: "destroyed_sender" };
  }

  // Guest / offscreen webviews should not hit privileged vault APIs.
  if (typeof sender.getType === "function") {
    const type = sender.getType();
    if (type === "webview" || type === "browserView") {
      return { ok: false, error: "untrusted_sender_type" };
    }
  }

  let win = null;
  try {
    win = BrowserWindow.fromWebContents(sender);
  } catch {
    win = null;
  }
  // Hosted BrowserWindow is expected for MagiesTerminal UI surfaces. Some
  // internal callers (tests) may omit a window — allow when getURL is local.
  if (!win) {
    let url = "";
    try {
      url = typeof sender.getURL === "function" ? String(sender.getURL() || "") : "";
    } catch {
      url = "";
    }
    const local =
      !url
      || url.startsWith("file:")
      || url.startsWith("app:")
      || url.startsWith("http://localhost")
      || url.startsWith("http://127.0.0.1")
      || url === "about:blank";
    if (!local) {
      return { ok: false, error: "untrusted_sender_origin" };
    }
  }

  return { ok: true, webContents: sender, window: win };
}

/**
 * Wrap an ipcMain.handle callback so untrusted senders are rejected.
 * @template T
 * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => T | Promise<T>} handler
 * @param {{ errorResult?: (error: string) => any }} [options]
 */
function withTrustedIpcSender(handler, options = {}) {
  // Keep this wrapper synchronous so throw-based handlers still reject via
  // throw (not Promise rejection) when invoked from tests or sync IPC paths.
  return (event, ...args) => {
    const check = validateIpcSender(event);
    if (!check.ok) {
      if (typeof options.errorResult === "function") {
        return options.errorResult(check.error);
      }
      return { success: false, error: check.error };
    }
    return handler(event, ...args);
  };
}

module.exports = {
  validateIpcSender,
  withTrustedIpcSender,
};
