
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
    onSshAuthMethodUsed?(
      cb: (event: { sessionId: string; method: string }) => void,
    ): () => void;
  }
}

export {};
