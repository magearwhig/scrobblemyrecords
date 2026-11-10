import { TouchEvent, useRef } from 'react';

/** How far a finger must travel sideways for a swipe, in pixels */
const SWIPE_DISTANCE = 50;

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
}

/**
 * Touch handlers that call `onSwipeLeft` / `onSwipeRight` for a mostly
 * sideways swipe; mostly vertical movement is left to page scrolling.
 */
export function useSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void
): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: e => {
      const touch = e.touches[0];
      start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: e => {
      const from = start.current;
      start.current = null;
      const touch = e.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) <= Math.abs(dy)) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
  };
}
