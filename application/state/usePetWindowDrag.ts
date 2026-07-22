import { useCallback, useRef } from 'react';
import { magiesTerminalBridge } from '../../infrastructure/services/magiesTerminalBridge';

/**
 * Drags the pet overlay window via renderer pointer events instead of
 * `-webkit-app-region: drag`. Native OS window dragging on macOS runs its own
 * modal move-loop that stalls the renderer's compositor, freezing CSS
 * animations for the whole drag — moving the window explicitly on every
 * pointermove keeps the renderer's run loop live so the pet keeps animating
 * while being dragged.
 */
/** Total pointer movement (px) below which a press+release still counts as a click, not a drag. */
const CLICK_MOVEMENT_THRESHOLD_PX = 4;

export function usePetWindowDrag() {
  const isDraggingRef = useRef(false);
  const lastScreenRef = useRef({ x: 0, y: 0 });
  const totalMovementRef = useRef(0);
  // Set once a drag exceeds the click threshold; consulted (and cleared) by
  // the click/dblclick handlers so releasing a drag doesn't also act like a click.
  const didDragRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    isDraggingRef.current = true;
    totalMovementRef.current = 0;
    lastScreenRef.current = { x: e.screenX, y: e.screenY };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.screenX - lastScreenRef.current.x;
    const dy = e.screenY - lastScreenRef.current.y;
    lastScreenRef.current = { x: e.screenX, y: e.screenY };
    if (dx === 0 && dy === 0) return;
    totalMovementRef.current += Math.abs(dx) + Math.abs(dy);
    if (totalMovementRef.current > CLICK_MOVEMENT_THRESHOLD_PX) didDragRef.current = true;
    magiesTerminalBridge.get()?.movePetWindowBy?.(dx, dy);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  /** Call from a click/dblclick handler: true (and resets) if the gesture was actually a drag. */
  const consumeDidDrag = useCallback(() => {
    const didDrag = didDragRef.current;
    didDragRef.current = false;
    return didDrag;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, consumeDidDrag };
}
