import { useCallback, useEffect, useRef } from "react";
import { magiesTerminalBridge } from "../../infrastructure/services/magiesTerminalBridge";
import type { DiagnosticStepResult } from "../../domain/connectionDiagnostics";
import type { ProxyConfig } from "../../domain/models";

// Thin backend hook for the connection diagnostics ("Test Connection")
// bridge, so components stay free of infrastructure imports.
export const useConnectionDiagnosticsBackend = () => {
  const runDiagnostics = useCallback(
    async (
      options: MagiesTerminalSSHOptions & { runId?: string },
    ): Promise<{ runId: string; results: DiagnosticStepResult[] } | null> => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.runConnectionDiagnostics) return null;
      return bridge.runConnectionDiagnostics(options);
    },
    [],
  );

  const testProxyConnection = useCallback(
    async (payload: { proxy: ProxyConfig; hostname: string; port?: number }) => {
      const bridge = magiesTerminalBridge.get();
      if (!bridge?.testProxyConnection) return null;
      return bridge.testProxyConnection(payload);
    },
    [],
  );

  const cancelDiagnostics = useCallback(async (runId: string) => {
    await magiesTerminalBridge.get()?.cancelConnectionDiagnostics?.(runId);
  }, []);

  // Stable subscription helper: subscribes once per mounted consumer and
  // forwards events to the latest callback.
  const listenerRef = useRef<((event: MagiesTerminalDiagnosticsProgressEvent) => void) | null>(null);
  useEffect(() => {
    const unsubscribe = magiesTerminalBridge.get()?.onConnectionDiagnosticsProgress?.(
      (event) => listenerRef.current?.(event),
    );
    return () => unsubscribe?.();
  }, []);

  const setProgressListener = useCallback(
    (listener: ((event: MagiesTerminalDiagnosticsProgressEvent) => void) | null) => {
      listenerRef.current = listener;
    },
    [],
  );

  return { runDiagnostics, cancelDiagnostics, setProgressListener, testProxyConnection };
};
