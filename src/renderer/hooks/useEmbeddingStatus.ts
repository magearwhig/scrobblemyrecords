import { useState, useEffect, useCallback, useRef } from 'react';

import { EmbeddingStatus } from '../../shared/types';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const log = createLogger('useEmbeddingStatus');

const POLL_INTERVAL_MS = 3000;

interface UseEmbeddingStatusResult {
  status: EmbeddingStatus | null;
  isLoading: boolean;
  error: string | null;
  rebuild: () => void;
  cancel: () => void;
  refresh: () => void;
}

export function useEmbeddingStatus(): UseEmbeddingStatusResult {
  const [status, setStatus] = useState<EmbeddingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearPollTimer = () => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const fetchStatus = useCallback(async () => {
    try {
      const api = getApiService();
      const response = await api.getEmbeddingStatus();
      if (!mountedRef.current) return;

      if (response.success && response.data) {
        setStatus(response.data);
        setError(null);

        if (response.data.isRebuilding) {
          clearPollTimer();
          pollTimerRef.current = setTimeout(fetchStatus, POLL_INTERVAL_MS);
        }
      } else {
        setError(response.error ?? 'Failed to load embedding status');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error('Failed to fetch embedding status', { error: message });
      setError(message);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setIsLoading(true);
    fetchStatus().finally(() => {
      if (mountedRef.current) setIsLoading(false);
    });

    return () => {
      mountedRef.current = false;
      clearPollTimer();
    };
  }, [fetchStatus]);

  const rebuild = useCallback(async () => {
    try {
      const api = getApiService();
      const response = await api.rebuildEmbeddings();
      if (!mountedRef.current) return;

      if (response.success) {
        // Start polling since rebuild is now in progress
        clearPollTimer();
        pollTimerRef.current = setTimeout(fetchStatus, POLL_INTERVAL_MS);
        // Optimistically update status
        setStatus(prev => (prev ? { ...prev, isRebuilding: true } : null));
      } else {
        log.warn('Rebuild request failed', { error: response.error });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error('Failed to start embedding rebuild', { error: message });
    }
  }, [fetchStatus]);

  const cancel = useCallback(async () => {
    try {
      const api = getApiService();
      await api.cancelEmbeddingRebuild();
      if (!mountedRef.current) return;
      clearPollTimer();
      await fetchStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error('Failed to cancel embedding rebuild', { error: message });
    }
  }, [fetchStatus]);

  return {
    status,
    isLoading,
    error,
    rebuild,
    cancel,
    refresh: fetchStatus,
  };
}

export default useEmbeddingStatus;
