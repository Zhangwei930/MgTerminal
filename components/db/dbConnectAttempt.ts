/**
 * Wraps a database connect attempt so every way it can fail ends up as a
 * displayable error.
 *
 * dbBridge.connect resolves `{success:false}` for some failures but *throws*
 * for others — notably when the SSH tunnel cannot be established. A caller that
 * only handles the resolved shape leaves the rejected case unhandled, and the
 * UI sits on "connecting" indefinitely with nothing explaining why. A wrong
 * port or an unreachable host produces exactly that.
 */

export type DbConnectOutcome =
  | { status: 'connected' }
  | { status: 'error'; error: string };

interface DbConnectResult {
  connectionId: string;
  success: boolean;
  error?: string;
  serverVersion?: string;
}

const DEFAULT_ERROR = 'Connection failed';

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  const text = String(error ?? '');
  return text || DEFAULT_ERROR;
}

export async function attemptDbConnection<P>(
  connect: (params: P) => Promise<DbConnectResult>,
  params: P,
): Promise<DbConnectOutcome> {
  try {
    const result = await connect(params);
    if (result?.success) return { status: 'connected' };
    return { status: 'error', error: result?.error || DEFAULT_ERROR };
  } catch (error) {
    return { status: 'error', error: describe(error) };
  }
}
