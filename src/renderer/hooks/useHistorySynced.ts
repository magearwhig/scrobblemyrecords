import { useEffect, useRef } from 'react';

/**
 * Fired on window when a Last.fm history sync finishes (for example the
 * automatic sync a few seconds after scrobbling), so pages showing scrobble
 * history can reload it.
 */
export const HISTORY_SYNCED_EVENT = 'listenography:history-synced';

export function notifyHistorySynced(): void {
  window.dispatchEvent(new Event(HISTORY_SYNCED_EVENT));
}

/**
 * Calls `onSynced` whenever a history sync finishes. The latest callback is
 * used, so it can close over current props and state.
 */
export function useHistorySynced(onSynced: () => void): void {
  const callbackRef = useRef(onSynced);
  callbackRef.current = onSynced;

  useEffect(() => {
    const handler = () => callbackRef.current();
    window.addEventListener(HISTORY_SYNCED_EVENT, handler);
    return () => window.removeEventListener(HISTORY_SYNCED_EVENT, handler);
  }, []);
}
