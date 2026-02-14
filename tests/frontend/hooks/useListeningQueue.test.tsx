import { act, renderHook } from '@testing-library/react';

import { useListeningQueue } from '../../../src/renderer/hooks/useListeningQueue';

describe('useListeningQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (localStorage.getItem as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    (localStorage.clear as jest.Mock)();
  });

  describe('initial state', () => {
    it('should start with no active queue', () => {
      const { result } = renderHook(() => useListeningQueue());

      expect(result.current.queue).toBeNull();
      expect(result.current.isActive).toBe(false);
    });

    it('should restore active session from localStorage', () => {
      const storedQueue = {
        id: 'test-123',
        sessionStarted: Date.now(),
        albums: [],
        status: 'active',
      };
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify(storedQueue)
      );

      const { result } = renderHook(() => useListeningQueue());

      expect(result.current.queue).not.toBeNull();
      expect(result.current.queue?.id).toBe('test-123');
      expect(result.current.isActive).toBe(true);
    });

    it('should not restore completed sessions from localStorage', () => {
      const storedQueue = {
        id: 'test-123',
        sessionStarted: Date.now(),
        albums: [],
        status: 'completed',
      };
      (localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify(storedQueue)
      );

      const { result } = renderHook(() => useListeningQueue());

      expect(result.current.queue).toBeNull();
      expect(result.current.isActive).toBe(false);
    });

    it('should handle corrupted localStorage data', () => {
      (localStorage.getItem as jest.Mock).mockReturnValue('invalid-json');

      const { result } = renderHook(() => useListeningQueue());

      expect(result.current.queue).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'recordscrobbles.listeningQueue'
      );
    });
  });

  describe('startSession', () => {
    it('should create a new active session', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });

      expect(result.current.queue).not.toBeNull();
      expect(result.current.queue?.status).toBe('active');
      expect(result.current.queue?.albums).toEqual([]);
      expect(result.current.isActive).toBe(true);
    });

    it('should persist session to localStorage', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'recordscrobbles.listeningQueue',
        expect.any(String)
      );
    });

    it('should return null when session is already active', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });

      let secondResult: ReturnType<typeof result.current.startSession>;
      act(() => {
        secondResult = result.current.startSession();
      });

      expect(secondResult!).toBeNull();
    });
  });

  describe('addAlbum', () => {
    it('should add album to active session', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });

      act(() => {
        result.current.addAlbum(123, 'Radiohead', 'OK Computer');
      });

      expect(result.current.queue?.albums).toHaveLength(1);
      expect(result.current.queue?.albums[0].releaseId).toBe(123);
      expect(result.current.queue?.albums[0].artist).toBe('Radiohead');
      expect(result.current.queue?.albums[0].album).toBe('OK Computer');
      expect(result.current.queue?.albums[0].scrobbled).toBe(false);
    });

    it('should not add album when no active session', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.addAlbum(123, 'Radiohead', 'OK Computer');
      });

      expect(result.current.queue).toBeNull();
    });
  });

  describe('startPlaying', () => {
    it('should mark album as playing with timestamp', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });
      act(() => {
        result.current.addAlbum(123, 'Radiohead', 'OK Computer');
      });
      act(() => {
        result.current.startPlaying(123);
      });

      expect(result.current.queue?.albums[0].startedAt).toBeDefined();
      expect(typeof result.current.queue?.albums[0].startedAt).toBe('number');
    });
  });

  describe('finishAlbum', () => {
    it('should mark album as finished and scrobbled', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });
      act(() => {
        result.current.addAlbum(123, 'Radiohead', 'OK Computer');
      });
      act(() => {
        result.current.finishAlbum(123);
      });

      expect(result.current.queue?.albums[0].finishedAt).toBeDefined();
      expect(result.current.queue?.albums[0].scrobbled).toBe(true);
    });
  });

  describe('removeAlbum', () => {
    it('should remove album from queue', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });
      act(() => {
        result.current.addAlbum(123, 'Radiohead', 'OK Computer');
        result.current.addAlbum(456, 'Pink Floyd', 'DSOTM');
      });
      act(() => {
        result.current.removeAlbum(123);
      });

      expect(result.current.queue?.albums).toHaveLength(1);
      expect(result.current.queue?.albums[0].releaseId).toBe(456);
    });

    it('should not remove already scrobbled album', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });
      act(() => {
        result.current.addAlbum(123, 'Radiohead', 'OK Computer');
      });
      act(() => {
        result.current.finishAlbum(123);
      });
      act(() => {
        result.current.removeAlbum(123);
      });

      // Album should still be there since it was scrobbled
      expect(result.current.queue?.albums).toHaveLength(1);
    });
  });

  describe('endSession', () => {
    it('should clear the queue', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });
      act(() => {
        result.current.addAlbum(123, 'Radiohead', 'OK Computer');
      });
      act(() => {
        result.current.endSession();
      });

      expect(result.current.queue).toBeNull();
      expect(result.current.isActive).toBe(false);
    });

    it('should remove from localStorage', () => {
      const { result } = renderHook(() => useListeningQueue());

      act(() => {
        result.current.startSession();
      });

      // Clear previous calls
      (localStorage.removeItem as jest.Mock).mockClear();

      act(() => {
        result.current.endSession();
      });

      expect(localStorage.removeItem).toHaveBeenCalledWith(
        'recordscrobbles.listeningQueue'
      );
    });
  });
});
