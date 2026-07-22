import type { SftpFilenameEncoding } from "../../types";

declare global {
  /** Opt-in state plus the persisted delivery counters shown in Settings. */
  interface CrashTelemetryState {
    enabled: boolean;
    sentCount: number;
    /** Epoch ms of the last delivered report; null when nothing was ever sent. */
    lastSentAt: number | null;
  }

  interface MagiesTerminalBridge {
    // File opener helpers (for "Open With" feature)
    selectApplication?(): Promise<{ path: string; name: string } | null>;
    openWithApplication?(filePath: string, appPath: string): Promise<boolean>;
    openWithSystemDefault?(filePath: string): Promise<{ success: boolean; error?: string }>;
    downloadSftpToTemp?(sftpId: string, remotePath: string, fileName: string, encoding?: SftpFilenameEncoding): Promise<string>;
    downloadSftpToTempWithProgress?(
      sftpId: string,
      remotePath: string,
      fileName: string,
      encoding: SftpFilenameEncoding | undefined,
      transferId: string,
      onProgress?: (transferred: number, total: number, speed: number) => void,
      onComplete?: () => void,
      onError?: (error: string) => void,
      onCancelled?: () => void
    ): Promise<{ localPath: string; cancelled: boolean }>;

    // Save dialog for file downloads
    showSaveDialog?(defaultPath: string, filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>;
    selectDirectory?(title?: string, defaultPath?: string): Promise<string | null>;
    selectFile?(title?: string, defaultPath?: string, filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null>;

    // File watcher for auto-sync feature
    startFileWatch?(localPath: string, remotePath: string, sftpId: string, encoding?: SftpFilenameEncoding): Promise<{ watchId: string }>;
    stopFileWatch?(watchId: string, cleanupTempFile?: boolean): Promise<{ success: boolean }>;
    listFileWatches?(): Promise<Array<{ watchId: string; localPath: string; remotePath: string; sftpId: string }>>;
    registerTempFile?(sftpId: string, localPath: string): Promise<{ success: boolean }>;
    onFileWatchSynced?(cb: (payload: { watchId: string; localPath: string; remotePath: string; bytesWritten: number }) => void): () => void;
    onFileWatchError?(cb: (payload: { watchId: string; localPath: string; remotePath: string; error: string }) => void): () => void;

    // Temp file cleanup
    deleteTempFile?(filePath: string): Promise<{ success: boolean }>;

    // Crash Logs
    getCrashLogs?(): Promise<Array<{ fileName: string; date: string; size: number; entryCount: number }>>;
    readCrashLog?(fileName: string): Promise<Array<{
      timestamp: string;
      source: string;
      message: string;
      stack?: string;
      errorMeta?: Record<string, unknown>;
      extra?: Record<string, unknown>;
      pid?: number;
      platform?: string;
      arch?: string;
      version?: string;
      electronVersion?: string;
      osVersion?: string;
      memoryMB?: { rss: number; heapUsed: number; heapTotal: number };
      activeSessionCount?: number;
      uptimeSeconds?: number;
    }>>;
    clearCrashLogs?(): Promise<{ deletedCount: number }>;
    openCrashLogsDir?(): Promise<{ success: boolean }>;
    getCrashTelemetry?(): Promise<CrashTelemetryState>;
    setCrashTelemetry?(enabled: boolean): Promise<CrashTelemetryState>;

    // Temp directory management
    getTempDirInfo?(): Promise<{ path: string; fileCount: number; totalSize: number }>;
    clearTempDir?(): Promise<{ deletedCount: number; failedCount: number; error?: string }>;
    getTempDirPath?(): Promise<string>;
    openTempDir?(): Promise<{ success: boolean }>;

    // Session Logs
    exportSessionLog?(payload: {
      terminalData: string;
      hostLabel: string;
      hostname: string;
      startTime: number;
      format: 'txt' | 'raw' | 'html' | 'cast';
    }): Promise<{ success: boolean; canceled?: boolean; filePath?: string }>;
    selectSessionLogsDir?(): Promise<{ success: boolean; canceled?: boolean; directory?: string }>;
    autoSaveSessionLog?(payload: {
      terminalData: string;
      hostLabel: string;
      hostname: string;
      hostId: string;
      startTime: number;
      format: 'txt' | 'raw' | 'html' | 'cast';
      directory: string;
    }): Promise<{ success: boolean; error?: string; filePath?: string }>;
    openSessionLogsDir?(directory: string): Promise<{ success: boolean; error?: string }>;
    startManualSessionLog?(payload: {
      sessionId: string;
      sessionName?: string;
      preferredDirectory?: string;
      initialLine?: string;
    }): Promise<{ success: boolean; started: boolean; canceled?: boolean; error?: string; filePath?: string }>;
    stopManualSessionLog?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; stopped: boolean; error?: string; filePath?: string }>;
    getManualSessionLogStatus?(payload: {
      sessionId: string;
    }): Promise<{ success: boolean; isLogging: boolean; error?: string }>;

    // Get file path from File object (for drag-and-drop, uses Electron's webUtils)
    getPathForFile?(file: File): string | undefined;
    readClipboardText?(): Promise<string>;
    writeClipboardText?(text: string): Promise<boolean>;
    readClipboardFiles?(): Promise<Array<{ path: string; name: string; isDirectory: boolean; size?: number }>>;
    readClipboardImage?(): Promise<{ path: string; name: string; mediaType: string; size?: number } | null>;

    // Platform user-presence auth (Touch ID) for opt-in vault unlock
    platformAuthStatus?(): Promise<{
      platform: string;
      available: boolean;
      methods: string[];
      label: string;
    }>;
    platformAuthPrompt?(payload?: {
      reason?: string;
    }): Promise<{ success: boolean; error?: string; message?: string }>;

    // Main-process device-unlock boundary for vault secrets
    vaultUnlockStatus?(): Promise<{
      enabled: boolean;
      locked: boolean;
      hasPin: boolean;
      hasWebAuthn?: boolean;
      webauthnCredentialId?: string | null;
    }>;
    vaultUnlockWithPin?(pin: string): Promise<{ success: boolean; error?: string; retryAfterMs?: number }>;
    vaultUnlockWithPlatform?(payload?: {
      reason?: string;
    }): Promise<{ success: boolean; error?: string }>;
    vaultLock?(): Promise<{ enabled: boolean; locked: boolean; hasPin: boolean }>;
    vaultConfigureUnlock?(input: {
      pin?: string;
      disable?: boolean;
      enabled?: boolean;
      currentPin?: string;
    }): Promise<{ success: boolean; error?: string; retryAfterMs?: number; status?: { enabled: boolean; locked: boolean; hasPin: boolean } }>;
    vaultAdoptLegacyUnlockConfig?(legacy: unknown): Promise<{
      success: boolean;
      adopted?: boolean;
      status?: { enabled: boolean; locked: boolean; hasPin: boolean };
    }>;
    vaultBeginWebAuthnChallenge?(payload?: {
      purpose?: "assert" | "register";
    }): Promise<{
      success: boolean;
      error?: string;
      challengeId?: string;
      challenge?: string;
      expiresAt?: number;
      purpose?: string;
      rpId?: string;
      credential?: { credentialId: string; publicKeySpki: string; rpId: string } | null;
    }>;
    vaultCompleteWebAuthnRegistration?(payload: {
      challengeId?: string;
      challenge?: string;
      credentialId?: string;
      publicKeySpki?: string;
      rpId?: string;
      algorithm?: number;
      transports?: string[];
    }): Promise<{ success: boolean; error?: string; status?: unknown }>;
    vaultUnlockWithWebAuthn?(payload: {
      challengeId?: string;
      authenticatorData?: string;
      clientDataJSON?: string;
      signature?: string;
    }): Promise<{ success: boolean; error?: string }>;
    vaultClearWebAuthn?(input?: { currentPin?: string }): Promise<{ success: boolean; error?: string; status?: unknown }>;

    // Credential encryption (safeStorage + local vault fallback)
    credentialsAvailable?(): Promise<boolean>;
    credentialsStatus?(): Promise<{ available: boolean; safeStorage: boolean; localVault: boolean }>;
    credentialsEncrypt?(plaintext: string): Promise<string>;
    credentialsDecrypt?(value: string): Promise<string>;
    /** Reset stale macOS Keychain Safe Storage items; no-op elsewhere. */
    credentialsRepair?(): Promise<{
      attempted: boolean;
      deleted: string[];
      available: boolean;
      safeStorage?: boolean;
      localVault?: boolean;
    }>;
  }
}

export {};
