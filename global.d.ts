/// <reference path="./types/global/magies-terminal-bridge-session.d.ts" />
/// <reference path="./types/global/magies-terminal-bridge-sftp.d.ts" />
/// <reference path="./types/global/magies-terminal-bridge-sync.d.ts" />
/// <reference path="./types/global/magies-terminal-bridge-files.d.ts" />
/// <reference path="./types/global/magies-terminal-bridge-ai.d.ts" />
/// <reference path="./types/global/magies-terminal-bridge-app.d.ts" />
/// <reference path="./types/global/magies-terminal-bridge-system.d.ts" />
/// <reference path="./types/global/magies-terminal-bridge-script.d.ts" />
declare module "*.cjs" {
  const value: Record<string, unknown>;
  export = value;
}

declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string | boolean;
  }
}

declare global {
  // Proxy configuration for SSH connections
  interface MagiesTerminalProxyConfig {
    type: 'http' | 'socks5' | 'command';
    host: string;
    port: number;
    command?: string;
    username?: string;
    password?: string;
  }

  // Discovered local shell (e.g. CMD, PowerShell, WSL, Git Bash)
  interface DiscoveredShell {
    id: string;
    name: string;
    command: string;
    args?: string[];
    icon: string;
    isDefault?: boolean;
  }

  // Jump host configuration for SSH tunneling
  interface MagiesTerminalJumpHost {
    hostname: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    certificate?: string;
    passphrase?: string;
    publicKey?: string;
    keyId?: string;
    keySource?: 'generated' | 'imported' | 'reference';
    label?: string; // Display label for UI
    proxy?: MagiesTerminalProxyConfig;
    identityFilePaths?: string[];
    // ET server port on this hop, used only when ET tunnels through it as a
    // jump host (--jport). Defaults to 2022 in the bridge when omitted.
    etPort?: number;
    // Resolved keepalive for THIS hop (caller has already applied host
    // override / global fallback). interval in seconds, 0 = disabled.
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
    verifyHostKeys?: boolean;
    // Per-hop algorithm settings, mirroring the target-host fields. When
    // omitted the bridge falls back to the target host's settings so a
    // single setting on the leaf still covers the chain (matches the
    // pre-existing behavior of `legacyAlgorithms`).
    legacyAlgorithms?: boolean;
    skipEcdsaHostKey?: boolean;
    algorithmOverrides?: import("./domain/models").HostAlgorithmOverrides;
  }

  // Host key information for verification
  // Reserved for future host key verification UI feature
  interface _MagiesTerminalHostKeyInfo {
    hostname: string;
    port: number;
    keyType: string;
    fingerprint: string;
    publicKey?: string;
  }

  interface MagiesTerminalSSHOptions {
    sessionId?: string;
    hostLabel?: string;
    hostname: string;
    username: string;
    port?: number;
    password?: string;
    privateKey?: string;
    // Optional OpenSSH user certificate
    certificate?: string;
    publicKey?: string; // OpenSSH public key line
    keyId?: string;
    keySource?: 'generated' | 'imported' | 'reference';
    agentForwarding?: boolean;
    // Preferred SSH agent identity (SHA256 fingerprint); restricts agent auth
    // to the matching key when set.
    agentIdentityFingerprint?: string;
    x11Forwarding?: boolean;
    x11Display?: string;
    cols?: number;
    rows?: number;
    charset?: string;
    extraArgs?: string[];
    startupCommand?: string;
    passphrase?: string;
    knownHosts?: import("./domain/models").KnownHost[];
    verifyHostKeys?: boolean;
    // Environment variables to set in the remote shell
    env?: Record<string, string>;
    // Proxy configuration
    proxy?: MagiesTerminalProxyConfig;
    // Jump hosts (bastion chain)
    jumpHosts?: MagiesTerminalJumpHost[];
    // SSH-level keepalive interval in seconds (0 = disabled)
    keepaliveInterval?: number;
    // Unanswered keepalives before ssh2 declares the connection dead
    keepaliveCountMax?: number;
    // Enable legacy SSH algorithms for older network equipment
    legacyAlgorithms?: boolean;
    // Drop ecdsa-sha2-* from offered host-key algorithms (#1027)
    skipEcdsaHostKey?: boolean;
    // Per-category algorithm override lists (advanced, see HostAlgorithmOverrides)
    algorithmOverrides?: import("./domain/models").HostAlgorithmOverrides;
    // Use sudo for SFTP server
    sudo?: boolean;
    // Saved host password used by background system tools when they need sudo.
    sudoAutofillPassword?: string;
    // Session log configuration for real-time streaming
    sessionLog?: { enabled: boolean; directory: string; format: string; timestampsEnabled?: boolean };
    // SSH connection diagnostics. Does not capture terminal output.
    sshDebugLogEnabled?: boolean;
    // Local SSH key file paths (from SSH config IdentityFile)
    identityFilePaths?: string[];
    // When set, reuse the already-authenticated SSH connection of this existing
    // session by opening a new shell channel on it, instead of dialing a fresh
    // connection. Lets a duplicated tab skip a second MFA prompt (issue #1204).
    // The bridge falls back to a fresh connection if the source is gone, unless
    // reuseOnly is also set.
    sourceSessionId?: string;
    // When true with sourceSessionId: (1) fail instead of falling back to a
    // fresh SSH dial, and (2) skip renderer endpoint matching so a Connected
    // picker probe can reuse the named live session even if session.username
    // /port lag the authenticated bridge endpoint.
    reuseOnly?: boolean;
  }

  interface SftpStatResult {
    name: string;
    type: 'file' | 'directory' | 'symlink';
    size: number;
    lastModified: number; // timestamp
    permissions?: string; // e.g., "rwxr-xr-x"
    owner?: string;
    group?: string;
  }

  interface SftpTransferProgress {
    transferId: string;
    bytesTransferred: number;
    totalBytes: number;
    speed: number; // bytes per second
  }

  // Port Forwarding Types
  interface PortForwardOptions {
    ruleId?: string;
    tunnelId: string;
    type: 'local' | 'remote' | 'dynamic';
    localPort: number;
    bindAddress?: string;
    remoteHost?: string;
    remotePort?: number;
    // SSH connection details
    hostname: string;
    port?: number;
    username: string;
    password?: string;
    privateKey?: string;
    certificate?: string;
    keyId?: string;
    passphrase?: string;
    knownHosts?: import("./domain/models").KnownHost[];
    verifyHostKeys?: boolean;
    proxy?: MagiesTerminalProxyConfig;
    jumpHosts?: MagiesTerminalJumpHost[];
    identityFilePaths?: string[];
    legacyAlgorithms?: boolean;
    skipEcdsaHostKey?: boolean;
    algorithmOverrides?: import("./domain/models").HostAlgorithmOverrides;
    // Resolved keepalive for the target connection (caller has already
    // applied host override / global fallback). interval in seconds.
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
  }

  interface PortForwardResult {
    tunnelId: string;
    success: boolean;
    cancelled?: boolean;
    error?: string;
  }

  interface PortForwardStatusResult {
    tunnelId: string;
    status: 'inactive' | 'connecting' | 'active' | 'error';
    type?: 'local' | 'remote' | 'dynamic';
    error?: string;
  }

  interface MagiesTerminalWindowsPtyInfo {
    backend: 'conpty' | 'winpty';
    buildNumber?: number;
  }

  type PortForwardStatusCallback = (status: 'inactive' | 'connecting' | 'active' | 'error', error?: string) => void;

  interface MagiesTerminalBridge {}

  interface Window {
    magiesTerminal?: MagiesTerminalBridge;
  }

}

export { };
