/**
 * Forwards renderer-side errors (error boundaries, window.onerror,
 * unhandledrejection) into the main-process crash log via the existing
 * `logDiagnostic` IPC bridge, so renderer crashes show up next to main-process
 * ones in Settings > System > Crash Logs.
 */

interface DiagnosticLogBridge {
  logDiagnostic?(payload: {
    source: string;
    message: string;
    extra?: Record<string, unknown>;
  }): Promise<{ success: boolean; error?: string }>;
}

function getBridge(): DiagnosticLogBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { magiesTerminal?: DiagnosticLogBridge }).magiesTerminal;
}

export function reportRendererError(
  source: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const bridge = getBridge();
  if (!bridge?.logDiagnostic) return;

  const err = error instanceof Error ? error : new Error(String(error));
  void bridge
    .logDiagnostic({
      source,
      message: err.message || String(error),
      extra: { ...extra, stack: err.stack },
    })
    .catch(() => {
      // Never let diagnostics reporting surface its own errors.
    });
}

export function installGlobalErrorReporting(target: Window = window): () => void {
  const onError = (event: ErrorEvent) => {
    reportRendererError('renderer-window-error', event.error ?? event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportRendererError('renderer-unhandled-rejection', event.reason);
  };

  target.addEventListener('error', onError as EventListener);
  target.addEventListener('unhandledrejection', onRejection as EventListener);

  return () => {
    target.removeEventListener('error', onError as EventListener);
    target.removeEventListener('unhandledrejection', onRejection as EventListener);
  };
}
