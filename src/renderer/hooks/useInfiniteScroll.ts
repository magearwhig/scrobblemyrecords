import React, { useCallback, useEffect, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  /** Distance from bottom (in pixels) to trigger loading more items */
  threshold?: number;
  /** Whether infinite scroll is enabled */
  enabled?: boolean;
  /** Total number of items available */
  totalItems: number;
  /** Number of items currently loaded */
  loadedItems: number;
  /** Items per page/batch */
  itemsPerPage: number;
}

interface UseInfiniteScrollReturn {
  /** Ref to attach to the scrollable container or sentinel element */
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  /** Whether more items are being loaded */
  isLoadingMore: boolean;
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Current number of visible items */
  visibleCount: number;
  /** Function to load more items */
  loadMore: () => void;
  /** Function to reset to initial state */
  reset: () => void;
}

/**
 * Custom hook for implementing infinite scroll functionality
 * Uses IntersectionObserver for efficient scroll detection
 */
export function useInfiniteScroll({
  threshold = 200,
  enabled = true,
  loadedItems,
  itemsPerPage,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(itemsPerPage);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingRef = useRef(false); // Prevent race conditions

  const hasMore = visibleCount < loadedItems;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
      setVisibleCount(prev => Math.min(prev + itemsPerPage, loadedItems));
      setIsLoadingMore(false);
      loadingRef.current = false;
    });
  }, [hasMore, itemsPerPage, loadedItems]);

  const reset = useCallback(() => {
    setVisibleCount(itemsPerPage);
    setIsLoadingMore(false);
    loadingRef.current = false;
  }, [itemsPerPage]);

  // Reset visible count when loaded items change significantly (e.g., new search/filter)
  useEffect(() => {
    if (loadedItems < visibleCount) {
      setVisibleCount(Math.min(itemsPerPage, loadedItems));
    }
  }, [loadedItems, visibleCount, itemsPerPage]);

  // IntersectionObserver for detecting when sentinel is visible
  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;

    // eslint-disable-next-line no-undef
    const observer = new IntersectionObserver(
      entries => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingRef.current) {
          loadMore();
        }
      },
      {
        root: null, // viewport
        rootMargin: `${threshold}px`,
        threshold: 0,
      }
    );

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [enabled, hasMore, loadMore, threshold]);

  return {
    sentinelRef,
    isLoadingMore,
    hasMore,
    visibleCount,
    loadMore,
    reset,
  };
}

export default useInfiniteScroll;
