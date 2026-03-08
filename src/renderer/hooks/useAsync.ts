import {
  DependencyList,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Generic hook for async data fetching with abort controller cleanup,
 * error handling, and refetch capability.
 *
 * @param asyncFn - Async function that accepts an AbortSignal and returns T.
 *   The function must respect the signal and throw or resolve early when aborted.
 * @param deps - Dependency array that triggers a re-fetch when changed.
 *
 * @example
 * const { data, loading, error, refetch } = useAsync(
 *   async (signal) => {
 *     const result = await api.getSuggestions(5);
 *     return result;
 *   },
 *   []
 * );
 */
export function useAsync<T>(
  asyncFn: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList
): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchCount, setRefetchCount] = useState(0);

  // Keep a stable ref to the fn to avoid stale closures in the effect
  const asyncFnRef = useRef(asyncFn);
  asyncFnRef.current = asyncFn;

  const refetch = useCallback(() => {
    setRefetchCount(c => c + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await asyncFnRef.current(controller.signal);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof Error && err.name === 'AbortError') {
            // Request was cancelled — do not update state
            return;
          }
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refetchCount]);

  return { data, loading, error, refetch };
}
