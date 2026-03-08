import { useEffect, useCallback } from 'react';

export interface ShortcutDefinition {
  key: string;
  label: string;
  description: string;
}

/**
 * All registered keyboard shortcuts, exported so the help overlay can list them.
 */
export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  { key: '/', label: '/', description: 'Focus search' },
  { key: 'S', label: 'S', description: 'Sync collection / history' },
  { key: 'N', label: 'N', description: 'New scrobble' },
  { key: '?', label: '?', description: 'Show keyboard shortcuts' },
  { key: 'Esc', label: 'Esc', description: 'Close modal / overlay' },
];

interface UseKeyboardShortcutsOptions {
  onFocusSearch: () => void;
  onSync: () => void;
  onNewScrobble: () => void;
  /** Called when `?` is pressed — toggles the help overlay. */
  onToggleHelp: () => void;
  /** Called when `Esc` is pressed — closes the help overlay if open. */
  onCloseHelp: () => void;
}

/**
 * Returns true when the keyboard event originates from a text-entry element.
 * Shortcuts must not fire when the user is typing.
 */
function isTypingContext(target: globalThis.EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Registers global keyboard shortcuts at the document level.
 * Must be called from a component that is mounted for the lifetime of the app
 * (e.g., App.tsx or a top-level layout component).
 *
 * Shortcuts are suppressed when focus is inside a text-entry element
 * (`<input>`, `<textarea>`, or `contenteditable`).
 */
export function useKeyboardShortcuts({
  onFocusSearch,
  onSync,
  onNewScrobble,
  onToggleHelp,
  onCloseHelp,
}: UseKeyboardShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if (isTypingContext(e.target)) return;

      // Ignore events with modifier keys (Ctrl/Cmd/Alt) — let the browser handle those
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          onFocusSearch();
          break;
        case 's':
        case 'S':
          e.preventDefault();
          onSync();
          break;
        case 'n':
        case 'N':
          e.preventDefault();
          onNewScrobble();
          break;
        case '?':
          e.preventDefault();
          onToggleHelp();
          break;
        case 'Escape':
          // Close the help overlay if it is open; Modal's FocusTrap handles
          // its own Esc — we only intercept here for the help overlay.
          onCloseHelp();
          break;
        default:
          break;
      }
    },
    [onFocusSearch, onSync, onNewScrobble, onToggleHelp, onCloseHelp]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
