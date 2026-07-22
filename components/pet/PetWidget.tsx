import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../application/i18n/I18nProvider';
import { useStoredBoolean } from '../../application/state/useStoredBoolean';
import { usePetImageConfig, DEFAULT_PET_IMAGE_URL } from '../../application/state/usePetImageConfig';
import { usePetStatusState } from '../../application/state/usePetStatusState';
import { usePetWindowDrag } from '../../application/state/usePetWindowDrag';
import { usePetCustomCommand } from '../../application/state/usePetCustomCommand';
import { usePetNumberSetting } from '../../application/state/usePetNumberSetting';
import {
  useOpenAiPanelFromPet,
  useFocusMainWindowFromPet,
  useShowPetContextMenu,
  usePetHideRequested,
} from '../../application/state/usePetInteractions';
import {
  STORAGE_KEY_AI_PET_ENABLED,
  STORAGE_KEY_AI_PET_SCALE,
  STORAGE_KEY_AI_PET_SHOW_BUBBLE,
} from '../../infrastructure/config/storageKeys';
import type { PetStatus } from '../../domain/petStatus';
import { clampSpriteGrid, getSpriteFramePosition, clampFrameRange, stepFrameInRange, type SpriteGrid } from '../../domain/petSprite';

const IDLE_FRAME_INTERVAL_MS = 260;
const RUNNING_FRAME_INTERVAL_MS = 110;
const BUBBLE_VISIBLE_STATUSES: PetStatus[] = ['running', 'waiting', 'done', 'failed'];
/** Standard double-click window: a single click waits this long before acting,
 *  in case it turns out to be the first half of a double-click. */
const CLICK_DEBOUNCE_MS = 220;

export function PetWidget(): React.ReactElement {
  const { t } = useI18n();
  const { image } = usePetImageConfig();
  const { status, toolName } = usePetStatusState();
  const [, setEnabled] = useStoredBoolean(STORAGE_KEY_AI_PET_ENABLED, false);
  const [showBubbleSetting] = useStoredBoolean(STORAGE_KEY_AI_PET_SHOW_BUBBLE, true);
  const [scale] = usePetNumberSetting(STORAGE_KEY_AI_PET_SCALE, 1, { min: 0.5, max: 2 });
  const [customCommand] = usePetCustomCommand();
  const [frameIndex, setFrameIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const drag = usePetWindowDrag();
  const openAiPanel = useOpenAiPanelFromPet();
  const focusMainWindow = useFocusMainWindowFromPet();
  const showContextMenu = useShowPetContextMenu(customCommand);
  usePetHideRequested(useCallback(() => setEnabled(false), [setEnabled]));

  const grid: SpriteGrid = useMemo(
    () => clampSpriteGrid({ cols: image?.cols ?? 1, rows: image?.rows ?? 1 }),
    [image],
  );
  const frameCount = grid.cols * grid.rows;
  const frameRange = useMemo(
    () => clampFrameRange(image?.frameRanges?.[status], frameCount),
    [image, status, frameCount],
  );

  const frameIndexRef = useRef(frameIndex);
  frameIndexRef.current = frameIndex;
  const frameRangeRef = useRef(frameRange);
  frameRangeRef.current = frameRange;
  useEffect(() => {
    if (frameCount <= 1) return;
    const intervalMs = status === 'running' ? RUNNING_FRAME_INTERVAL_MS : IDLE_FRAME_INTERVAL_MS;
    const id = setInterval(() => {
      setFrameIndex(stepFrameInRange(frameIndexRef.current, frameRangeRef.current));
    }, intervalMs);
    return () => clearInterval(id);
  }, [frameCount, status, frameRange]);
  // Snap into the new status's range immediately on a status change, rather than
  // waiting for the next tick (which could briefly show a frame from the old range).
  useEffect(() => {
    setFrameIndex((current) => (
      current < frameRange.start || current > frameRange.end ? frameRange.start : current
    ));
  }, [frameRange]);

  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
  }, []);

  const handleClick = useCallback(() => {
    if (drag.consumeDidDrag()) return;
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      openAiPanel();
    }, CLICK_DEBOUNCE_MS);
  }, [drag, openAiPanel]);

  const handleDoubleClick = useCallback(() => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    if (drag.consumeDidDrag()) return;
    focusMainWindow();
  }, [drag, focusMainWindow]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    showContextMenu();
  }, [showContextMenu]);

  const { xPercent, yPercent } = getSpriteFramePosition(frameIndex, grid);
  const imageUrl = image?.dataUrl ?? DEFAULT_PET_IMAGE_URL;

  const statusLabel = status === 'running'
    ? (toolName ? t('ai.pet.bubble.runningTool', { tool: toolName }) : t('ai.pet.bubble.running'))
    : status === 'waiting'
      ? t('ai.pet.bubble.waiting')
      : status === 'done'
        ? t('ai.pet.bubble.done')
        : status === 'failed'
          ? t('ai.pet.bubble.failed')
          : t('ai.pet.hover.idle');
  const hoverText = `${statusLabel} · ${t('ai.pet.hover.hint')}`;
  const showBubble = showBubbleSetting
    && (isHovered || (BUBBLE_VISIBLE_STATUSES.includes(status) && statusLabel.length > 0));
  const bubbleText = isHovered ? hoverText : statusLabel;

  return (
    <div
      className="group relative flex h-full w-full cursor-grab items-end justify-center pb-2 active:cursor-grabbing"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerUp}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <style>{PET_ANIMATION_STYLES}</style>

      <button
        type="button"
        aria-label={t('ai.pet.hide')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setEnabled(false); }}
        className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 hover:bg-black/60 group-hover:opacity-100"
      >
        <X size={13} />
      </button>

      {showBubble && (
        <div
          className="pointer-events-none absolute left-1/2 top-1 max-w-[190px] -translate-x-1/2 animate-[pet-bubble-in_180ms_ease-out] rounded-xl bg-black/75 px-3 py-1.5 text-center text-[11px] font-medium text-white shadow-lg backdrop-blur-sm"
        >
          {bubbleText}
        </div>
      )}

      {/* Scale lives on this wrapper, not the animated element below: a CSS animation's
          keyframes fully replace `transform` on the element it targets, so a scale set
          there would be silently dropped the moment any status animation plays. */}
      <div style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}>
        <div
          className={cn(
            'h-[128px] w-[128px] bg-contain bg-no-repeat drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]',
            status === 'idle' && 'animate-[pet-idle-bob_2.6s_ease-in-out_infinite]',
            status === 'running' && 'animate-[pet-running-bounce_0.6s_ease-in-out_infinite]',
            status === 'waiting' && 'animate-[pet-waiting-tilt_1.1s_ease-in-out_infinite]',
            status === 'done' && 'animate-[pet-done-wave_0.8s_ease-in-out_1]',
            status === 'failed' && 'animate-[pet-failed-shake_0.45s_ease-in-out_1]',
          )}
          style={{
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: frameCount > 1 ? `${grid.cols * 100}% ${grid.rows * 100}%` : 'contain',
            backgroundPosition: frameCount > 1 ? `${xPercent}% ${yPercent}%` : 'center',
          }}
        />
      </div>
    </div>
  );
}

const PET_ANIMATION_STYLES = `
@keyframes pet-idle-bob {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-12px) scale(1.05); }
}
@keyframes pet-running-bounce {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-14px) scale(1.04); }
}
@keyframes pet-waiting-tilt {
  0%, 100% { transform: rotate(-6deg); }
  50% { transform: rotate(6deg); }
}
@keyframes pet-done-wave {
  0% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(-12deg) scale(1.08); }
  50% { transform: rotate(10deg) scale(1.08); }
  75% { transform: rotate(-6deg) scale(1.04); }
  100% { transform: rotate(0deg) scale(1); }
}
@keyframes pet-failed-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes pet-bubble-in {
  from { opacity: 0; transform: translate(-50%, 4px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
`;
