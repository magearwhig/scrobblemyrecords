/**
 * Tests for the useKeyboardShortcuts hook.
 */
import { renderHook, fireEvent } from '@testing-library/react';

import { useKeyboardShortcuts } from '../../../src/renderer/hooks/useKeyboardShortcuts';

function makeOptions() {
  return {
    onFocusSearch: jest.fn(),
    onSync: jest.fn(),
    onNewScrobble: jest.fn(),
    onToggleHelp: jest.fn(),
    onCloseHelp: jest.fn(),
  };
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call onFocusSearch when "/" is pressed', () => {
    // Arrange
    const options = makeOptions();
    renderHook(() => useKeyboardShortcuts(options));

    // Act
    fireEvent.keyDown(document, { key: '/' });

    // Assert
    expect(options.onFocusSearch).toHaveBeenCalledTimes(1);
    expect(options.onSync).not.toHaveBeenCalled();
  });

  it('should call onSync when "S" is pressed (uppercase)', () => {
    const options = makeOptions();
    renderHook(() => useKeyboardShortcuts(options));

    fireEvent.keyDown(document, { key: 'S' });

    expect(options.onSync).toHaveBeenCalledTimes(1);
  });

  it('should call onSync when "s" is pressed (lowercase)', () => {
    const options = makeOptions();
    renderHook(() => useKeyboardShortcuts(options));

    fireEvent.keyDown(document, { key: 's' });

    expect(options.onSync).toHaveBeenCalledTimes(1);
  });

  it('should call onNewScrobble when "N" is pressed', () => {
    const options = makeOptions();
    renderHook(() => useKeyboardShortcuts(options));

    fireEvent.keyDown(document, { key: 'N' });

    expect(options.onNewScrobble).toHaveBeenCalledTimes(1);
  });

  it('should call onToggleHelp when "?" is pressed', () => {
    const options = makeOptions();
    renderHook(() => useKeyboardShortcuts(options));

    fireEvent.keyDown(document, { key: '?' });

    expect(options.onToggleHelp).toHaveBeenCalledTimes(1);
  });

  it('should call onCloseHelp when "Escape" is pressed', () => {
    const options = makeOptions();
    renderHook(() => useKeyboardShortcuts(options));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(options.onCloseHelp).toHaveBeenCalledTimes(1);
    expect(options.onToggleHelp).not.toHaveBeenCalled();
  });

  describe('suppression in text-entry contexts', () => {
    it('should NOT fire when focus is inside an <input>', () => {
      const options = makeOptions();
      renderHook(() => useKeyboardShortcuts(options));

      const input = document.createElement('input');
      document.body.appendChild(input);

      fireEvent.keyDown(input, { key: 'S' });

      expect(options.onSync).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('should NOT fire when focus is inside a <textarea>', () => {
      const options = makeOptions();
      renderHook(() => useKeyboardShortcuts(options));

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      fireEvent.keyDown(textarea, { key: 'N' });

      expect(options.onNewScrobble).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });

    it('should NOT fire when Ctrl is held (browser shortcuts)', () => {
      const options = makeOptions();
      renderHook(() => useKeyboardShortcuts(options));

      fireEvent.keyDown(document, { key: 'S', ctrlKey: true });

      expect(options.onSync).not.toHaveBeenCalled();
    });

    it('should NOT fire when Meta (Cmd) is held', () => {
      const options = makeOptions();
      renderHook(() => useKeyboardShortcuts(options));

      fireEvent.keyDown(document, { key: 'N', metaKey: true });

      expect(options.onNewScrobble).not.toHaveBeenCalled();
    });
  });

  it('should remove the keydown listener when unmounted', () => {
    const options = makeOptions();
    const { unmount } = renderHook(() => useKeyboardShortcuts(options));

    unmount();

    // Pressing a key after unmount should not trigger any handler
    fireEvent.keyDown(document, { key: 'S' });
    expect(options.onSync).not.toHaveBeenCalled();
  });
});
