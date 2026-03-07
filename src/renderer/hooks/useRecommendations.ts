import { useState, useEffect, useCallback, useRef } from 'react';

import { RecommendationResult } from '../../shared/types';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const log = createLogger('useRecommendations');

interface UseRecommendationsResult {
  recommendations: RecommendationResult[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  windowHours: number;
  setWindowHours: (hours: number) => void;
  submitFeedback: (
    releaseId: number,
    action: 'played' | 'skipped' | 'not_interested'
  ) => void;
}

export function useRecommendations(): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<
    RecommendationResult[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState(168); // default 1 week
  const fetchIdRef = useRef(0);

  const fetchRecommendations = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const api = getApiService();
      const response = await api.getRecommendations({ window: windowHours });

      if (fetchId !== fetchIdRef.current) return;

      if (response.success && response.data) {
        setRecommendations(response.data);
      } else {
        setError(response.error ?? 'Failed to load recommendations');
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      log.error('Failed to fetch recommendations', { error: message });
      setError(message);
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [windowHours]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const submitFeedback = useCallback(
    async (
      releaseId: number,
      action: 'played' | 'skipped' | 'not_interested'
    ) => {
      try {
        const api = getApiService();
        await api.submitRecommendationFeedback(releaseId, action);
        // Optimistically remove the item from the list
        setRecommendations(prev =>
          prev.filter(r => r.release.id !== releaseId)
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        log.error('Failed to submit feedback', {
          releaseId,
          action,
          error: message,
        });
      }
    },
    []
  );

  return {
    recommendations,
    isLoading,
    error,
    refresh: fetchRecommendations,
    windowHours,
    setWindowHours,
    submitFeedback,
  };
}

export default useRecommendations;
