import { renderHook, act } from '@testing-library/react';

import { useAsync } from '../../../src/renderer/hooks/useAsync';

describe('useAsync', () => {
  describe('initial loading state', () => {
    it('starts in loading state', () => {
      // Arrange
      const asyncFn = jest.fn(() => new Promise<string>(() => {}));

      // Act
      const { result } = renderHook(() => useAsync(asyncFn, []));

      // Assert
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful fetch', () => {
    it('sets data and clears loading on success', async () => {
      // Arrange
      const asyncFn = jest.fn().mockResolvedValue('hello');

      // Act
      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBe('hello');
      expect(result.current.error).toBeNull();
    });

    it('passes the abort signal to the async function', async () => {
      // Arrange
      let capturedSignal: AbortSignal | null = null;
      const asyncFn = jest.fn((signal: AbortSignal) => {
        capturedSignal = signal;
        return Promise.resolve('ok');
      });

      // Act
      renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it('works with object data', async () => {
      // Arrange
      const asyncFn = jest.fn().mockResolvedValue({ count: 42, name: 'test' });

      // Act
      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(result.current.data).toEqual({ count: 42, name: 'test' });
    });

    it('works with array data', async () => {
      // Arrange
      const asyncFn = jest.fn().mockResolvedValue([1, 2, 3]);

      // Act
      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(result.current.data).toEqual([1, 2, 3]);
    });

    it('works with null data', async () => {
      // Arrange
      const asyncFn = jest.fn().mockResolvedValue(null);

      // Act
      const { result } = renderHook(() => useAsync<string | null>(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('sets error string and clears loading on thrown Error', async () => {
      // Arrange
      const asyncFn = jest.fn().mockRejectedValue(new Error('fetch failed'));

      // Act
      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBe('fetch failed');
    });

    it('sets "Unknown error" for non-Error thrown values', async () => {
      // Arrange
      const asyncFn = jest.fn().mockRejectedValue('string error');

      // Act
      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(result.current.error).toBe('Unknown error');
    });

    it('does not set error state for AbortError', async () => {
      // Arrange — simulate an aborted request
      const asyncFn = jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Aborted'), { name: 'AbortError' })
        );

      // Act
      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      // Assert — AbortError should be swallowed silently
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);
    });
  });

  describe('dependency change re-fetch', () => {
    it('re-fetches when deps change', async () => {
      // Arrange
      const asyncFn = jest.fn().mockResolvedValue('value');
      let dep = 'a';

      const { result, rerender } = renderHook(() => useAsync(asyncFn, [dep]));

      await act(async () => {
        await Promise.resolve();
      });

      expect(asyncFn).toHaveBeenCalledTimes(1);

      // Act — change dep
      dep = 'b';
      rerender();

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(asyncFn).toHaveBeenCalledTimes(2);
    });

    it('shows loading=true between dep changes', async () => {
      // Arrange
      let resolveSecond!: (v: string) => void;
      const asyncFn = jest
        .fn()
        .mockResolvedValueOnce('first')
        .mockReturnValueOnce(
          new Promise<string>(r => {
            resolveSecond = r;
          })
        );

      let dep = 'a';
      const { result, rerender } = renderHook(() => useAsync(asyncFn, [dep]));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.data).toBe('first');
      expect(result.current.loading).toBe(false);

      // Act — trigger re-fetch
      dep = 'b';
      rerender();

      // Assert — loading should be true while second fetch is pending
      expect(result.current.loading).toBe(true);

      // Cleanup — resolve to avoid act() warning
      await act(async () => {
        resolveSecond('second');
        await Promise.resolve();
      });
    });
  });

  describe('refetch', () => {
    it('re-fetches when refetch() is called', async () => {
      // Arrange
      const asyncFn = jest.fn().mockResolvedValue('value');
      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      expect(asyncFn).toHaveBeenCalledTimes(1);

      // Act
      act(() => {
        result.current.refetch();
      });

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(asyncFn).toHaveBeenCalledTimes(2);
    });

    it('returns a stable refetch reference', () => {
      // Arrange
      const asyncFn = jest.fn().mockResolvedValue('value');
      const { result, rerender } = renderHook(() => useAsync(asyncFn, []));

      const firstRefetch = result.current.refetch;

      // Act
      rerender();

      // Assert
      expect(result.current.refetch).toBe(firstRefetch);
    });

    it('clears previous error on refetch', async () => {
      // Arrange
      const asyncFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('first failure'))
        .mockResolvedValueOnce('recovered');

      const { result } = renderHook(() => useAsync(asyncFn, []));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.error).toBe('first failure');

      // Act
      act(() => {
        result.current.refetch();
      });

      await act(async () => {
        await Promise.resolve();
      });

      // Assert
      expect(result.current.error).toBeNull();
      expect(result.current.data).toBe('recovered');
    });
  });

  describe('cleanup on unmount', () => {
    it('does not update state after unmount', async () => {
      // Arrange — use a deferred promise to control resolution timing
      let resolveDeferred!: (v: string) => void;
      const deferred = new Promise<string>(r => {
        resolveDeferred = r;
      });
      const asyncFn = jest.fn().mockReturnValue(deferred);

      const { result, unmount } = renderHook(() => useAsync(asyncFn, []));

      // Assert initial state
      expect(result.current.loading).toBe(true);

      // Act — unmount before resolution
      unmount();

      // Resolve after unmount — should not cause state updates
      await act(async () => {
        resolveDeferred('late');
        await Promise.resolve();
      });

      // Assert — state unchanged from before unmount
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBeNull();
    });
  });

  describe('asyncFn update without re-fetch', () => {
    it('uses the latest asyncFn without triggering re-fetch on fn reference change', async () => {
      // Arrange — first call returns 'first'
      const asyncFn1 = jest.fn().mockResolvedValue('first');

      const { result, rerender } = renderHook(
        ({ fn }: { fn: (s: AbortSignal) => Promise<string> }) =>
          useAsync(fn, []),
        { initialProps: { fn: asyncFn1 } }
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.data).toBe('first');
      const callCountAfterFirst = asyncFn1.mock.calls.length;

      // Act — swap the fn without changing deps
      const asyncFn2 = jest.fn().mockResolvedValue('second');
      rerender({ fn: asyncFn2 });

      // Assert — no additional fetches triggered by fn reference change
      await act(async () => {
        await Promise.resolve();
      });

      expect(asyncFn1.mock.calls.length).toBe(callCountAfterFirst);
      // The hook holds the fn in a ref so asyncFn2 was NOT called automatically
      expect(asyncFn2).not.toHaveBeenCalled();
    });
  });
});
