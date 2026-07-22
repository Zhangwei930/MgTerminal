import { useEffect } from 'react';
import { useStoredBoolean } from './useStoredBoolean';
import { useI18n } from '../i18n/I18nProvider';
import {
  STORAGE_KEY_AI_PET_ENABLED,
  STORAGE_KEY_AI_PET_STATE,
  STORAGE_KEY_AI_PET_PRIVACY_MODE,
  STORAGE_KEY_AI_PET_NOTIFICATIONS_ENABLED,
} from '../../infrastructure/config/storageKeys';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';
import { subscribePetActivity, isAnyTabStreaming, getLastFinished, getActiveToolName } from './petActivityStore';
import { getPendingApprovalCount, onPendingApprovalCountChange } from '../../infrastructure/ai/shared/approvalGate';
import { derivePetStatus, type PetStatus } from '../../domain/petStatus';

/** How long a "done"/"failed" outcome stays visible on the pet before it settles back to idle. */
const FINISHED_SIGNAL_TTL_MS = 2500;
/** Only notify for tasks that ran at least this long — a quick reply doesn't need an OS alert. */
const NOTIFY_MIN_DURATION_MS = 10_000;

function writePetState(status: PetStatus, toolName: string | null): void {
  localStorageAdapter.writeString(STORAGE_KEY_AI_PET_STATE, JSON.stringify({ status, toolName, ts: Date.now() }));
}

/**
 * Owns the desktop pet's lifecycle and status feed. Mount once in the primary
 * main window (not peer session windows opened via "copy to new window" —
 * `suppressed` should be true there, since only one window should own the
 * OS-level pet overlay and broadcast status).
 *
 * The pet window itself (components/PetWindow.tsx) reads STORAGE_KEY_AI_PET_STATE
 * via the native `storage` event, so no direct IPC is needed for status updates.
 */
export function usePetStatusBroadcaster(suppressed: boolean): void {
  const { t } = useI18n();
  const [enabled] = useStoredBoolean(STORAGE_KEY_AI_PET_ENABLED, false);
  const [privacyMode] = useStoredBoolean(STORAGE_KEY_AI_PET_PRIVACY_MODE, false);
  const [notificationsEnabled] = useStoredBoolean(STORAGE_KEY_AI_PET_NOTIFICATIONS_ENABLED, true);

  useEffect(() => {
    if (suppressed) return;
    void magiesTerminalBridge.get()?.setPetEnabled?.(enabled);
  }, [enabled, suppressed]);

  useEffect(() => {
    if (suppressed || !enabled) return;

    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    let runningStartedAt: number | null = null;
    let prevStatus: PetStatus = 'idle';

    const recompute = () => {
      const lastFinished = getLastFinished();
      const justFinished = lastFinished && Date.now() - lastFinished.at < FINISHED_SIGNAL_TTL_MS
        ? lastFinished.outcome
        : null;
      const anyStreaming = isAnyTabStreaming();
      const status = derivePetStatus({
        pendingApprovalCount: getPendingApprovalCount(),
        anyStreaming,
        justFinished,
      });

      if ((status === 'running' || status === 'waiting') && runningStartedAt === null) {
        runningStartedAt = Date.now();
      }

      if ((status === 'done' || status === 'failed') && prevStatus !== status && runningStartedAt !== null) {
        const elapsed = Date.now() - runningStartedAt;
        if (elapsed >= NOTIFY_MIN_DURATION_MS && notificationsEnabled) {
          void magiesTerminalBridge.get()?.showPetNotification?.({
            title: status === 'failed' ? t('ai.pet.notification.failed.title') : t('ai.pet.notification.done.title'),
            body: status === 'failed' ? t('ai.pet.notification.failed.body') : t('ai.pet.notification.done.body'),
          });
        }
      }
      if (status === 'idle') runningStartedAt = null;
      prevStatus = status;

      writePetState(status, privacyMode ? null : getActiveToolName());

      if (clearTimer) clearTimeout(clearTimer);
      if ((status === 'done' || status === 'failed') && lastFinished) {
        const remaining = FINISHED_SIGNAL_TTL_MS - (Date.now() - lastFinished.at);
        clearTimer = setTimeout(recompute, Math.max(remaining, 0) + 50);
      }
    };

    recompute();
    const unsubscribeActivity = subscribePetActivity(recompute);
    const unsubscribeApprovals = onPendingApprovalCountChange(recompute);
    return () => {
      unsubscribeActivity();
      unsubscribeApprovals();
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [enabled, suppressed, privacyMode, notificationsEnabled, t]);
}
