
declare global {
  interface MagiesTerminalDiagnosticsProgressEvent {
    runId: string;
    step: import("../../domain/connectionDiagnostics").DiagnosticStepId;
    status: import("../../domain/connectionDiagnostics").DiagnosticStepStatus;
    detail?: string;
    detailKind?: string;
    errorKind?: string;
    latencyMs?: number;
    hostKeyStatus?: "trusted" | "trusted-system" | "unknown" | "changed";
    authMethod?: string;
    methodsTried?: string[];
    durationMs?: number;
  }

  interface MagiesTerminalBridge {
    runConnectionDiagnostics?(
      options: MagiesTerminalSSHOptions & { runId?: string },
    ): Promise<{
      runId: string;
      results: import("../../domain/connectionDiagnostics").DiagnosticStepResult[];
    }>;
    cancelConnectionDiagnostics?(runId: string): Promise<{ cancelled: boolean }>;
    /**
     * Opens and drops a proxied connection to a host. Failures come back as a
     * code, never as the underlying message — proxy errors can carry the
     * user's credentials.
     */
    testProxyConnection?(payload: {
      proxy: import("../../domain/models").ProxyConfig;
      hostname: string;
      port?: number;
    }): Promise<
      | { success: true; elapsedMs: number }
      | { success: false; error: "invalid" | "auth" | "timeout" | "refused" | "dns" | "failed" }
    >;
    onConnectionDiagnosticsProgress?(
      cb: (event: MagiesTerminalDiagnosticsProgressEvent) => void,
    ): () => void;
  }
}

export {};
