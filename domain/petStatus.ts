export type PetStatus = 'idle' | 'running' | 'waiting' | 'done' | 'failed';

export interface PetStatusSignals {
  /** Tool calls currently awaiting user approval, across all AI sessions. */
  pendingApprovalCount: number;
  /** Whether any AI session is actively streaming a response. */
  anyStreaming: boolean;
  /** Outcome of the most recently finished stream, if it just finished. */
  justFinished: 'done' | 'failed' | null;
}

/**
 * Maps raw AI-activity signals to the desktop pet's visual status.
 * Precedence: an approval waiting on the user always wins (it blocks progress),
 * then an in-flight response, then a just-finished outcome, else idle.
 */
export function derivePetStatus(signals: PetStatusSignals): PetStatus {
  if (signals.pendingApprovalCount > 0) return 'waiting';
  if (signals.anyStreaming) return 'running';
  if (signals.justFinished) return signals.justFinished;
  return 'idle';
}
