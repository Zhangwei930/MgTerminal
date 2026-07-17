const { clearTerminalDataSession } = require("./terminalDataBacklog.cjs");

function createPreloadApi(ctx) {
  const terminalDataBacklog = ctx.terminalDataBacklog || null;
  const displayDataListeners = ctx.displayDataListeners || new Map();
  const closedTerminalDataSessions = ctx.closedTerminalDataSessions || null;
  const markTerminalDataSessionOpen = (sessionId) => {
    if (!sessionId) return;
    closedTerminalDataSessions?.delete?.(sessionId);
  };
  const markRequestedTerminalDataSessionOpen = (options) => {
    markTerminalDataSessionOpen(options?.sessionId);
  };
  const markTerminalDataSessionClosed = (sessionId) => {
    if (!sessionId) return;
    closedTerminalDataSessions?.add?.(sessionId);
    clearTerminalDataSession({
      dataListeners: ctx.dataListeners,
      displayDataListeners,
      terminalDataBacklog,
    }, sessionId);
    ctx.terminalOutputPorts?.closeSession?.(sessionId);
  };
  const sanitizeInterruptTrace = (trace) => {
    if (!trace || typeof trace !== "object") return undefined;
    const priority = trace.rendererPriority && typeof trace.rendererPriority === "object"
      ? {
          sessionId: typeof trace.rendererPriority.sessionId === "string" ? trace.rendererPriority.sessionId : null,
          backlogBytes: Number(trace.rendererPriority.backlogBytes) || 0,
          writeQueueDepth: Number(trace.rendererPriority.writeQueueDepth) || 0,
          deferredAckBytes: Number(trace.rendererPriority.deferredAckBytes) || 0,
          ackAfterInputBytes: Number(trace.rendererPriority.ackAfterInputBytes) || 0,
          scheduledBackendResume: Boolean(trace.rendererPriority.scheduledBackendResume),
          skippedReason: typeof trace.rendererPriority.skippedReason === "string" ? trace.rendererPriority.skippedReason : undefined,
        }
      : undefined;
    return {
      debug: trace.debug === true,
      traceId: typeof trace.traceId === "string" ? trace.traceId.slice(0, 128) : undefined,
      source: typeof trace.source === "string" ? trace.source.slice(0, 80) : undefined,
      sessionId: typeof trace.sessionId === "string" ? trace.sessionId : undefined,
      rendererKeyAt: Number.isFinite(trace.rendererKeyAt) ? trace.rendererKeyAt : undefined,
      rendererSendAt: Number.isFinite(trace.rendererSendAt) ? trace.rendererSendAt : undefined,
      rendererStatus: typeof trace.rendererStatus === "string" ? trace.rendererStatus.slice(0, 40) : undefined,
      rendererHasSelection: trace.rendererHasSelection === true,
      rendererPriority: priority,
    };
  };
  with (ctx) {
    return {
  getWindowsPtyInfo: () => {
    if (process.platform !== "win32") {
      return null;
    }

    const releaseParts = os.release().split(".");
    const buildNumber = Number.parseInt(releaseParts[2] || "", 10);
    const hasBuildNumber = Number.isFinite(buildNumber);
    const backend =
      hasBuildNumber && buildNumber < 18309 ? "winpty" : "conpty";

    return hasBuildNumber ? { backend, buildNumber } : { backend };
  },
  startSSHSession: async (options) => {
    markRequestedTerminalDataSessionOpen(options);
    const result = await ipcRenderer.invoke("magiesTerminal:start", options);
    markTerminalDataSessionOpen(result?.sessionId);
    return result.sessionId;
  },
  startTelnetSession: async (options) => {
    markRequestedTerminalDataSessionOpen(options);
    const result = await ipcRenderer.invoke("magiesTerminal:telnet:start", options);
    markTerminalDataSessionOpen(result?.sessionId);
    return result.sessionId;
  },
  startMoshSession: async (options) => {
    markRequestedTerminalDataSessionOpen(options);
    const result = await ipcRenderer.invoke("magiesTerminal:mosh:start", options);
    markTerminalDataSessionOpen(result?.sessionId);
    return result.sessionId;
  },
  startEtSession: async (options) => {
    markRequestedTerminalDataSessionOpen(options);
    const result = await ipcRenderer.invoke("magiesTerminal:et:start", options);
    markTerminalDataSessionOpen(result?.sessionId);
    return result.sessionId;
  },
  startLocalSession: async (options) => {
    markRequestedTerminalDataSessionOpen(options);
    const result = await ipcRenderer.invoke("magiesTerminal:local:start", options || {});
    markTerminalDataSessionOpen(result?.sessionId);
    return result.sessionId;
  },
  startSerialSession: async (options) => {
    markRequestedTerminalDataSessionOpen(options);
    const result = await ipcRenderer.invoke("magiesTerminal:serial:start", options);
    markTerminalDataSessionOpen(result?.sessionId);
    return result.sessionId;
  },
  listSerialPorts: async () => {
    return ipcRenderer.invoke("magiesTerminal:serial:list");
  },
  sendSerialYmodem: async (sessionId, filePath) => {
    return ipcRenderer.invoke("magiesTerminal:serial:ymodem-send", { sessionId, filePath });
  },
  receiveSerialYmodem: async (sessionId, destinationDir) => {
    return ipcRenderer.invoke("magiesTerminal:serial:ymodem-receive", { sessionId, destinationDir });
  },
  getDefaultShell: async () => {
    return ipcRenderer.invoke("magiesTerminal:local:defaultShell");
  },
  discoverShells: () => ipcRenderer.invoke("magiesTerminal:shells:discover"),
  validatePath: async (path, type) => {
    return ipcRenderer.invoke("magiesTerminal:local:validatePath", { path, type });
  },
  writeToSession: (sessionId, data, options) => {
    const lineDelayMs = Number(options?.lineDelayMs);
    ipcRenderer.send("magiesTerminal:write", {
      sessionId,
      data,
      automated: Boolean(options?.automated),
      lineDelayMs: Number.isFinite(lineDelayMs) && lineDelayMs > 0 ? lineDelayMs : undefined,
      logRewrite: options?.logRewrite && typeof options.logRewrite === "object"
        ? {
            sentCommand: String(options.logRewrite.sentCommand ?? ""),
            displayCommand: String(options.logRewrite.displayCommand ?? ""),
          }
        : undefined,
    });
  },
  interruptSession: (sessionId, trace) => {
    const sanitizedTrace = sanitizeInterruptTrace(trace);
    if (ctx.terminalUrgentInputPorts?.postInterrupt?.(sessionId, sanitizedTrace)) {
      return;
    }
    ipcRenderer.send("magiesTerminal:interrupt", { sessionId, trace: sanitizedTrace });
  },
  execCommand: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:exec", options);
  },
  getSessionPwd: async (sessionId, options) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:pwd", {
      sessionId,
      allowHomeFallback: options?.allowHomeFallback,
    });
  },
  getSessionRemoteInfo: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:remoteInfo", { sessionId });
  },
  getSessionDistroInfo: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:distroInfo", { sessionId });
  },
  getServerStats: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:stats", { sessionId });
  },
  probeSystemCapabilities: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:system:probeCapabilities", { sessionId });
  },
  listSystemProcesses: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:system:listProcesses", { sessionId });
  },
  signalSystemProcess: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:signalProcess", options);
  },
  setupOsc7Tracking: async (sessionId, command) => {
    return ipcRenderer.invoke("magiesTerminal:system:setupOsc7Tracking", { sessionId, command });
  },
  listTmuxSessions: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:system:listTmuxSessions", { sessionId });
  },
  createTmuxSession: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:createTmuxSession", options);
  },
  listTmuxWindows: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:listTmuxWindows", options);
  },
  listTmuxPanes: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:listTmuxPanes", options);
  },
  listTmuxClients: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:listTmuxClients", options);
  },
  tmuxAction: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:tmuxAction", options);
  },
  listDockerContainers: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:system:listDockerContainers", { sessionId });
  },
  listDockerImages: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:system:listDockerImages", { sessionId });
  },
  getDockerStats: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:dockerStats", options);
  },
  dockerInspect: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:dockerInspect", options);
  },
  dockerImageInspect: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:dockerImageInspect", options);
  },
  dockerAction: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:dockerAction", options);
  },
  dockerImageAction: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:system:dockerImageAction", options);
  },
  openTerminalPopup: async (payload) => {
    return ipcRenderer.invoke("magiesTerminal:window:openTerminalPopup", payload);
  },
  logDiagnostic: async (payload) => {
    return ipcRenderer.invoke("magiesTerminal:diagnostics:log", payload);
  },
  onTerminalPopupConfig: (cb) => {
    terminalPopupConfigState.listeners.add(cb);
    if (terminalPopupConfigState.pending) {
      const pending = terminalPopupConfigState.pending;
      terminalPopupConfigState.pending = null;
      queueMicrotask(() => {
        try {
          cb(pending);
        } catch (err) {
          console.error("Terminal popup config callback failed", err);
        }
      });
    }
    return () => terminalPopupConfigState.listeners.delete(cb);
  },
  readRemoteHistory: async (sessionId, limit) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:readRemoteHistory", { sessionId, limit });
  },
  generateKeyPair: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:key:generate", options);
  },
  checkSshAgent: async () => {
    return ipcRenderer.invoke("magiesTerminal:ssh:check-agent");
  },
  listSshAgentIdentities: async () => {
    return ipcRenderer.invoke("magiesTerminal:ssh:list-agent-identities");
  },
  sshPkcs11Supported: async () => {
    return ipcRenderer.invoke("magiesTerminal:ssh:pkcs11-supported");
  },
  sshPkcs11Load: async (payload) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:pkcs11-load", payload);
  },
  sshPkcs11Unload: async (payload) => {
    return ipcRenderer.invoke("magiesTerminal:ssh:pkcs11-unload", payload);
  },
  onSshAuthMethodUsed: (cb) => {
    sshAuthMethodUsedListeners.add(cb);
    return () => {
      sshAuthMethodUsedListeners.delete(cb);
    };
  },
  getDefaultKeys: async () => {
    return ipcRenderer.invoke("magiesTerminal:ssh:get-default-keys");
  },
  resizeSession: (sessionId, cols, rows) => {
    ipcRenderer.send("magiesTerminal:resize", { sessionId, cols, rows });
  },
  setSessionFlowPaused: (sessionId, paused) => {
    ipcRenderer.send("magiesTerminal:flow", { sessionId, paused: Boolean(paused) });
  },
  ackSessionFlow: (sessionId, bytes) => {
    if (!sessionId || !Number.isFinite(bytes) || bytes <= 0) return;
    ipcRenderer.send("magiesTerminal:flow:ack", { sessionId, bytes });
  },
  closeSession: (sessionId) => {
    markTerminalDataSessionClosed(sessionId);
    telnetEchoModeListeners.delete(sessionId);
    ipcRenderer.send("magiesTerminal:close", { sessionId });
  },
  setSessionEncoding: async (sessionId, encoding) => {
    // Try the SSH handler first; it returns { ok: false } for non-SSH
    // sessions (no session.stream). Telnet and serial sessions fall
    // through to terminalBridge's handler.
    const ssh = await ipcRenderer.invoke("magiesTerminal:ssh:setEncoding", { sessionId, encoding });
    if (ssh?.ok) return ssh;
    return ipcRenderer.invoke("magiesTerminal:terminal:setEncoding", { sessionId, encoding });
  },
  onZmodemEvent: (sessionId, cb) => {
    if (!zmodemListeners.has(sessionId)) zmodemListeners.set(sessionId, new Set());
    zmodemListeners.get(sessionId).add(cb);
    return () => {
      const set = zmodemListeners.get(sessionId);
      if (!set) return;
      set.delete(cb);
      if (set.size === 0) zmodemListeners.delete(sessionId);
    };
  },
  cancelZmodem: (sessionId, options) => {
    ipcRenderer.send("magiesTerminal:zmodem:cancel", { sessionId, options });
  },
  startZmodemDragDropUpload: (sessionId, files, uploadCommand) => {
    return ipcRenderer.invoke("magiesTerminal:zmodem:drag-drop-upload", {
      sessionId,
      files,
      uploadCommand,
    });
  },
  onZmodemOverwriteRequest: (sessionId, cb) => {
    if (!zmodemOverwriteListeners.has(sessionId)) zmodemOverwriteListeners.set(sessionId, new Set());
    zmodemOverwriteListeners.get(sessionId).add(cb);
    return () => {
      const set = zmodemOverwriteListeners.get(sessionId);
      if (!set) return;
      set.delete(cb);
      if (set.size === 0) zmodemOverwriteListeners.delete(sessionId);
    };
  },
  respondZmodemOverwrite: (payload) => {
    ipcRenderer.send("magiesTerminal:zmodem:overwrite-response", payload);
  },
  onSessionData: (sessionId, cb, options) => {
    const replayBacklog = options?.replayBacklog === true;
    if (!dataListeners.has(sessionId)) dataListeners.set(sessionId, new Set());
    dataListeners.get(sessionId).add(cb);
    if (replayBacklog) {
      if (!displayDataListeners.has(sessionId)) displayDataListeners.set(sessionId, new Set());
      displayDataListeners.get(sessionId).add(cb);
      const pendingEntry = terminalDataBacklog?.takeEntry?.(sessionId)
        ?? { data: terminalDataBacklog?.take?.(sessionId) || "", meta: undefined };
      if (pendingEntry.data) {
        try {
          cb(pendingEntry.data, pendingEntry.meta);
        } catch (err) {
          console.error("Data callback failed", err);
        }
      }
    }
    return () => {
      const dataSet = dataListeners.get(sessionId);
      dataSet?.delete(cb);
      if (dataSet?.size === 0) dataListeners.delete(sessionId);

      if (!replayBacklog) return;
      const displaySet = displayDataListeners.get(sessionId);
      displaySet?.delete(cb);
      if (displaySet?.size === 0) displayDataListeners.delete(sessionId);
    };
  },
  onSessionExit: (sessionId, cb) => {
    if (!exitListeners.has(sessionId)) exitListeners.set(sessionId, new Set());
    exitListeners.get(sessionId).add(cb);
    return () => {
      const set = exitListeners.get(sessionId);
      set?.delete(cb);
      if (set?.size === 0) exitListeners.delete(sessionId);
    };
  },
  onTelnetAutoLoginComplete: (sessionId, cb) => {
    if (!telnetAutoLoginCompleteListeners.has(sessionId)) {
      telnetAutoLoginCompleteListeners.set(sessionId, new Set());
    }
    telnetAutoLoginCompleteListeners.get(sessionId).add(cb);
    return () => telnetAutoLoginCompleteListeners.get(sessionId)?.delete(cb);
  },
  onTelnetAutoLoginCancelled: (sessionId, cb) => {
    if (!telnetAutoLoginCancelledListeners.has(sessionId)) {
      telnetAutoLoginCancelledListeners.set(sessionId, new Set());
    }
    telnetAutoLoginCancelledListeners.get(sessionId).add(cb);
    return () => telnetAutoLoginCancelledListeners.get(sessionId)?.delete(cb);
  },
  onTelnetEchoMode: (sessionId, cb) => {
    if (!telnetEchoModeListeners.has(sessionId)) {
      telnetEchoModeListeners.set(sessionId, new Set());
    }
    telnetEchoModeListeners.get(sessionId).add(cb);
    return () => telnetEchoModeListeners.get(sessionId)?.delete(cb);
  },
  onAuthFailed: (sessionId, cb) => {
    if (!authFailedListeners.has(sessionId)) authFailedListeners.set(sessionId, new Set());
    authFailedListeners.get(sessionId).add(cb);
    return () => authFailedListeners.get(sessionId)?.delete(cb);
  },
  // Keyboard-interactive authentication (2FA/MFA)
  onKeyboardInteractive: (cb) => {
    keyboardInteractiveListeners.add(cb);
    return () => keyboardInteractiveListeners.delete(cb);
  },
  respondKeyboardInteractive: async (requestId, responses, cancelled = false) => {
    return ipcRenderer.invoke("magiesTerminal:keyboard-interactive:respond", {
      requestId,
      responses,
      cancelled,
    });
  },
  onHostKeyVerification: (cb) => {
    hostKeyVerificationListeners.add(cb);
    return () => hostKeyVerificationListeners.delete(cb);
  },
  respondHostKeyVerification: async (requestId, accept, addToKnownHosts = false) => {
    return ipcRenderer.invoke("magiesTerminal:host-key:respond", {
      requestId,
      accept,
      addToKnownHosts,
    });
  },
  // Passphrase request for encrypted SSH keys
  onPassphraseRequest: (cb) => {
    passphraseListeners.add(cb);
    return () => passphraseListeners.delete(cb);
  },
  respondPassphrase: async (requestId, passphrase, cancelled = false) => {
    return ipcRenderer.invoke("magiesTerminal:passphrase:respond", {
      requestId,
      passphrase,
      cancelled,
    });
  },
  respondPassphraseSkip: async (requestId) => {
    return ipcRenderer.invoke("magiesTerminal:passphrase:respond", {
      requestId,
      passphrase: '',
      skipped: true,
    });
  },
  onPassphraseTimeout: (cb) => {
    passphraseTimeoutListeners.add(cb);
    return () => passphraseTimeoutListeners.delete(cb);
  },
  onPassphraseCancelled: (cb) => {
    passphraseCancelledListeners.add(cb);
    return () => passphraseCancelledListeners.delete(cb);
  },
  onPassphraseAuthFailed: (cb) => {
    passphraseAuthFailedListeners.add(cb);
    return () => passphraseAuthFailedListeners.delete(cb);
  },
  openSftp: async (options) => {
      const result = await ipcRenderer.invoke("magiesTerminal:sftp:open", options);
      return result.sftpId;
    },
  openSftpForSession: async (sessionId) => {
    const result = await ipcRenderer.invoke("magiesTerminal:sftp:openForSession", { sessionId });
    return result.sftpId;
  },
  listSftp: async (sftpId, path, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:list", { sftpId, path, encoding });
  },
  readSftp: async (sftpId, path, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:read", { sftpId, path, encoding });
  },
  readSftpBinary: async (sftpId, path, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:readBinary", { sftpId, path, encoding });
  },
  writeSftp: async (sftpId, path, content, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:write", { sftpId, path, content, encoding });
  },
  writeSftpBinary: async (sftpId, path, content, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:writeBinary", { sftpId, path, content, encoding });
  },
  closeSftp: async (sftpId) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:close", { sftpId });
  },
  mkdirSftp: async (sftpId, path, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:mkdir", { sftpId, path, encoding });
  },
  deleteSftp: async (sftpId, path, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:delete", { sftpId, path, encoding });
  },
  renameSftp: async (sftpId, oldPath, newPath, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:rename", { sftpId, oldPath, newPath, encoding });
  },
  statSftp: async (sftpId, path, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:stat", { sftpId, path, encoding });
  },
  chmodSftp: async (sftpId, path, mode, encoding) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:chmod", { sftpId, path, mode, encoding });
  },
  getSftpHomeDir: async (sftpId) => {
    return ipcRenderer.invoke("magiesTerminal:sftp:homeDir", { sftpId });
  },
  // Write binary with real-time progress callback
  writeSftpBinaryWithProgress: async (sftpId, path, content, transferId, encoding, onProgress, onComplete, onError) => {
    // Register callbacks
    if (onProgress) uploadProgressListeners.set(transferId, onProgress);
    if (onComplete) uploadCompleteListeners.set(transferId, onComplete);
    if (onError) uploadErrorListeners.set(transferId, onError);
    
    return ipcRenderer.invoke("magiesTerminal:sftp:writeBinaryWithProgress", {
      sftpId, 
      path, 
      content, 
      transferId,
      encoding,
    });
  },
  // Cancel an in-progress SFTP upload
  cancelSftpUpload: async (transferId) => {
    // Cleanup listeners
    uploadProgressListeners.delete(transferId);
    uploadCompleteListeners.delete(transferId);
    uploadErrorListeners.delete(transferId);
    return ipcRenderer.invoke("magiesTerminal:sftp:cancelUpload", { transferId });
  },
  // Local filesystem operations
  listLocalDir: async (path) => {
    return ipcRenderer.invoke("magiesTerminal:local:list", { path });
  },
  readLocalFile: async (path, options) => {
    return ipcRenderer.invoke("magiesTerminal:local:read", {
      path,
      maxBytes: options?.maxBytes,
    });
  },
  writeLocalFile: async (path, content) => {
    return ipcRenderer.invoke("magiesTerminal:local:write", { path, content });
  },
  deleteLocalFile: async (path) => {
    return ipcRenderer.invoke("magiesTerminal:local:delete", { path });
  },
  renameLocalFile: async (oldPath, newPath) => {
    return ipcRenderer.invoke("magiesTerminal:local:rename", { oldPath, newPath });
  },
  mkdirLocal: async (path) => {
    return ipcRenderer.invoke("magiesTerminal:local:mkdir", { path });
  },
  statLocal: async (path) => {
    return ipcRenderer.invoke("magiesTerminal:local:stat", { path });
  },
  listLocalTree: async (path) => {
    return ipcRenderer.invoke("magiesTerminal:local:tree", { path });
  },
  getHomeDir: async () => {
    return ipcRenderer.invoke("magiesTerminal:local:homedir");
  },
  listDrives: async () => {
    return ipcRenderer.invoke("magiesTerminal:local:drives");
  },
  getSystemInfo: async () => {
    return ipcRenderer.invoke("magiesTerminal:system:info");
  },
  // Read system known_hosts file
  readKnownHosts: async () => {
    return ipcRenderer.invoke("magiesTerminal:known-hosts:read");
  },
  setTheme: async (theme) => {
    return ipcRenderer.invoke("magiesTerminal:setTheme", theme);
  },
  setBackgroundColor: async (color) => {
    return ipcRenderer.invoke("magiesTerminal:setBackgroundColor", color);
  },
  setWindowOpacity: async (opacity) => {
    return ipcRenderer.invoke("magiesTerminal:setWindowOpacity", opacity);
  },
  setAppIconVariant: async (variant) => {
    return ipcRenderer.invoke("magiesTerminal:setAppIconVariant", variant);
  },
  setLanguage: async (language) => {
    return ipcRenderer.invoke("magiesTerminal:setLanguage", language);
  },
  onLanguageChanged: (cb) => {
    languageChangeListeners.add(cb);
    return () => languageChangeListeners.delete(cb);
  },
  // Streaming transfer with real progress
  startStreamTransfer: async (options, onProgress, onComplete, onError) => {
    const { transferId } = options;
    // Register callbacks
    if (onProgress) transferProgressListeners.set(transferId, onProgress);
    if (onComplete) transferCompleteListeners.set(transferId, onComplete);
    if (onError) transferErrorListeners.set(transferId, onError);
    
    return ipcRenderer.invoke("magiesTerminal:transfer:start", options);
  },
  cancelTransfer: async (transferId) => {
    cleanupTransferListeners(transferId);
    return ipcRenderer.invoke("magiesTerminal:transfer:cancel", { transferId });
  },
  sameHostCopyDirectory: async (sftpId, sourcePath, targetPath, encoding, transferId) => {
    return ipcRenderer.invoke("magiesTerminal:transfer:same-host-copy-dir", { sftpId, sourcePath, targetPath, encoding, transferId });
  },
  // Compressed folder upload
  startCompressedUpload: async (options, onProgress, onComplete, onError) => {
    const { compressionId } = options;
    // Register callbacks
    if (onProgress) compressProgressListeners.set(compressionId, onProgress);
    if (onComplete) compressCompleteListeners.set(compressionId, onComplete);
    if (onError) compressErrorListeners.set(compressionId, onError);
    
    return ipcRenderer.invoke("magiesTerminal:compress:start", options);
  },
  cancelCompressedUpload: async (compressionId) => {
    // Cleanup listeners
    compressProgressListeners.delete(compressionId);
    compressCompleteListeners.delete(compressionId);
    compressErrorListeners.delete(compressionId);
    return ipcRenderer.invoke("magiesTerminal:compress:cancel", { compressionId });
  },
  checkCompressedUploadSupport: async (sftpId) => {
    return ipcRenderer.invoke("magiesTerminal:compress:checkSupport", { sftpId });
  },
  // Window controls for custom title bar
  windowMinimize: () => ipcRenderer.invoke("magiesTerminal:window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("magiesTerminal:window:maximize"),
  windowClose: () => ipcRenderer.invoke("magiesTerminal:window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("magiesTerminal:window:isMaximized"),
  windowIsFullscreen: () => ipcRenderer.invoke("magiesTerminal:window:isFullscreen"),
  windowFocus: () => ipcRenderer.invoke("magiesTerminal:window:focus"),
  setWindowTitle: (title) => ipcRenderer.invoke("magiesTerminal:window:setTitle", title),
  openSessionInNewWindow: (payload) => ipcRenderer.invoke("magiesTerminal:window:openSession", payload),
  onOpenSessionInNewWindow: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:window:openSession", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:window:openSession", handler);
  },
  // Local follow mode (multiplayer foundation)
  followStart: (payload) => ipcRenderer.invoke("magiesTerminal:follow:start", payload),
  followStop: (payload) => ipcRenderer.invoke("magiesTerminal:follow:stop", payload),
  followJoin: (payload) => ipcRenderer.invoke("magiesTerminal:follow:join", payload),
  followLeave: (payload) => ipcRenderer.invoke("magiesTerminal:follow:leave", payload),
  followRequestControl: (payload) => ipcRenderer.invoke("magiesTerminal:follow:requestControl", payload),
  followGrantControl: (payload) => ipcRenderer.invoke("magiesTerminal:follow:grantControl", payload),
  followRevokeControl: (payload) => ipcRenderer.invoke("magiesTerminal:follow:revokeControl", payload),
  followGetState: (payload) => ipcRenderer.invoke("magiesTerminal:follow:getState", payload),
  followGetAudit: (payload) => ipcRenderer.invoke("magiesTerminal:follow:getAudit", payload),
  openFollowSessionWindow: (payload) => ipcRenderer.invoke("magiesTerminal:window:openFollowSession", payload),
  onFollowSessionOpen: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:window:openFollowSession", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:window:openFollowSession", handler);
  },
  onFollowState: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:follow:state", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:follow:state", handler);
  },
  onFollowInputDenied: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:follow:inputDenied", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:follow:inputDenied", handler);
  },
  onWindowCommandCloseRequested: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("magiesTerminal:window:command-close", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:window:command-close", handler);
  },
  onWindowFullScreenChanged: (cb) => {
    fullscreenChangeListeners.add(cb);
    return () => fullscreenChangeListeners.delete(cb);
  },
  onWindowShown: (cb) => {
    windowShownListeners.add(cb);
    return () => windowShownListeners.delete(cb);
  },
  onWindowFocusRequested: (cb) => {
    windowFocusRequestedListeners.add(cb);
    return () => windowFocusRequestedListeners.delete(cb);
  },
  onWindowWillHide: (cb) => {
    windowWillHideListeners.add(cb);
    return () => windowWillHideListeners.delete(cb);
  },
  
  // Settings window
  openSettingsWindow: () => ipcRenderer.invoke("magiesTerminal:settings:open"),
  closeSettingsWindow: () => ipcRenderer.invoke("magiesTerminal:settings:close"),

  // Cross-window settings sync
  notifySettingsChanged: (payload) => ipcRenderer.send("magiesTerminal:settings:changed", payload),
  onSettingsChanged: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("magiesTerminal:settings:changed", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:settings:changed", handler);
  },
  getSshDebugLogInfo: () => ipcRenderer.invoke("magiesTerminal:sshDebugLog:info"),
  openSshDebugLogDir: () => ipcRenderer.invoke("magiesTerminal:sshDebugLog:openDir"),

  // Cloud sync session (in-memory only, shared across windows)
  cloudSyncSetSessionPassword: (password) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:session:setPassword", password),
  cloudSyncGetSessionPassword: () =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:session:getPassword"),
  cloudSyncClearSessionPassword: () =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:session:clearPassword"),

  // Cloud sync network operations (proxied via main process)
  cloudSyncWebdavInitialize: (config) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:webdav:initialize", { config }),
  cloudSyncWebdavUpload: (config, syncedFile) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:webdav:upload", { config, syncedFile }),
  cloudSyncWebdavDownload: (config) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:webdav:download", { config }),
  cloudSyncWebdavDelete: (config) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:webdav:delete", { config }),

  cloudSyncS3Initialize: (config) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:s3:initialize", { config }),
  cloudSyncS3Upload: (config, syncedFile) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:s3:upload", { config, syncedFile }),
  cloudSyncS3Download: (config) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:s3:download", { config }),
  cloudSyncS3Delete: (config) =>
    ipcRenderer.invoke("magiesTerminal:cloudSync:s3:delete", { config }),
  
  // Open URL in default browser
  openExternal: (url) => ipcRenderer.invoke("magiesTerminal:openExternal", url),
  openPath: (path) => ipcRenderer.invoke("magiesTerminal:openPath", path),

  // App info
  getAppInfo: () => ipcRenderer.invoke("magiesTerminal:app:getInfo"),
  ptyGetChildProcesses: (sessionId) =>
    ipcRenderer.invoke("magiesTerminal:pty:childProcesses", sessionId),
  confirmCloseBusy: (payload) =>
    ipcRenderer.invoke("magiesTerminal:dialog:confirmCloseBusy", payload),
  getVaultBackupCapabilities: () =>
    ipcRenderer.invoke("magiesTerminal:vaultBackups:capabilities"),
  createVaultBackup: (payload) =>
    ipcRenderer.invoke("magiesTerminal:vaultBackups:create", payload),
  listVaultBackups: () =>
    ipcRenderer.invoke("magiesTerminal:vaultBackups:list"),
  readVaultBackup: (payload) =>
    ipcRenderer.invoke("magiesTerminal:vaultBackups:read", payload),
  trimVaultBackups: (payload) =>
    ipcRenderer.invoke("magiesTerminal:vaultBackups:trim", payload),
  openVaultBackupDir: () =>
    ipcRenderer.invoke("magiesTerminal:vaultBackups:openDir"),
  // Subscribe to cross-window "backups changed" events emitted by the
  // main process whenever a create/trim actually mutated the on-disk
  // set. Returns an unsubscribe function so React-style consumers can
  // release the listener on unmount without leaking IPC handlers.
  onVaultBackupsChanged: (handler) => {
    if (typeof handler !== "function") return () => {};
    const listener = () => {
      try { handler(); } catch (error) {
        console.warn("[preload] onVaultBackupsChanged handler threw:", error);
      }
    };
    ipcRenderer.on("magiesTerminal:vaultBackups:changed", listener);
    return () => {
      try { ipcRenderer.removeListener("magiesTerminal:vaultBackups:changed", listener); }
      catch { /* ignore */ }
    };
  },

  // Tell main process the renderer has mounted/painted (used to avoid initial blank screen).
  rendererReady: () => ipcRenderer.send("magiesTerminal:renderer:ready"),

  onSshDeepLink: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("magiesTerminal:deepLink:ssh", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:deepLink:ssh", handler);
  },
  onTelnetDeepLink: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("magiesTerminal:deepLink:telnet", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:deepLink:telnet", handler);
  },
  onOpenTerminalPath: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("magiesTerminal:openTerminalPath", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:openTerminalPath", handler);
  },
  setSshDeepLinkEnabled: (enabled) =>
    ipcRenderer.invoke("magiesTerminal:deepLink:ssh:setEnabled", { enabled }),
  getSshDeepLinkEnabled: () =>
    ipcRenderer.invoke("magiesTerminal:deepLink:ssh:getEnabled"),

  onJmsDeepLink: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("magiesTerminal:deepLink:jms", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:deepLink:jms", handler);
  },
  setJmsDeepLinkEnabled: (enabled) =>
    ipcRenderer.invoke("magiesTerminal:deepLink:jms:setEnabled", { enabled }),
  getJmsDeepLinkEnabled: () =>
    ipcRenderer.invoke("magiesTerminal:deepLink:jms:getEnabled"),

  // Quit guard: main process asks whether any editor tabs have unsaved changes.
  // Returns an unsubscribe function so React effects can clean up on unmount.
  onCheckDirtyEditors: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("app:query-dirty-editors", handler);
    return () => ipcRenderer.removeListener("app:query-dirty-editors", handler);
  },
  // Renderer reports the dirty-check result back to the main process.
  reportDirtyEditorsResult: (hasDirty) => ipcRenderer.send("app:dirty-editors-result", { hasDirty }),
  
  // Port Forwarding API
  startPortForward: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:portforward:start", options);
  },
  stopPortForward: async (tunnelId) => {
    return ipcRenderer.invoke("magiesTerminal:portforward:stop", { tunnelId });
  },
  getPortForwardStatus: async (tunnelId) => {
    return ipcRenderer.invoke("magiesTerminal:portforward:status", { tunnelId });
  },
  listPortForwards: async () => {
    return ipcRenderer.invoke("magiesTerminal:portforward:list");
  },
  listPortForwardChannels: async () => {
    return ipcRenderer.invoke("magiesTerminal:portforward:listChannels");
  },
  stopAllPortForwards: async () => {
    return ipcRenderer.invoke("magiesTerminal:portforward:stopAll");
  },
  stopPortForwardByRuleId: async (ruleId) => {
    return ipcRenderer.invoke("magiesTerminal:portforward:stopByRuleId", { ruleId });
  },
  onPortForwardChannels: (cb) => {
    const handler = (_event, payload) => {
      try {
        cb(payload);
      } catch (err) {
        console.warn("[preload] onPortForwardChannels callback failed:", err);
      }
    };
    ipcRenderer.on("magiesTerminal:portforward:channels", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:portforward:channels", handler);
  },
  onPortForwardStatus: (tunnelId, cb) => {
    if (!portForwardStatusListeners.has(tunnelId)) {
      portForwardStatusListeners.set(tunnelId, new Set());
    }
    portForwardStatusListeners.get(tunnelId).add(cb);
    return () => {
      portForwardStatusListeners.get(tunnelId)?.delete(cb);
      if (portForwardStatusListeners.get(tunnelId)?.size === 0) {
        portForwardStatusListeners.delete(tunnelId);
      }
    };
  },
  // Chain progress listener for jump host connections
  onChainProgress: (cb) => {
    const id = randomUUID();
    chainProgressListeners.set(id, cb);
    return () => {
      chainProgressListeners.delete(id);
    };
  },
  onConnectionReuseFallback: (cb) => {
    connectionReuseFallbackListeners.add(cb);
    return () => {
      connectionReuseFallbackListeners.delete(cb);
    };
  },
  // SFTP connection progress listener (auth method logs)
  onSftpConnectionProgress: (cb) => {
    sftpConnectionProgressListeners.add(cb);
    return () => {
      sftpConnectionProgressListeners.delete(cb);
    };
  },
  // Host health snapshot (batch check across saved hosts)
  runHostHealthCheck: async (payload) => {
    return ipcRenderer.invoke("magiesTerminal:health:check", payload);
  },
  cancelHostHealthCheck: async (runId) => {
    return ipcRenderer.invoke("magiesTerminal:health:cancel", { runId });
  },
  onHostHealthProgress: (cb) => {
    hostHealthProgressListeners.add(cb);
    return () => {
      hostHealthProgressListeners.delete(cb);
    };
  },
  // Connection diagnostics ("Test Connection")
  runConnectionDiagnostics: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:diagnostics:run", options);
  },
  cancelConnectionDiagnostics: async (runId) => {
    return ipcRenderer.invoke("magiesTerminal:diagnostics:cancel", { runId });
  },
  onConnectionDiagnosticsProgress: (cb) => {
    connectionDiagnosticsProgressListeners.add(cb);
    return () => {
      connectionDiagnosticsProgressListeners.delete(cb);
    };
  },

  // OAuth callback server — two-step so the renderer can learn the bound
  // port (which may differ from the preferred 45678 if it was in use) and
  // embed it into the provider's redirect_uri before opening the browser.
  prepareOAuthCallback: () => ipcRenderer.invoke("oauth:prepareCallback"),
  awaitOAuthCallback: (expectedState, sessionId) =>
    ipcRenderer.invoke("oauth:awaitCallback", expectedState, sessionId),
  cancelOAuthCallback: (sessionId) => ipcRenderer.invoke("oauth:cancelCallback", sessionId),

  // GitHub Device Flow (proxied via main process to avoid CORS)
  githubStartDeviceFlow: (options) => ipcRenderer.invoke("magiesTerminal:github:deviceFlow:start", options),
  githubPollDeviceFlowToken: (options) => ipcRenderer.invoke("magiesTerminal:github:deviceFlow:poll", options),
  githubCancelDeviceFlowPoll: (pollId) => ipcRenderer.invoke("magiesTerminal:github:deviceFlow:cancelPoll", pollId),

  // Google OAuth (proxied via main process to avoid CORS)
  googleExchangeCodeForTokens: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:oauth:exchange", options),
  googleRefreshAccessToken: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:oauth:refresh", options),
  googleGetUserInfo: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:oauth:userinfo", options),

  // Google Drive API (proxied via main process to avoid CORS/COEP issues in renderer)
  googleDriveFindSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:drive:findSyncFile", options),
  googleDriveCreateSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:drive:createSyncFile", options),
  googleDriveUpdateSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:drive:updateSyncFile", options),
  googleDriveDownloadSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:drive:downloadSyncFile", options),
  googleDriveDeleteSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:google:drive:deleteSyncFile", options),

  // OneDrive OAuth + Graph (proxied via main process to avoid CORS)
  onedriveExchangeCodeForTokens: (options) =>
    ipcRenderer.invoke("magiesTerminal:onedrive:oauth:exchange", options),
  onedriveRefreshAccessToken: (options) =>
    ipcRenderer.invoke("magiesTerminal:onedrive:oauth:refresh", options),
  onedriveGetUserInfo: (options) =>
    ipcRenderer.invoke("magiesTerminal:onedrive:oauth:userinfo", options),
  onedriveFindSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:onedrive:drive:findSyncFile", options),
  onedriveUploadSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:onedrive:drive:uploadSyncFile", options),
  onedriveDownloadSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:onedrive:drive:downloadSyncFile", options),
  onedriveDeleteSyncFile: (options) =>
    ipcRenderer.invoke("magiesTerminal:onedrive:drive:deleteSyncFile", options),

  // File opener helpers (for "Open With" feature)
  selectApplication: () =>
    ipcRenderer.invoke("magiesTerminal:selectApplication"),
  openWithApplication: (filePath, appPath) =>
    ipcRenderer.invoke("magiesTerminal:openWithApplication", { filePath, appPath }),
  openWithSystemDefault: (filePath) =>
    ipcRenderer.invoke("magiesTerminal:openWithSystemDefault", { filePath }),
  downloadSftpToTemp: (sftpId, remotePath, fileName, encoding) =>
    ipcRenderer.invoke("magiesTerminal:sftp:downloadToTemp", { sftpId, remotePath, fileName, encoding }),
  downloadSftpToTempWithProgress: (sftpId, remotePath, fileName, encoding, transferId, onProgress, onComplete, onError, onCancelled) => {
    if (onProgress) transferProgressListeners.set(transferId, onProgress);
    if (onComplete) transferCompleteListeners.set(transferId, onComplete);
    if (onError) transferErrorListeners.set(transferId, onError);
    if (onCancelled) transferCancelledListeners.set(transferId, onCancelled);
    return ipcRenderer
      .invoke("magiesTerminal:sftp:downloadToTempWithProgress", { sftpId, remotePath, fileName, encoding, transferId })
      .catch((err) => {
        cleanupTransferListeners(transferId);
        throw err;
      });
  },

  // Save dialog for file downloads
  showSaveDialog: (defaultPath, filters) =>
    ipcRenderer.invoke("magiesTerminal:showSaveDialog", { defaultPath, filters }),
  selectDirectory: (title, defaultPath) =>
    ipcRenderer.invoke("magiesTerminal:selectDirectory", { title, defaultPath }),
  selectFile: (title, defaultPath, filters) =>
    ipcRenderer.invoke("magiesTerminal:selectFile", { title, defaultPath, filters }),

  // File watcher for auto-sync feature
  startFileWatch: (localPath, remotePath, sftpId, encoding) =>
    ipcRenderer.invoke("magiesTerminal:filewatch:start", { localPath, remotePath, sftpId, encoding }),
  stopFileWatch: (watchId, cleanupTempFile = false) =>
    ipcRenderer.invoke("magiesTerminal:filewatch:stop", { watchId, cleanupTempFile }),
  listFileWatches: () =>
    ipcRenderer.invoke("magiesTerminal:filewatch:list"),
  registerTempFile: (sftpId, localPath) =>
    ipcRenderer.invoke("magiesTerminal:filewatch:registerTempFile", { sftpId, localPath }),
  onFileWatchSynced: (cb) => {
    fileWatchSyncedListeners.add(cb);
    return () => fileWatchSyncedListeners.delete(cb);
  },
  onFileWatchError: (cb) => {
    fileWatchErrorListeners.add(cb);
    return () => fileWatchErrorListeners.delete(cb);
  },
  
  // Temp file cleanup
  deleteTempFile: (filePath) =>
    ipcRenderer.invoke("magiesTerminal:deleteTempFile", { filePath }),
  
  // Temp directory management
  getTempDirInfo: () =>
    ipcRenderer.invoke("magiesTerminal:tempdir:getInfo"),
  clearTempDir: () =>
    ipcRenderer.invoke("magiesTerminal:tempdir:clear"),
  getTempDirPath: () =>
    ipcRenderer.invoke("magiesTerminal:tempdir:getPath"),
  openTempDir: () =>
    ipcRenderer.invoke("magiesTerminal:tempdir:open"),

  // Session Logs
  exportSessionLog: (payload) =>
    ipcRenderer.invoke("magiesTerminal:sessionLogs:export", payload),
  selectSessionLogsDir: () =>
    ipcRenderer.invoke("magiesTerminal:sessionLogs:selectDir"),
  autoSaveSessionLog: (payload) =>
    ipcRenderer.invoke("magiesTerminal:sessionLogs:autoSave", payload),
  openSessionLogsDir: (directory) =>
    ipcRenderer.invoke("magiesTerminal:sessionLogs:openDir", { directory }),
  startManualSessionLog: (payload) =>
    ipcRenderer.invoke("magiesTerminal:sessionLog:manualStart", payload),
  stopManualSessionLog: (payload) =>
    ipcRenderer.invoke("magiesTerminal:sessionLog:manualStop", payload),
  getManualSessionLogStatus: (payload) =>
    ipcRenderer.invoke("magiesTerminal:sessionLog:manualStatus", payload),

  // Crash Logs
  getCrashLogs: () =>
    ipcRenderer.invoke("magiesTerminal:crashLogs:list"),
  readCrashLog: (fileName) =>
    ipcRenderer.invoke("magiesTerminal:crashLogs:read", { fileName }),
  clearCrashLogs: () =>
    ipcRenderer.invoke("magiesTerminal:crashLogs:clear"),
  openCrashLogsDir: () =>
    ipcRenderer.invoke("magiesTerminal:crashLogs:openDir"),

  // Global Toggle Hotkey (Quake Mode)
  registerGlobalHotkey: (hotkey) =>
    ipcRenderer.invoke("magiesTerminal:globalHotkey:register", { hotkey }),
  unregisterGlobalHotkey: () =>
    ipcRenderer.invoke("magiesTerminal:globalHotkey:unregister"),
  getGlobalHotkeyStatus: () =>
    ipcRenderer.invoke("magiesTerminal:globalHotkey:status"),

  // System Tray / Close to Tray
  setCloseToTray: (enabled) =>
    ipcRenderer.invoke("magiesTerminal:tray:setCloseToTray", { enabled }),
  isCloseToTray: () =>
    ipcRenderer.invoke("magiesTerminal:tray:isCloseToTray"),

  // App-level HTTP(S) network proxy (cloud sync / AI providers)
  setHttpNetworkProxy: (settings) =>
    ipcRenderer.invoke("magiesTerminal:networkProxy:set", settings),
  getHttpNetworkProxy: () =>
    ipcRenderer.invoke("magiesTerminal:networkProxy:get"),
  updateTrayMenuData: (data) =>
    ipcRenderer.invoke("magiesTerminal:tray:updateMenuData", data),
  // Listen for tray menu actions
  onTrayFocusSession: (callback) => {
    const handler = (_event, sessionId) => callback(sessionId);
    ipcRenderer.on("magiesTerminal:tray:focusSession", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:tray:focusSession", handler);
  },
  onTrayTogglePortForward: (callback) => {
    const handler = (_event, ruleId, start) => callback(ruleId, start);
    ipcRenderer.on("magiesTerminal:tray:togglePortForward", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:tray:togglePortForward", handler);
  },

  // Tray panel actions forwarded to main window
  onTrayPanelJumpToSession: (callback) => {
    const handler = (_event, sessionId) => callback(sessionId);
    ipcRenderer.on("magiesTerminal:trayPanel:jumpToSession", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:trayPanel:jumpToSession", handler);
  },
  onTrayPanelConnectToHost: (callback) => {
    const handler = (_event, hostId) => callback(hostId);
    ipcRenderer.on("magiesTerminal:trayPanel:connectToHost", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:trayPanel:connectToHost", handler);
  },

  // Tray panel window
  hideTrayPanel: () => ipcRenderer.invoke("magiesTerminal:trayPanel:hide"),
  openMainWindow: () => ipcRenderer.invoke("magiesTerminal:trayPanel:openMainWindow"),
  quitApp: () => ipcRenderer.invoke("magiesTerminal:trayPanel:quitApp"),
  jumpToSessionFromTrayPanel: (sessionId) =>
    ipcRenderer.invoke("magiesTerminal:trayPanel:jumpToSession", sessionId),
  connectToHostFromTrayPanel: (hostId) =>
    ipcRenderer.invoke("magiesTerminal:trayPanel:connectToHost", hostId),
  onTrayPanelCloseRequest: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("magiesTerminal:trayPanel:closeRequest", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:trayPanel:closeRequest", handler);
  },

  onTrayPanelRefresh: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("magiesTerminal:trayPanel:refresh", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:trayPanel:refresh", handler);
  },

  onTrayPanelMenuData: (callback) => {
    // Replay buffered data so late subscribers (e.g. after React lazy-mount) don't miss
    // the initial payload that was sent before the useEffect listener was registered.
    if (_lastTrayMenuData) {
      queueMicrotask(() => callback(_lastTrayMenuData));
    }
    const handler = (_event, data) => {
      _lastTrayMenuData = data;
      callback(data);
    };
    ipcRenderer.on("magiesTerminal:trayPanel:setMenuData", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:trayPanel:setMenuData", handler);
  },

  // Get file path from File object (for drag-and-drop)
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return undefined;
    }
  },

  // Clipboard fallback helpers
  readClipboardText: async () => {
    return ipcRenderer.invoke("magiesTerminal:clipboard:readText");
  },
  writeClipboardText: async (text) => {
    return ipcRenderer.invoke("magiesTerminal:clipboard:writeText", text);
  },
  readClipboardFiles: async () => {
    return ipcRenderer.invoke("magiesTerminal:clipboard:readFiles");
  },
  readClipboardImage: async () => {
    return ipcRenderer.invoke("magiesTerminal:clipboard:readImage");
  },

  // Platform user-presence auth (Touch ID) for opt-in vault unlock
  platformAuthStatus: () => ipcRenderer.invoke("magiesTerminal:platformAuth:status"),
  platformAuthPrompt: (payload) => ipcRenderer.invoke("magiesTerminal:platformAuth:prompt", payload),

  // Credential encryption (safeStorage + local vault fallback)
  credentialsAvailable: () => ipcRenderer.invoke("magiesTerminal:credentials:available"),
  credentialsStatus: () => ipcRenderer.invoke("magiesTerminal:credentials:status"),
  credentialsEncrypt: (plaintext) => ipcRenderer.invoke("magiesTerminal:credentials:encrypt", plaintext),
  credentialsDecrypt: (value) => ipcRenderer.invoke("magiesTerminal:credentials:decrypt", value),
  /** macOS: reset stale Safe Storage keychain items after app re-sign / denied ACL. */
  credentialsRepair: () => ipcRenderer.invoke("magiesTerminal:credentials:repair"),

  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke("magiesTerminal:update:check"),
  downloadUpdate: () => ipcRenderer.invoke("magiesTerminal:update:download"),
  installUpdate: () => ipcRenderer.invoke("magiesTerminal:update:install"),
  getUpdateStatus: () => ipcRenderer.invoke("magiesTerminal:update:getStatus"),
  setAutoUpdate: (enabled) => ipcRenderer.invoke("magiesTerminal:update:setAutoUpdate", { enabled }),
  getAutoUpdate: () => ipcRenderer.invoke("magiesTerminal:update:getAutoUpdate"),
  onUpdateAvailable: (cb) => {
    updateAvailableListeners.add(cb);
    return () => updateAvailableListeners.delete(cb);
  },
  onUpdateNotAvailable: (cb) => {
    updateNotAvailableListeners.add(cb);
    return () => updateNotAvailableListeners.delete(cb);
  },
  onUpdateDownloadProgress: (cb) => {
    updateDownloadProgressListeners.add(cb);
    return () => updateDownloadProgressListeners.delete(cb);
  },
  onUpdateDownloaded: (cb) => {
    updateDownloadedListeners.add(cb);
    return () => updateDownloadedListeners.delete(cb);
  },
  onUpdateError: (cb) => {
    updateErrorListeners.add(cb);
    return () => updateErrorListeners.delete(cb);
  },
  onUpdateNeedsSave: (cb) => {
    updateNeedsSaveListeners.add(cb);
    return () => updateNeedsSaveListeners.delete(cb);
  },

  // ── AI Bridge ──
  aiSyncProviders: async (providers) => {
    return ipcRenderer.invoke("magiesTerminal:ai:sync-providers", { providers });
  },
  aiSyncWebSearch: async (apiHost, apiKey) => {
    return ipcRenderer.invoke("magiesTerminal:ai:sync-web-search", { apiHost, apiKey });
  },
  aiChatStream: async (requestId, url, headers, body, providerId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:chat:stream", { requestId, url, headers, body, providerId });
  },
  aiChatCancel: async (requestId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:chat:cancel", { requestId });
  },
  aiFetch: async (url, method, headers, body, providerId, skipHostCheck, followRedirects, skipTLSVerify) => {
    return ipcRenderer.invoke("magiesTerminal:ai:fetch", { url, method, headers, body, providerId, skipHostCheck, followRedirects, skipTLSVerify });
  },
  aiAllowlistAddHost: async (baseURL) => {
    return ipcRenderer.invoke("magiesTerminal:ai:allowlist:add-host", { baseURL });
  },
  aiExec: async (sessionId, command, chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:exec", { sessionId, command, chatSessionId });
  },
  aiMagiesTerminalCancelExec: async (chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:magiesTerminal:cancel", { chatSessionId });
  },
  aiSetChatSessionCancelled: async (chatSessionId, cancelled = true) => {
    return ipcRenderer.invoke("magiesTerminal:ai:chat-session:set-cancelled", { chatSessionId, cancelled });
  },
  aiCapability: async (rpcMethod, params, chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:capability", { rpcMethod, params, chatSessionId });
  },
  aiDiscoverAgents: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:ai:agents:discover", options);
  },
  aiPrewarmShellEnv: async () => {
    return ipcRenderer.invoke("magiesTerminal:ai:shell-env:prewarm");
  },
  aiResolveCli: async (params) => {
    return ipcRenderer.invoke("magiesTerminal:ai:resolve-cli", params);
  },
  aiCodexGetIntegration: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:ai:codex:get-integration", options);
  },
  aiCodexStartLogin: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:ai:codex:start-login", options);
  },
  aiCodexGetLoginSession: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:codex:get-login-session", { sessionId });
  },
  aiCodexCancelLogin: async (sessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:codex:cancel-login", { sessionId });
  },
  aiCodexLogout: async (options) => {
    return ipcRenderer.invoke("magiesTerminal:ai:codex:logout", options);
  },
  // External MCP (productized catalog MCP for Codex / Claude Code / Cursor / Grok)
  externalMcpGetStatus: async () => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:get-status");
  },
  externalMcpSetEnabled: async (enabled) => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:set-enabled", { enabled });
  },
  externalMcpSetConfig: async (config) => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:set-config", config || {});
  },
  externalMcpCodexGetStatus: async () => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:codex:get-status");
  },
  externalMcpCodexAdd: async () => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:codex:add");
  },
  externalMcpClaudeGetStatus: async () => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:claude:get-status");
  },
  externalMcpClaudeAdd: async () => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:claude:add");
  },
  externalMcpGrokGetStatus: async () => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:grok:get-status");
  },
  externalMcpGrokAdd: async () => {
    return ipcRenderer.invoke("magiesTerminal:external-mcp:grok:add");
  },
  // MCP Server session metadata
  aiMcpUpdateSessions: async (sessions, chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:update-sessions", { sessions, chatSessionId });
  },
  aiMcpMergeSessions: async (sessions, chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:merge-sessions", { sessions, chatSessionId });
  },
  aiMcpUpdateAttachments: async (attachments, chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:update-attachments", { attachments, chatSessionId });
  },
  aiMcpSetCommandBlocklist: async (blocklist) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:set-command-blocklist", { blocklist });
  },
  aiMcpSetCommandTimeout: async (timeout) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:set-command-timeout", { timeout });
  },
  aiMcpSetMaxIterations: async (maxIterations) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:set-max-iterations", { maxIterations });
  },
  aiMcpSetPermissionMode: async (mode) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:set-permission-mode", { mode });
  },
  aiMcpSetToolIntegrationMode: async (mode) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:set-tool-integration-mode", { mode });
  },
  aiMcpSyncPermissionGrants: async (grants) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:sync-permission-grants", { grants });
  },
  aiUserSkillsGetStatus: async () => {
    return ipcRenderer.invoke("magiesTerminal:ai:user-skills:status");
  },
  aiUserSkillsOpenFolder: async () => {
    return ipcRenderer.invoke("magiesTerminal:ai:user-skills:open");
  },
  aiUserSkillsBuildContext: async (prompt, selectedSkillSlugs) => {
    return ipcRenderer.invoke("magiesTerminal:ai:user-skills:build-context", { prompt, selectedSkillSlugs });
  },
  // MCP approval gate: renderer receives approval requests from main process
  onMcpApprovalRequest: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:ai:mcp:approval-request", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:mcp:approval-request", handler);
  },
  respondMcpApproval: async (approvalId, approved) => {
    return ipcRenderer.invoke("magiesTerminal:ai:mcp:approval-response", { approvalId, approved });
  },
  // MCP approval cleared: main process timed out or cancelled an approval
  onMcpApprovalCleared: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:ai:mcp:approval-cleared", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:mcp:approval-cleared", handler);
  },
  onVaultAgentRequest: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:ai:vault-agent:request", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:vault-agent:request", handler);
  },
  respondVaultAgent: async (requestId, result) => {
    return ipcRenderer.invoke("magiesTerminal:ai:vault-agent:response", { requestId, result });
  },
  // SDK external agent streaming
  aiSdkAgentStream: async (requestId, chatSessionId, sdkBackend, prompt, cwd, providerId, model, existingSessionId, historyMessages, images, toolIntegrationMode, defaultTargetSession, userSkillsContext, agentEnv, agentCommand) => {
    return ipcRenderer.invoke("magiesTerminal:ai:sdk-agent:stream", { requestId, chatSessionId, sdkBackend, prompt, cwd, providerId, model, existingSessionId, historyMessages, images, toolIntegrationMode, defaultTargetSession, userSkillsContext, agentEnv, agentCommand });
  },
  aiSdkAgentListModels: async (sdkBackend, cwd, providerId, chatSessionId, agentEnv, agentCommand) => {
    return ipcRenderer.invoke("magiesTerminal:ai:sdk-agent:list-models", { sdkBackend, cwd, providerId, chatSessionId, agentEnv, agentCommand });
  },
  aiSdkAgentCancel: async (requestId, chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:sdk-agent:cancel", { requestId, chatSessionId });
  },
  aiSdkAgentCleanup: async (chatSessionId) => {
    return ipcRenderer.invoke("magiesTerminal:ai:sdk-agent:cleanup", { chatSessionId });
  },
  onAiSdkAgentEvent: (requestId, cb) => {
    const handler = (_event, payload) => {
      if (payload.requestId === requestId) cb(payload.event);
    };
    ipcRenderer.on("magiesTerminal:ai:sdk-agent:event", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:sdk-agent:event", handler);
  },
  onAiSdkAgentDone: (requestId, cb) => {
    const handler = (_event, payload) => {
      if (payload.requestId === requestId) cb();
    };
    ipcRenderer.on("magiesTerminal:ai:sdk-agent:done", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:sdk-agent:done", handler);
  },
  onAiSdkAgentError: (requestId, cb) => {
    const handler = (_event, payload) => {
      if (payload.requestId === requestId) cb(payload.error);
    };
    ipcRenderer.on("magiesTerminal:ai:sdk-agent:error", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:sdk-agent:error", handler);
  },
  onAiStreamData: (requestId, cb) => {
    const handler = (_event, payload) => {
      if (payload.requestId === requestId) cb(payload.data);
    };
    ipcRenderer.on("magiesTerminal:ai:stream:data", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:stream:data", handler);
  },
  onAiStreamEnd: (requestId, cb) => {
    const handler = (_event, payload) => {
      if (payload.requestId === requestId) cb();
    };
    ipcRenderer.on("magiesTerminal:ai:stream:end", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:stream:end", handler);
  },
  onAiStreamError: (requestId, cb) => {
    const handler = (_event, payload) => {
      if (payload.requestId === requestId) cb(payload.error);
    };
    ipcRenderer.on("magiesTerminal:ai:stream:error", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:stream:error", handler);
  },
  onAiAgentStdout: (agentId, cb) => {
    const handler = (_event, payload) => {
      if (payload.agentId === agentId) cb(payload.data);
    };
    ipcRenderer.on("magiesTerminal:ai:agent:stdout", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:agent:stdout", handler);
  },
  onAiAgentStderr: (agentId, cb) => {
    const handler = (_event, payload) => {
      if (payload.agentId === agentId) cb(payload.data);
    };
    ipcRenderer.on("magiesTerminal:ai:agent:stderr", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:agent:stderr", handler);
  },
  onAiAgentExit: (agentId, cb) => {
    const handler = (_event, payload) => {
      if (payload.agentId === agentId) cb(payload.code);
    };
    ipcRenderer.on("magiesTerminal:ai:agent:exit", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:ai:agent:exit", handler);
  },
  scriptRun: async (params) => ipcRenderer.invoke("magiesTerminal:script:run", params),
  scriptStop: async (runId) => ipcRenderer.invoke("magiesTerminal:script:stop", { runId }),
  scriptPause: async (runId) => ipcRenderer.invoke("magiesTerminal:script:pause", { runId }),
  scriptResume: async (runId) => ipcRenderer.invoke("magiesTerminal:script:resume", { runId }),
  scriptGetRuns: async (sessionId) => ipcRenderer.invoke("magiesTerminal:script:get-runs", sessionId ? { sessionId } : {}),
  scriptDialogResponse: async (requestId, value, cancelled) =>
    ipcRenderer.invoke("magiesTerminal:script:dialog-response", { requestId, value, cancelled }),
  scriptScreenSnapshotResponse: async (requestId, snapshot) =>
    ipcRenderer.invoke("magiesTerminal:script:screen-snapshot-response", { requestId, snapshot }),
  scriptRecordingStart: async (sessionId) => ipcRenderer.invoke("magiesTerminal:script:recording:start", { sessionId }),
  scriptRecordingStop: async (sessionId) => ipcRenderer.invoke("magiesTerminal:script:recording:stop", { sessionId }),
  scriptRecordingAppendStep: async (sessionId, step) =>
    ipcRenderer.invoke("magiesTerminal:script:recording:append-step", { sessionId, step }),
  onScriptRunsUpdated: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:script:runs-updated", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:script:runs-updated", handler);
  },
  onScriptDialogRequest: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:script:dialog-request", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:script:dialog-request", handler);
  },
  onScriptScreenSnapshotRequest: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:script:screen-snapshot-request", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:script:screen-snapshot-request", handler);
  },
  onScriptSessionInput: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on("magiesTerminal:script:session-input", handler);
    return () => ipcRenderer.removeListener("magiesTerminal:script:session-input", handler);
  },
    };
  }
}

module.exports = { createPreloadApi };
