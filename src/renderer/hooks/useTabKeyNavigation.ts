import React, { useCallback } from 'react';

/**
 * Hook for WAI-ARIA compliant tab arrow key navigation.
 * Handles Left/Right arrow keys to move focus between tabs within a tablist.
 *
 * Usage: add onKeyDown={handleTabKeyDown} to each tab button element.
 */
export function useTabKeyNavigation() {
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<globalThis.HTMLButtonElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      const tablist = e.currentTarget.closest('[role="tablist"]');
      if (!tablist) return;

      const tabs = Array.from(
        tablist.querySelectorAll<globalThis.HTMLButtonElement>(
          '[role="tab"]:not([disabled])'
        )
      );
      if (tabs.length === 0) return;

      const currentIndex = tabs.indexOf(e.currentTarget);
      if (currentIndex === -1) return;

      let nextIndex: number;
      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      }

      tabs[nextIndex].focus();
      tabs[nextIndex].click();
      e.preventDefault();
    },
    []
  );

  return handleTabKeyDown;
}
