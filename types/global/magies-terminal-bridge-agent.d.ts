
declare global {
  interface MagiesTerminalAgentIdentity {
    keyType: string;
    fingerprint: string;
    comment: string;
  }

  interface MagiesTerminalBridge {
    listSshAgentIdentities?(): Promise<{
      available: boolean;
      error?: string;
      identities: MagiesTerminalAgentIdentity[];
    }>;
    /** macOS/Linux only — load PKCS#11 module into ssh-agent via ssh-add -s. */
    sshPkcs11Supported?(): Promise<{ supported: boolean }>;
    sshPkcs11Load?(payload: {
      modulePath: string;
      pin?: string;
    }): Promise<{ success: boolean; error?: string; message?: string }>;
    sshPkcs11Unload?(payload: {
      modulePath: string;
    }): Promise<{ success: boolean; error?: string; message?: string }>;
    onSshAuthMethodUsed?(
      cb: (event: { sessionId: string; method: string }) => void,
    ): () => void;
  }
}

export {};
