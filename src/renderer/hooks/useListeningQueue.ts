import { useState, useEffect, useCallback } from 'react';

import { ListeningQueue } from '../../shared/types';
import { createLogger } from '../utils/logger';

const log = createLogger('useListeningQueue');

const STORAGE_KEY = 'recordscrobbles.listeningQueue';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useListeningQueue() {
  const [queue, setQueue] = useState<ListeningQueue | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as ListeningQueue;
        // Only restore active sessions
        if (parsed.status === 'active') {
          setQueue(parsed);
          log.info('Restored active listening session');
        }
      } catch {
        log.warn('Failed to parse stored listening queue, clearing');
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (queue) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [queue]);

  const startSession = useCallback(() => {
    if (queue?.status === 'active') {
      log.warn('Cannot start session: a session is already active');
      return null;
    }
    const newQueue: ListeningQueue = {
      id: generateId(),
      sessionStarted: Date.now(),
      albums: [],
      status: 'active',
    };
    setQueue(newQueue);
    log.info('Started new listening session');
    return newQueue;
  }, [queue]);

  const addAlbum = useCallback(
    (releaseId: number, artist: string, album: string) => {
      if (!queue || queue.status !== 'active') {
        log.warn('Cannot add album: no active session');
        return;
      }
      setQueue(prev =>
        prev
          ? {
              ...prev,
              albums: [
                ...prev.albums,
                {
                  releaseId,
                  artist,
                  album,
                  addedAt: Date.now(),
                  scrobbled: false,
                },
              ],
            }
          : null
      );
    },
    [queue]
  );

  const startPlaying = useCallback((releaseId: number) => {
    setQueue(prev => {
      if (!prev) return null;
      return {
        ...prev,
        albums: prev.albums.map(a =>
          a.releaseId === releaseId ? { ...a, startedAt: Date.now() } : a
        ),
      };
    });
  }, []);

  const finishAlbum = useCallback((releaseId: number) => {
    setQueue(prev => {
      if (!prev) return null;
      return {
        ...prev,
        albums: prev.albums.map(a =>
          a.releaseId === releaseId
            ? { ...a, finishedAt: Date.now(), scrobbled: true }
            : a
        ),
      };
    });
    // Note: Actual scrobbling happens via existing scrobble API
    // The caller should call api.scrobbleBatch() after this
  }, []);

  const removeAlbum = useCallback((releaseId: number) => {
    setQueue(prev => {
      if (!prev) return null;
      const album = prev.albums.find(a => a.releaseId === releaseId);
      if (album?.scrobbled) {
        log.warn('Cannot remove already scrobbled album');
        return prev;
      }
      return {
        ...prev,
        albums: prev.albums.filter(a => a.releaseId !== releaseId),
      };
    });
  }, []);

  const endSession = useCallback(() => {
    setQueue(null);
    log.info('Ended listening session');
  }, []);

  return {
    queue,
    isActive: queue?.status === 'active',
    startSession,
    addAlbum,
    startPlaying,
    finishAlbum,
    removeAlbum,
    endSession,
  };
}
