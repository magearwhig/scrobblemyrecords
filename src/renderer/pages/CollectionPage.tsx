import React, { useState, useEffect, useMemo, useCallback } from 'react';

import {
  AlbumIdentifier,
  AlbumPlayCountResult,
  CollectionItem,
  DiscardReason,
  AddDiscardPileItemRequest,
  MarketplaceStats,
} from '../../shared/types';
import AlbumCard from '../components/AlbumCard';
import SearchBar from '../components/SearchBar';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('CollectionPage');

const CollectionPage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state } = useApp();
  const [entireCollection, setEntireCollection] = useState<CollectionItem[]>(
    []
  );
  const [loading, setLoading] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCollection, setFilteredCollection] = useState<
    CollectionItem[]
  >([]);
  // Pagination for search mode only
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [selectedAlbums, setSelectedAlbums] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>('');
  const [cacheProgress, setCacheProgress] = useState<{
    status: 'loading' | 'completed';
    currentPage: number;
    totalPages: number;
  } | null>(null);
  const [sortBy, setSortBy] = useState<
    'artist' | 'title' | 'year' | 'date_added' | 'scrobbles'
  >('artist');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid');
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);

  // Filter state
  const [filterFormat, setFilterFormat] = useState<string>('');
  const [filterYearFrom, setFilterYearFrom] = useState<string>('');
  const [filterYearTo, setFilterYearTo] = useState<string>('');
  const [filterDateAdded, setFilterDateAdded] = useState<string>('');
  const [usingCache, setUsingCache] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [cacheStatus, setCacheStatus] = useState<
    'valid' | 'expired' | 'partially_expired' | 'unknown'
  >('unknown');
  const [cacheRefreshing, setCacheRefreshing] = useState<boolean>(false);
  const [infoMessage, setInfoMessage] = useState<string>('');
  const [cacheMonitoring, setCacheMonitoring] = useState<boolean>(false);
  const [checkingForNewItems, setCheckingForNewItems] =
    useState<boolean>(false);
  const [newItemsResult, setNewItemsResult] = useState<{
    newItemsCount: number;
    latestCacheDate?: string;
  } | null>(null);
  const [updatingWithNewItems, setUpdatingWithNewItems] =
    useState<boolean>(false);

  // Discard pile integration state
  const [discardPileIds, setDiscardPileIds] = useState<Set<number>>(new Set());
  const [discardModalItem, setDiscardModalItem] =
    useState<CollectionItem | null>(null);
  const [discardReason, setDiscardReason] = useState<DiscardReason>('selling');
  const [discardReasonNote, setDiscardReasonNote] = useState<string>('');
  const [discardEstimatedValue, setDiscardEstimatedValue] =
    useState<string>('');
  const [discardNotes, setDiscardNotes] = useState<string>('');
  const [addingToDiscard, setAddingToDiscard] = useState<boolean>(false);
  const [bulkDiscardModalOpen, setBulkDiscardModalOpen] =
    useState<boolean>(false);
  const [bulkAddingToDiscard, setBulkAddingToDiscard] =
    useState<boolean>(false);
  const [marketplaceStats, setMarketplaceStats] =
    useState<MarketplaceStats | null>(null);
  const [loadingMarketplaceStats, setLoadingMarketplaceStats] =
    useState<boolean>(false);

  // Play counts state for scrobbles sorting (Feature 8)
  const [playCounts, setPlayCounts] = useState<
    Map<string, AlbumPlayCountResult>
  >(new Map());
  const [loadingPlayCounts, setLoadingPlayCounts] = useState(false);

  const api = getApiService(state.serverUrl);
  const itemsPerPage = 50;
  const scrollBatchSize = 100; // Load more items per scroll for smoother experience

  // Infinite scroll for browse mode (not search mode)
  const {
    sentinelRef,
    hasMore,
    visibleCount,
    reset: resetInfiniteScroll,
  } = useInfiniteScroll({
    enabled: !isSearchMode && !loading && viewMode === 'grid',
    totalItems: entireCollection.length,
    loadedItems: filteredCollection.length,
    itemsPerPage: scrollBatchSize,
    threshold: 600, // Trigger loading earlier for smoother experience
  });

  // Keyboard navigation for single record view
  useEffect(() => {
    if (viewMode !== 'single') return;

    const handleKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentRecordIndex(prev =>
          prev > 0 ? prev - 1 : filteredCollection.length - 1
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentRecordIndex(prev =>
          prev < filteredCollection.length - 1 ? prev + 1 : 0
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, filteredCollection.length]);

  // Reset current index when switching views or changing filters
  useEffect(() => {
    setCurrentRecordIndex(0);
  }, [
    viewMode,
    searchQuery,
    filterFormat,
    filterYearFrom,
    filterYearTo,
    filterDateAdded,
    sortBy,
    sortOrder,
  ]);

  // Compute available filter options from collection data
  const filterOptions = useMemo(() => {
    if (entireCollection.length === 0) {
      return {
        formats: [],
        years: { min: 1970, max: new Date().getFullYear() },
      };
    }

    const formats = new Set<string>();
    let minYear = Infinity;
    let maxYear = 0;

    entireCollection.forEach(item => {
      // Collect formats
      if (item.release.format) {
        item.release.format.forEach(f => formats.add(f));
      }
      // Track year range
      if (item.release.year && item.release.year > 0) {
        minYear = Math.min(minYear, item.release.year);
        maxYear = Math.max(maxYear, item.release.year);
      }
    });

    return {
      formats: Array.from(formats).sort(),
      years: {
        min: minYear === Infinity ? 1970 : minYear,
        max: maxYear === 0 ? new Date().getFullYear() : maxYear,
      },
    };
  }, [entireCollection]);

  // Apply filters to collection - accepts filter values as parameters to avoid stale closure issues
  const applyFilters = (
    items: CollectionItem[],
    filters: {
      format: string;
      yearFrom: string;
      yearTo: string;
      dateAdded: string;
    }
  ): CollectionItem[] => {
    return items.filter(item => {
      // Format filter
      if (filters.format && item.release.format) {
        if (!item.release.format.includes(filters.format)) {
          return false;
        }
      }

      // Year range filter
      if (filters.yearFrom || filters.yearTo) {
        const year = item.release.year || 0;
        if (filters.yearFrom && year < parseInt(filters.yearFrom, 10)) {
          return false;
        }
        if (filters.yearTo && year > parseInt(filters.yearTo, 10)) {
          return false;
        }
      }

      // Date added filter
      if (filters.dateAdded && item.date_added) {
        const addedDate = new Date(item.date_added);
        const now = new Date();
        let cutoffDate: Date;

        switch (filters.dateAdded) {
          case 'week':
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '3months':
            cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          case 'year':
            cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            cutoffDate = new Date(0); // Beginning of time
        }

        if (addedDate < cutoffDate) return false;
      }

      return true;
    });
  };

  // Check if any filters are active
  const hasActiveFilters =
    filterFormat || filterYearFrom || filterYearTo || filterDateAdded;

  // Clear all filters
  const clearFilters = () => {
    setFilterFormat('');
    setFilterYearFrom('');
    setFilterYearTo('');
    setFilterDateAdded('');
  };

  useEffect(() => {
    logger.info('useEffect triggered', {
      authenticated: authStatus.discogs.authenticated,
      username: authStatus.discogs.username,
    });

    if (authStatus.discogs.authenticated && authStatus.discogs.username) {
      logger.info('Starting collection load');
      loadCollection();
      // Start preloading in background
      startPreloadingCollection();
    } else if (!authChecked) {
      logger.info('Not authenticated or no username - checking auth status');
      checkAuthStatus();
    }
  }, [authStatus.discogs.authenticated, authStatus.discogs.username]);

  const checkAuthStatus = async () => {
    try {
      logger.info('Checking authentication status');
      setAuthChecked(true);
      const status = await api.getAuthStatus();
      logger.info('Auth status response', status);
      setAuthStatus(status);
    } catch (error) {
      logger.error('Error checking auth status', error);
    }
  };

  useEffect(() => {
    if (isSearchMode && searchQuery.trim()) {
      logger.info('Search useEffect triggered', {
        searchQuery,
        searchPage,
        sortBy,
        sortOrder,
      });
      performSearch(searchQuery, searchPage);
    }
  }, [isSearchMode, searchQuery, searchPage, sortBy, sortOrder]);

  useEffect(() => {
    logger.info('Search mode changed', {
      isSearchMode,
      searchQuery: searchQuery.trim(),
    });
    if (!isSearchMode && searchQuery.trim() === '') {
      logger.info('Exiting search mode, collection will be re-sorted');
    }
  }, [isSearchMode, searchQuery]);

  useEffect(() => {
    logger.info('Sorting/Filtering useEffect triggered', {
      collectionLength: entireCollection.length,
      isSearchMode,
      sortBy,
      sortOrder,
      filters: { filterFormat, filterYearFrom, filterYearTo, filterDateAdded },
    });

    // Only use local filtering if not in search mode
    if (!isSearchMode && entireCollection.length > 0) {
      // Apply filters first, then sort - pass filter values explicitly to avoid stale closures
      const currentFilters = {
        format: filterFormat,
        yearFrom: filterYearFrom,
        yearTo: filterYearTo,
        dateAdded: filterDateAdded,
      };
      const filtered = applyFilters(entireCollection, currentFilters);
      const sorted = sortCollection(filtered);
      logger.info(
        `Setting filtered collection: ${sorted.length} items (original: ${entireCollection.length}, after filters: ${filtered.length})`
      );
      logger.info(
        'First few items',
        sorted
          .slice(0, 3)
          .map(item => `${item.release.artist} - ${item.release.title}`)
      );
      setFilteredCollection(sorted);

      // Reset infinite scroll when filters or sort changes
      resetInfiniteScroll();
    } else if (!isSearchMode && entireCollection.length === 0) {
      logger.info('Collection is empty, clearing filtered collection');
      setFilteredCollection([]);
    }
    // Note: resetInfiniteScroll is excluded from deps as it's a stable callback
    // and we only want to reset when data/sort/filter actually changes
    // playCounts is included so the collection re-sorts when play counts load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    entireCollection.length,
    isSearchMode,
    sortBy,
    sortOrder,
    filterFormat,
    filterYearFrom,
    filterYearTo,
    filterDateAdded,
    playCounts,
  ]);

  const loadCollection = async (forceReload: boolean = false) => {
    if (!authStatus.discogs.username) {
      logger.info('No username available for collection loading');
      return;
    }

    logger.info(
      `Loading entire collection for ${authStatus.discogs.username}, forceReload: ${forceReload}`
    );
    setLoading(true);
    setError('');

    try {
      const startTime = Date.now();
      const response = await api.getEntireCollection(
        authStatus.discogs.username,
        forceReload
      );

      logger.info('API Response', response);

      if (response.success) {
        // Handle cache status information
        const responseCacheStatus = (response as any).cacheStatus || 'unknown';
        const isRefreshing = (response as any).refreshing || false;
        const message = (response as any).message;

        logger.info(
          `Setting entire collection data: ${response.data?.length || 0} items (cache: ${responseCacheStatus}, refreshing: ${isRefreshing})`
        );
        // Update cache status state
        setCacheStatus(responseCacheStatus);
        setCacheRefreshing(isRefreshing);
        setInfoMessage(message || '');
        if (response.data && response.data.length > 0) {
          logger.info(
            'Sample items',
            response.data.slice(0, 2).map(item => ({
              id: item.id,
              artist: item.release.artist,
              title: item.release.title,
              year: item.release.year,
            }))
          );
          setEntireCollection(response.data);
          // Reset infinite scroll for new collection
          resetInfiniteScroll();
          logger.info(
            `Loaded ${response.data.length} items (${itemsPerPage} per scroll batch)`
          );
        } else {
          // Empty collection or expired cache
          setEntireCollection([]);
        }

        // Check if we used cache based on response time (cache should be much faster)
        const responseTime = Date.now() - startTime;
        const wasFromCache = responseTime < 100; // Cache responses should be under 100ms
        setUsingCache(wasFromCache);

        if (wasFromCache) {
          logger.info(
            `Loaded entire collection from cache (${responseTime}ms)`
          );
        } else {
          logger.info(`Loaded entire collection from API (${responseTime}ms)`);
        }

        // Handle different cache statuses
        if (responseCacheStatus === 'expired' && isRefreshing) {
          logger.info('Cache expired, background refresh started');
          setPreloading(true);
          startCacheProgressMonitoring();
        } else if (
          responseCacheStatus === 'partially_expired' &&
          isRefreshing
        ) {
          logger.info('Some cache expired, background refresh started');
          setPreloading(true);
          startCacheProgressMonitoring();
        } else if (response.data && response.data.length < 100) {
          logger.info(
            'Collection appears incomplete, starting background preloading'
          );
          startPreloadingCollection();
        }
      } else {
        logger.info('API response not successful', response);
        setError('Failed to load collection');
      }
    } catch (error) {
      logger.error('Error loading collection', error);
      setError(
        error instanceof Error ? error.message : 'Failed to load collection'
      );
    } finally {
      setLoading(false);
    }
  };

  const startPreloadingCollection = async () => {
    if (!authStatus.discogs.username || preloading) return;

    // Check if we already have a recent cache before starting preloading
    try {
      const progress = await api.getCacheProgress(authStatus.discogs.username);
      if (progress && progress.status === 'completed') {
        logger.info('Collection already cached, skipping preload');
        return;
      }
    } catch (error) {
      logger.error('Error checking cache progress', error);
    }

    setPreloading(true);
    try {
      await api.preloadCollection(authStatus.discogs.username);
      logger.info('Collection preloading started');
      // Start monitoring progress - preload runs in background on server
      startCacheProgressMonitoring();
    } catch (error) {
      logger.error('Failed to start preloading', error);
      setPreloading(false);
    }
    // Note: Don't set preloading=false here - startCacheProgressMonitoring will do that when complete
  };

  const performSearch = async (query: string, page: number = 1) => {
    if (!authStatus.discogs.username) return;

    setLoading(true);
    setError('');

    try {
      const results = await api.searchCollectionPaginated(
        authStatus.discogs.username,
        query,
        page,
        itemsPerPage
      );
      logger.info(`Search results: ${results.items.length} items found`);
      // Apply sorting to search results
      const sortedResults = sortCollection(results.items);
      setFilteredCollection(sortedResults);
      setSearchTotalPages(results.totalPages);
      setSearchTotal(results.total);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!authStatus.discogs.username) return;

    setSearchQuery(query);

    if (query.trim()) {
      setIsSearchMode(true);
      setSearchPage(1);
      // Don't call performSearch here - let the useEffect handle it to avoid double calls
    } else {
      setIsSearchMode(false);
      // Don't set filteredCollection directly - let the useEffect handle it
      logger.info('Search cleared, switching back to normal mode');
    }
  };

  const handleAlbumSelect = (releaseId: number) => {
    const newSelected = new Set(selectedAlbums);
    if (newSelected.has(releaseId)) {
      newSelected.delete(releaseId);
    } else {
      newSelected.add(releaseId);
    }
    setSelectedAlbums(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedAlbums.size === filteredCollection.length) {
      setSelectedAlbums(new Set());
    } else {
      setSelectedAlbums(
        new Set(filteredCollection.map(item => item.release.id))
      );
    }
  };

  const handleForceReloadCache = async () => {
    setLoading(true);
    try {
      await loadCollection(true); // Force reload from API
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to force reload cache'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    setLoading(true);
    try {
      await api.clearCollectionCache();
      await loadCollection();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to clear cache'
      );
    } finally {
      setLoading(false);
    }
  };

  const startCacheProgressMonitoring = async () => {
    if (!authStatus.discogs.username || cacheMonitoring) {
      logger.info(
        'Cache monitoring already in progress or no username, skipping'
      );
      return;
    }

    setCacheMonitoring(true);

    const monitorProgress = async () => {
      try {
        const progress = await api.getCacheProgress(
          authStatus.discogs.username!
        );
        setCacheProgress(progress);

        // Continue monitoring if still loading
        if (progress && progress.status === 'loading') {
          setTimeout(monitorProgress, 2000); // Check every 2 seconds
        } else if (progress && progress.status === 'completed') {
          logger.info('Cache monitoring completed');
          // Reset cache refreshing state and info message when complete
          setCacheRefreshing(false);
          setInfoMessage('');
          setCacheStatus('valid');
          setPreloading(false);
          setCacheMonitoring(false);
          logger.info(
            'Cache refresh completed - collection should now have fresh data'
          );
        } else {
          // If status is failed or other, stop monitoring
          setCacheMonitoring(false);
        }
      } catch (error) {
        logger.error('Error monitoring cache progress', error);
        setCacheMonitoring(false);
      }
    };

    monitorProgress();
  };

  const handleCheckForNewItems = async () => {
    if (!authStatus.discogs.username) return;

    setCheckingForNewItems(true);
    setError('');

    try {
      const result = await api.checkForNewItems(authStatus.discogs.username);

      if (result.success && result.data) {
        setNewItemsResult({
          newItemsCount: result.data.newItemsCount,
          latestCacheDate: result.data.latestCacheDate,
        });

        if (result.data.newItemsCount > 0) {
          setInfoMessage(
            `Found ${result.data.newItemsCount} new items! Use "Update with New Items" to add them.`
          );
        } else {
          setInfoMessage('Your collection is up to date - no new items found.');
        }

        // Clear the message after 15 seconds
        setTimeout(() => {
          setInfoMessage('');
          setNewItemsResult(null);
        }, 15000);
      } else {
        setError(result.error || 'Failed to check for new items');
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to check for new items'
      );
    } finally {
      setCheckingForNewItems(false);
    }
  };

  const handleUpdateWithNewItems = async () => {
    if (!authStatus.discogs.username) return;

    setUpdatingWithNewItems(true);
    setError('');

    try {
      const result = await api.updateCacheWithNewItems(
        authStatus.discogs.username
      );

      if (result.success && result.data) {
        if (result.data.newItemsAdded > 0) {
          setInfoMessage(
            `Successfully added ${result.data.newItemsAdded} new items to your cache!`
          );
          // Reload the collection to show the new items
          await loadCollection();
        } else {
          setInfoMessage('No new items were found to add.');
        }

        // Clear the result state since we've updated
        setNewItemsResult(null);

        // Clear the message after 10 seconds
        setTimeout(() => {
          setInfoMessage('');
        }, 10000);
      } else {
        setError(result.error || 'Failed to update cache with new items');
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to update cache with new items'
      );
    } finally {
      setUpdatingWithNewItems(false);
    }
  };

  // Load discard pile collection IDs for badges
  const loadDiscardPileIds = useCallback(async () => {
    try {
      const ids = await api.getDiscardPileCollectionIds();
      setDiscardPileIds(new Set(ids));
    } catch (error) {
      logger.error('Failed to load discard pile IDs', error);
    }
  }, [api]);

  // Load discard pile IDs when component mounts and auth is ready
  useEffect(() => {
    if (authStatus.discogs.authenticated) {
      loadDiscardPileIds();
    }
  }, [authStatus.discogs.authenticated, loadDiscardPileIds]);

  // Helper to create a cache key for play counts
  const getPlayCountKey = useCallback(
    (artist: string, title: string): string => {
      return `${artist.toLowerCase()}|${title.toLowerCase()}`;
    },
    []
  );

  // Fetch play counts when scrobbles sort is selected
  const fetchPlayCounts = useCallback(
    async (albums: AlbumIdentifier[]) => {
      if (albums.length === 0) return;

      // Filter out albums we already have cached
      const uncachedAlbums = albums.filter(
        album => !playCounts.has(getPlayCountKey(album.artist, album.title))
      );

      if (uncachedAlbums.length === 0) return;

      try {
        setLoadingPlayCounts(true);
        const response = await api.getAlbumPlayCounts(uncachedAlbums);

        // Update the cache with new results
        setPlayCounts(prev => {
          const newMap = new Map(prev);
          for (const result of response.results) {
            newMap.set(getPlayCountKey(result.artist, result.title), result);
          }
          return newMap;
        });
      } catch (err) {
        logger.error('Error fetching play counts', err);
      } finally {
        setLoadingPlayCounts(false);
      }
    },
    [api, playCounts, getPlayCountKey]
  );

  // Fetch play counts when sorting by scrobbles
  useEffect(() => {
    if (sortBy === 'scrobbles' && entireCollection.length > 0) {
      const albums: AlbumIdentifier[] = entireCollection.map(item => ({
        artist: item.release.artist,
        title: item.release.title,
      }));
      fetchPlayCounts(albums);
    }
  }, [sortBy, entireCollection, fetchPlayCounts]);

  // Handle opening the discard modal
  const handleOpenDiscardModal = async (item: CollectionItem) => {
    setDiscardModalItem(item);
    setDiscardReason('selling');
    setDiscardReasonNote('');
    setDiscardEstimatedValue('');
    setDiscardNotes('');
    setMarketplaceStats(null);

    // Fetch marketplace stats in background
    setLoadingMarketplaceStats(true);
    try {
      const stats = await api.getMarketplaceStats(item.release.id);
      setMarketplaceStats(stats);
    } catch (error) {
      logger.error('Failed to fetch marketplace stats', error);
    } finally {
      setLoadingMarketplaceStats(false);
    }
  };

  // Handle closing the discard modal
  const handleCloseDiscardModal = () => {
    setDiscardModalItem(null);
    setMarketplaceStats(null);
  };

  // Handle adding to discard pile
  const handleAddToDiscardPile = async () => {
    if (!discardModalItem) return;

    setAddingToDiscard(true);
    try {
      const request: AddDiscardPileItemRequest = {
        collectionItemId: discardModalItem.id,
        releaseId: discardModalItem.release.id,
        masterId: discardModalItem.release.master_id,
        artist: discardModalItem.release.artist,
        title: discardModalItem.release.title,
        coverImage: discardModalItem.release.cover_image,
        format: discardModalItem.release.format,
        year: discardModalItem.release.year,
        reason: discardReason,
        reasonNote: discardReasonNote || undefined,
        rating: discardModalItem.rating,
        estimatedValue: discardEstimatedValue
          ? parseFloat(discardEstimatedValue)
          : undefined,
        notes: discardNotes || undefined,
      };

      await api.addToDiscardPile(request);
      // Update local state to show badge
      setDiscardPileIds(prev => new Set([...prev, discardModalItem.id]));
      handleCloseDiscardModal();
      setInfoMessage(
        `Added "${discardModalItem.release.artist} - ${discardModalItem.release.title}" to discard pile`
      );
      setTimeout(() => setInfoMessage(''), 5000);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to add to discard pile'
      );
    } finally {
      setAddingToDiscard(false);
    }
  };

  // Handle opening the bulk discard modal
  const handleOpenBulkDiscardModal = () => {
    setBulkDiscardModalOpen(true);
    setDiscardReason('selling');
    setDiscardReasonNote('');
    setDiscardEstimatedValue('');
    setDiscardNotes('');
  };

  // Handle closing the bulk discard modal
  const handleCloseBulkDiscardModal = () => {
    setBulkDiscardModalOpen(false);
  };

  // Handle bulk adding to discard pile
  const handleBulkAddToDiscardPile = async () => {
    if (selectedAlbums.size === 0) return;

    // Get the selected items that are not already in discard pile
    const selectedItems = filteredCollection.filter(
      item =>
        selectedAlbums.has(item.release.id) && !discardPileIds.has(item.id)
    );

    if (selectedItems.length === 0) {
      setInfoMessage('All selected items are already in the discard pile');
      setTimeout(() => setInfoMessage(''), 5000);
      handleCloseBulkDiscardModal();
      return;
    }

    setBulkAddingToDiscard(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const item of selectedItems) {
        try {
          const request: AddDiscardPileItemRequest = {
            collectionItemId: item.id,
            releaseId: item.release.id,
            masterId: item.release.master_id,
            artist: item.release.artist,
            title: item.release.title,
            coverImage: item.release.cover_image,
            format: item.release.format,
            year: item.release.year,
            reason: discardReason,
            reasonNote: discardReasonNote || undefined,
            rating: item.rating,
            estimatedValue: discardEstimatedValue
              ? parseFloat(discardEstimatedValue)
              : undefined,
            notes: discardNotes || undefined,
          };

          await api.addToDiscardPile(request);
          successCount++;
          // Update local state immediately for this item
          setDiscardPileIds(prev => new Set([...prev, item.id]));
        } catch (error) {
          logger.error(
            `Failed to add ${item.release.title} to discard pile`,
            error
          );
          failCount++;
        }
      }

      handleCloseBulkDiscardModal();
      setSelectedAlbums(new Set()); // Clear selection after bulk operation

      if (failCount === 0) {
        setInfoMessage(
          `Added ${successCount} item${successCount !== 1 ? 's' : ''} to discard pile`
        );
      } else {
        setInfoMessage(
          `Added ${successCount} item${successCount !== 1 ? 's' : ''} to discard pile. ${failCount} failed.`
        );
      }
      setTimeout(() => setInfoMessage(''), 5000);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to bulk add to discard pile'
      );
    } finally {
      setBulkAddingToDiscard(false);
    }
  };

  // Get count of selected items not already in discard pile
  const selectedNotInDiscardCount = useMemo(() => {
    return filteredCollection.filter(
      item =>
        selectedAlbums.has(item.release.id) && !discardPileIds.has(item.id)
    ).length;
  }, [filteredCollection, selectedAlbums, discardPileIds]);

  const sortCollection = (items: CollectionItem[]): CollectionItem[] => {
    logger.info(`Sorting ${items.length} items by ${sortBy} (${sortOrder})`);
    const sorted = [...items].sort((a, b) => {
      // Handle scrobbles sort separately (it has different sort logic)
      if (sortBy === 'scrobbles') {
        // Sort by play count, with secondary sort by date added for stability
        const keyA = getPlayCountKey(a.release.artist, a.release.title);
        const keyB = getPlayCountKey(b.release.artist, b.release.title);
        const countA = playCounts.get(keyA)?.playCount ?? 0;
        const countB = playCounts.get(keyB)?.playCount ?? 0;

        // Primary: by play count (desc for 'asc' since highest is "best")
        if (countA !== countB) {
          // Note: When sortOrder is 'asc', we want highest plays first (descending)
          // When sortOrder is 'desc', we want lowest plays first
          return sortOrder === 'asc' ? countB - countA : countA - countB;
        }
        // Secondary: by date added (newer first as tiebreaker)
        const dateA = new Date(a.date_added || '').getTime();
        const dateB = new Date(b.date_added || '').getTime();
        return dateB - dateA;
      }

      // Handle other sort options
      let aValue: string | number;
      let bValue: string | number;

      switch (sortBy) {
        case 'artist':
          aValue = (a.release.artist || '').toLowerCase();
          bValue = (b.release.artist || '').toLowerCase();
          break;
        case 'title':
          aValue = (a.release.title || '').toLowerCase();
          bValue = (b.release.title || '').toLowerCase();
          break;
        case 'year':
          aValue = a.release.year || 0;
          bValue = b.release.year || 0;
          break;
        case 'date_added':
          aValue = new Date(a.date_added || '').getTime();
          bValue = new Date(b.date_added || '').getTime();
          break;
        default:
          aValue = (a.release.artist || '').toLowerCase();
          bValue = (b.release.artist || '').toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    logger.info(`Sorted ${sorted.length} items successfully`);
    return sorted;
  };

  // Get visible items - uses infinite scroll for browse mode, pagination for search mode
  const getVisibleItems = (): CollectionItem[] => {
    if (isSearchMode) {
      // Search mode still uses pagination
      return filteredCollection;
    }

    // Browse mode uses infinite scroll - show items up to visibleCount
    return filteredCollection.slice(0, visibleCount);
  };

  if (!authStatus.discogs.authenticated) {
    return (
      <div className='card'>
        <h2>Browse Collection</h2>
        <p>Please authenticate with Discogs first to browse your collection.</p>
        <div className='collection-not-authenticated'>
          <a href='#settings?tab=connections' className='btn'>
            Connect Discogs
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className='card'>
        {/* Header */}
        <div className='collection-header'>
          <div className='collection-title-section'>
            <h2>Browse Collection</h2>
            <div className='collection-header-stats'>
              <span>{selectedAlbums.size} selected</span>
              {entireCollection.length > 0 && (
                <span>{entireCollection.length} total items</span>
              )}
            </div>
          </div>

          {/* Cache Management */}
          <div className='collection-cache-management'>
            {/* Status Indicators */}
            <div className='collection-status-indicators'>
              {preloading && (
                <div className='collection-status-badge'>Preloading...</div>
              )}

              {cacheProgress && cacheProgress.status === 'loading' && (
                <div className='collection-status-loading'>
                  <div className='spinner collection-spinner-small'></div>
                  Caching: {cacheProgress.currentPage}/
                  {cacheProgress.totalPages} pages (
                  {Math.round(
                    (cacheProgress.currentPage / cacheProgress.totalPages) * 100
                  )}
                  %)
                </div>
              )}

              {cacheProgress && cacheProgress.status === 'completed' && (
                <div className='collection-status-success'>
                  ✓ Cache complete ({cacheProgress.totalPages} pages)
                </div>
              )}

              {usingCache && !cacheRefreshing && cacheStatus === 'valid' && (
                <div className='collection-status-success'>
                  ⚡ Using cached data
                </div>
              )}

              {cacheStatus === 'expired' && cacheRefreshing && (
                <div className='collection-status-warning'>
                  <div className='spinner collection-spinner-small'></div>⏰
                  Cache expired - Refreshing...
                </div>
              )}

              {cacheStatus === 'partially_expired' && cacheRefreshing && (
                <div className='collection-status-warning'>
                  <div className='spinner collection-spinner-small'></div>
                  ⚠️ Some cache expired - Refreshing...
                </div>
              )}

              {checkingForNewItems && (
                <div className='collection-status-loading'>
                  <div className='spinner collection-spinner-small'></div>
                  Checking for new items...
                </div>
              )}

              {updatingWithNewItems && (
                <div className='collection-status-loading'>
                  <div className='spinner collection-spinner-small'></div>
                  Adding new items to cache...
                </div>
              )}

              {infoMessage && (
                <div
                  className='collection-status-info'
                  style={{
                    color: newItemsResult?.newItemsCount
                      ? 'var(--warning-color)'
                      : 'var(--success-color)',
                  }}
                >
                  {newItemsResult?.newItemsCount ? '⚠️' : 'ℹ️'} {infoMessage}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className='collection-cache-actions'>
              <button
                className='btn btn-small btn-secondary'
                onClick={handleCheckForNewItems}
                disabled={
                  loading || checkingForNewItems || updatingWithNewItems
                }
                title='Check if new items have been added to your Discogs collection'
              >
                {checkingForNewItems ? 'Checking...' : 'Check for New Items'}
              </button>
              {newItemsResult && newItemsResult.newItemsCount > 0 && (
                <button
                  className='btn btn-small btn-primary'
                  onClick={handleUpdateWithNewItems}
                  disabled={
                    loading || checkingForNewItems || updatingWithNewItems
                  }
                  title='Add only the new items to your cache without refreshing everything'
                >
                  {updatingWithNewItems
                    ? 'Adding...'
                    : `Update with New Items (${newItemsResult.newItemsCount})`}
                </button>
              )}
              <button
                className='btn btn-small btn-secondary'
                onClick={handleForceReloadCache}
                disabled={loading || updatingWithNewItems}
                title='Force reload the entire cache from Discogs'
              >
                Force Reload
              </button>
              <button
                className='btn btn-small btn-secondary'
                onClick={handleClearCache}
                disabled={loading || updatingWithNewItems}
                title='Clear the local cache'
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className='error-message'>
            {error}
            <button
              className='btn btn-small'
              onClick={() => loadCollection()}
              style={{ marginLeft: '1rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {entireCollection.length > 0 &&
          entireCollection.length < 100 &&
          !cacheProgress && (
            <div className='card collection-warning-card'>
              <h4 className='collection-warning-title'>
                ⚠️ Incomplete Collection Cache
              </h4>
              <p className='collection-warning-text'>
                Only {entireCollection.length} items are currently cached. Your
                full collection may not be displayed. The system is
                automatically preloading your complete collection in the
                background.
              </p>
              <button
                className='btn btn-small collection-warning-button'
                onClick={startPreloadingCollection}
              >
                Start Preloading Now
              </button>
            </div>
          )}

        <SearchBar
          onSearch={handleSearch}
          placeholder='Search your collection...'
          disabled={loading}
        />

        {/* Filters Section */}
        <div className='collection-filters'>
          <span className='collection-filters-label'>Filters:</span>

          {/* Format Filter */}
          <div className='collection-filter-group'>
            <label htmlFor='filter-format' className='collection-filter-label'>
              Format:
            </label>
            <select
              id='filter-format'
              value={filterFormat}
              onChange={e => setFilterFormat(e.target.value)}
              className='collection-filter-select'
            >
              <option value=''>All Formats</option>
              {filterOptions.formats.map(format => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </div>

          {/* Year Range Filter */}
          <div className='collection-filter-group'>
            <label className='collection-filter-label'>Year:</label>
            <input
              type='number'
              placeholder={String(filterOptions.years.min)}
              value={filterYearFrom}
              onChange={e => setFilterYearFrom(e.target.value)}
              min={filterOptions.years.min}
              max={filterOptions.years.max}
              className='collection-filter-input'
            />
            <span className='collection-filter-separator'>-</span>
            <input
              type='number'
              placeholder={String(filterOptions.years.max)}
              value={filterYearTo}
              onChange={e => setFilterYearTo(e.target.value)}
              min={filterOptions.years.min}
              max={filterOptions.years.max}
              className='collection-filter-input'
            />
          </div>

          {/* Date Added Filter */}
          <div className='collection-filter-group'>
            <label
              htmlFor='filter-date-added'
              className='collection-filter-label'
            >
              Added:
            </label>
            <select
              id='filter-date-added'
              value={filterDateAdded}
              onChange={e => setFilterDateAdded(e.target.value)}
              className='collection-filter-select'
            >
              <option value=''>Any Time</option>
              <option value='week'>Last Week</option>
              <option value='month'>Last Month</option>
              <option value='3months'>Last 3 Months</option>
              <option value='year'>Last Year</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              className='btn btn-small btn-outline'
              onClick={clearFilters}
              style={{ fontSize: '0.85rem' }}
            >
              Clear Filters
            </button>
          )}

          {/* Filter Results Count */}
          {hasActiveFilters && (
            <span className='collection-filter-results'>
              Showing {filteredCollection.length} of {entireCollection.length}{' '}
              items
            </span>
          )}
        </div>

        <div className='collection-controls'>
          <div className='collection-controls-group'>
            <div className='collection-view-toggle'>
              <label className='collection-view-label'>View:</label>
              <button
                onClick={() => setViewMode('grid')}
                className='collection-view-button'
                style={{
                  backgroundColor:
                    viewMode === 'grid'
                      ? 'var(--primary-color)'
                      : 'var(--bg-primary)',
                  color: viewMode === 'grid' ? 'white' : 'var(--text-primary)',
                }}
                title='Grid view'
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('single')}
                className='collection-view-button'
                style={{
                  backgroundColor:
                    viewMode === 'single'
                      ? 'var(--primary-color)'
                      : 'var(--bg-primary)',
                  color:
                    viewMode === 'single' ? 'white' : 'var(--text-primary)',
                }}
                title='Single record view'
              >
                ▭
              </button>
            </div>

            <label className='collection-sort-label'>Sort by:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className='collection-sort-select'
            >
              <option value='artist'>Artist</option>
              <option value='title'>Title</option>
              <option value='year'>Year</option>
              <option value='date_added'>Date Added</option>
              <option value='scrobbles'>Scrobbles (Most Played)</option>
            </select>
            {sortBy === 'scrobbles' && loadingPlayCounts && (
              <span className='collection-sort-loading'>
                Loading play counts...
              </span>
            )}
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className='collection-sort-order-button'
              title={sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        <div className='collection-selection-controls'>
          <div className='collection-selection-group'>
            <button
              className='btn btn-small'
              onClick={handleSelectAll}
              disabled={loading || filteredCollection.length === 0}
            >
              {selectedAlbums.size === filteredCollection.length
                ? 'Deselect All'
                : 'Select All'}
            </button>
            {selectedAlbums.size > 0 && (
              <span className='collection-selection-count'>
                {selectedAlbums.size} selected
              </span>
            )}
          </div>

          <div className='collection-pagination'>
            {isSearchMode ? (
              // Search mode: keep pagination
              <>
                <button
                  className='btn btn-small'
                  onClick={() => setSearchPage(Math.max(1, searchPage - 1))}
                  disabled={searchPage <= 1 || loading}
                >
                  Previous
                </button>
                <span className='collection-pagination-info'>
                  Page {searchPage} of {searchTotalPages} ({searchTotal}{' '}
                  results)
                </span>
                <button
                  className='btn btn-small'
                  onClick={() =>
                    setSearchPage(Math.min(searchTotalPages, searchPage + 1))
                  }
                  disabled={searchPage >= searchTotalPages || loading}
                >
                  Next
                </button>
              </>
            ) : (
              // Browse mode: show count with infinite scroll
              <span className='collection-pagination-info'>
                Showing {Math.min(visibleCount, filteredCollection.length)} of{' '}
                {filteredCollection.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className='card'>
          <div className='loading'>
            <div className='spinner'></div>
            Loading collection...
          </div>
        </div>
      )}

      {!loading && filteredCollection.length === 0 && !error && (
        <div className='card'>
          <div className='collection-empty'>
            {searchQuery
              ? `No results found for "${searchQuery}"`
              : 'No items in your collection'}
          </div>
          <div className='collection-debug-info'>
            Debug: entireCollection={entireCollection.length}, filtered=
            {filteredCollection.length}, searchMode={isSearchMode.toString()}
          </div>
        </div>
      )}

      {!loading && filteredCollection.length > 0 && viewMode === 'grid' && (
        <div className='collection-grid'>
          {getVisibleItems().map((item, index) => (
            <AlbumCard
              key={`${item.id}-${item.date_added || index}`}
              item={item}
              selected={selectedAlbums.has(item.release.id)}
              onSelect={() => handleAlbumSelect(item.release.id)}
              onViewDetails={release => {
                // Store release and collection item ID for details view
                localStorage.setItem(
                  'selectedRelease',
                  JSON.stringify(release)
                );
                localStorage.setItem(
                  'selectedCollectionItemId',
                  item.id.toString()
                );
                window.location.hash = '#release-details';
              }}
              isInDiscardPile={discardPileIds.has(item.id)}
              onAddToDiscardPile={handleOpenDiscardModal}
            />
          ))}

          {/* Infinite scroll sentinel - invisible trigger zone */}
          {!isSearchMode && hasMore && (
            <div
              ref={sentinelRef}
              className='infinite-scroll-sentinel collection-scroll-sentinel'
              aria-hidden='true'
            />
          )}

          {/* End of collection indicator */}
          {!isSearchMode &&
            !hasMore &&
            filteredCollection.length > scrollBatchSize && (
              <div className='collection-end-message'>
                <span className='collection-end-text'>End of collection</span>
              </div>
            )}
        </div>
      )}

      {/* Single Record View */}
      {!loading && filteredCollection.length > 0 && viewMode === 'single' && (
        <div className='collection-single-view'>
          {/* Navigation Controls */}
          <div className='collection-single-nav'>
            <button
              onClick={() =>
                setCurrentRecordIndex(prev =>
                  prev > 0 ? prev - 1 : filteredCollection.length - 1
                )
              }
              className='collection-single-nav-button'
              title='Previous record (←)'
            >
              ←
            </button>

            <div className='collection-single-position'>
              {currentRecordIndex + 1} of {filteredCollection.length}
            </div>

            <button
              onClick={() =>
                setCurrentRecordIndex(prev =>
                  prev < filteredCollection.length - 1 ? prev + 1 : 0
                )
              }
              className='collection-single-nav-button'
              title='Next record (→)'
            >
              →
            </button>
          </div>

          {/* Single Album Card */}
          <div className='collection-single-card'>
            <AlbumCard
              key={`single-${filteredCollection[currentRecordIndex].id}`}
              item={filteredCollection[currentRecordIndex]}
              selected={selectedAlbums.has(
                filteredCollection[currentRecordIndex].release.id
              )}
              onSelect={() =>
                handleAlbumSelect(
                  filteredCollection[currentRecordIndex].release.id
                )
              }
              onViewDetails={release => {
                localStorage.setItem(
                  'selectedRelease',
                  JSON.stringify(release)
                );
                localStorage.setItem(
                  'selectedCollectionItemId',
                  filteredCollection[currentRecordIndex].id.toString()
                );
                window.location.hash = '#release-details';
              }}
              isInDiscardPile={discardPileIds.has(
                filteredCollection[currentRecordIndex].id
              )}
              onAddToDiscardPile={handleOpenDiscardModal}
            />
          </div>

          {/* Keyboard hint */}
          <div className='collection-single-hint'>
            Use ← → arrow keys to navigate
          </div>
        </div>
      )}

      {/* Floating Action Bar - appears when albums are selected */}
      {selectedAlbums.size > 0 && (
        <div className='floating-action-bar'>
          <div className='floating-action-bar-content'>
            <div className='floating-action-bar-info'>
              <span className='floating-action-bar-count'>
                {selectedAlbums.size} album
                {selectedAlbums.size !== 1 ? 's' : ''} selected
              </span>
            </div>
            <div className='floating-action-bar-actions'>
              <button
                className='btn btn-secondary btn-small'
                onClick={() => setSelectedAlbums(new Set())}
              >
                Clear Selection
              </button>
              {selectedNotInDiscardCount > 0 && (
                <button
                  className='btn btn-small btn-outline-warning'
                  onClick={handleOpenBulkDiscardModal}
                  title={`Add ${selectedNotInDiscardCount} item${selectedNotInDiscardCount !== 1 ? 's' : ''} to discard pile`}
                >
                  Discard ({selectedNotInDiscardCount})
                </button>
              )}
              <button
                className='btn btn-small'
                onClick={() => {
                  // Navigate to scrobble page with selected albums
                  const selectedItems = filteredCollection.filter(item =>
                    selectedAlbums.has(item.release.id)
                  );
                  // Store selected items in localStorage
                  localStorage.setItem(
                    'selectedAlbums',
                    JSON.stringify(selectedItems)
                  );
                  window.location.hash = '#scrobble';
                }}
              >
                Scrobble
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Discard Pile Modal */}
      {discardModalItem && (
        <div className='modal-overlay' onClick={handleCloseDiscardModal}>
          <div className='modal' onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>Add to Discard Pile</h3>
              <button
                className='modal-close'
                onClick={handleCloseDiscardModal}
                aria-label='Close'
              >
                ×
              </button>
            </div>
            <div className='modal-body'>
              <div className='discard-modal-item-info'>
                <strong>{discardModalItem.release.artist}</strong>
                <span> - </span>
                <span>{discardModalItem.release.title}</span>
                {discardModalItem.release.year && (
                  <span className='text-muted'>
                    {' '}
                    ({discardModalItem.release.year})
                  </span>
                )}
              </div>

              {/* Marketplace Price Stats */}
              <div className='marketplace-stats-info'>
                {loadingMarketplaceStats ? (
                  <div className='marketplace-stats-loading'>
                    Loading marketplace prices...
                  </div>
                ) : marketplaceStats ? (
                  <div className='marketplace-stats-content'>
                    <div className='marketplace-stats-prices'>
                      <span className='marketplace-stats-label'>
                        Discogs Marketplace:
                      </span>
                      {marketplaceStats.lowestPrice !== undefined ? (
                        <>
                          <span className='marketplace-stats-range'>
                            {marketplaceStats.highestPrice !== undefined &&
                            marketplaceStats.highestPrice !==
                              marketplaceStats.lowestPrice ? (
                              // We have a price range from price suggestions
                              <>
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: marketplaceStats.currency || 'USD',
                                }).format(marketplaceStats.lowestPrice)}
                                {' - '}
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: marketplaceStats.currency || 'USD',
                                }).format(marketplaceStats.highestPrice)}
                              </>
                            ) : (
                              // Only lowest price available (no price suggestions)
                              <>
                                from{' '}
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: marketplaceStats.currency || 'USD',
                                }).format(marketplaceStats.lowestPrice)}
                              </>
                            )}
                          </span>
                          <span className='marketplace-stats-count'>
                            ({marketplaceStats.numForSale} for sale)
                          </span>
                        </>
                      ) : (
                        <span className='marketplace-stats-none'>
                          No listings
                        </span>
                      )}
                    </div>
                    {marketplaceStats.priceSuggestions ? (
                      <div className='marketplace-stats-suggestions'>
                        <span className='marketplace-stats-suggestion-label'>
                          Suggested prices by condition:
                        </span>
                        <div className='marketplace-stats-condition-list'>
                          {marketplaceStats.priceSuggestions.nearMint && (
                            <span className='condition-price'>
                              NM:{' '}
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency:
                                  marketplaceStats.priceSuggestions.nearMint
                                    .currency || 'USD',
                              }).format(
                                marketplaceStats.priceSuggestions.nearMint.value
                              )}
                            </span>
                          )}
                          {marketplaceStats.priceSuggestions.veryGoodPlus && (
                            <span className='condition-price'>
                              VG+:{' '}
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency:
                                  marketplaceStats.priceSuggestions.veryGoodPlus
                                    .currency || 'USD',
                              }).format(
                                marketplaceStats.priceSuggestions.veryGoodPlus
                                  .value
                              )}
                            </span>
                          )}
                          {marketplaceStats.priceSuggestions.veryGood && (
                            <span className='condition-price'>
                              VG:{' '}
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency:
                                  marketplaceStats.priceSuggestions.veryGood
                                    .currency || 'USD',
                              }).format(
                                marketplaceStats.priceSuggestions.veryGood.value
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      marketplaceStats.lowestPrice !== undefined && (
                        <div className='marketplace-stats-suggestions'>
                          <span className='marketplace-stats-no-suggestions'>
                            Seller profile required for price suggestions
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className='marketplace-stats-unavailable'>
                    Marketplace data unavailable
                  </div>
                )}
              </div>

              <div className='form-group'>
                <label htmlFor='discard-reason'>Reason for discarding</label>
                <select
                  id='discard-reason'
                  className='form-select'
                  value={discardReason}
                  onChange={e =>
                    setDiscardReason(e.target.value as DiscardReason)
                  }
                >
                  <option value='selling'>Selling</option>
                  <option value='duplicate'>Duplicate</option>
                  <option value='damaged'>Damaged</option>
                  <option value='upgrade'>Upgrading to better pressing</option>
                  <option value='not_listening'>Not listening anymore</option>
                  <option value='gift'>Gifting to someone</option>
                  <option value='other'>Other</option>
                </select>
              </div>

              {discardReason === 'other' && (
                <div className='form-group'>
                  <label htmlFor='discard-reason-note'>Specify reason</label>
                  <input
                    type='text'
                    id='discard-reason-note'
                    className='form-input'
                    value={discardReasonNote}
                    onChange={e => setDiscardReasonNote(e.target.value)}
                    placeholder='Enter your reason...'
                  />
                </div>
              )}

              <div className='form-group'>
                <label htmlFor='discard-value'>Estimated value (USD)</label>
                <input
                  type='number'
                  id='discard-value'
                  className='form-input'
                  value={discardEstimatedValue}
                  onChange={e => setDiscardEstimatedValue(e.target.value)}
                  placeholder='0.00'
                  min='0'
                  step='0.01'
                />
              </div>

              <div className='form-group'>
                <label htmlFor='discard-notes'>Notes (optional)</label>
                <textarea
                  id='discard-notes'
                  className='form-textarea'
                  value={discardNotes}
                  onChange={e => setDiscardNotes(e.target.value)}
                  placeholder='Condition, pressing details, etc.'
                  rows={3}
                />
              </div>
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={handleCloseDiscardModal}
                disabled={addingToDiscard}
              >
                Cancel
              </button>
              <button
                className='btn btn-primary'
                onClick={handleAddToDiscardPile}
                disabled={addingToDiscard}
              >
                {addingToDiscard ? 'Adding...' : 'Add to Discard Pile'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add to Discard Pile Modal */}
      {bulkDiscardModalOpen && (
        <div className='modal-overlay' onClick={handleCloseBulkDiscardModal}>
          <div className='modal' onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>Add to Discard Pile</h3>
              <button
                className='modal-close'
                onClick={handleCloseBulkDiscardModal}
                aria-label='Close'
              >
                ×
              </button>
            </div>
            <div className='modal-body'>
              <div className='discard-modal-item-info'>
                <strong>
                  {selectedNotInDiscardCount} item
                  {selectedNotInDiscardCount !== 1 ? 's' : ''}
                </strong>
                <span> will be added to the discard pile</span>
              </div>

              <div className='form-group'>
                <label htmlFor='bulk-discard-reason'>
                  Reason for discarding
                </label>
                <select
                  id='bulk-discard-reason'
                  className='form-select'
                  value={discardReason}
                  onChange={e =>
                    setDiscardReason(e.target.value as DiscardReason)
                  }
                >
                  <option value='selling'>Selling</option>
                  <option value='duplicate'>Duplicate</option>
                  <option value='damaged'>Damaged</option>
                  <option value='upgrade'>Upgrading to better pressing</option>
                  <option value='not_listening'>Not listening anymore</option>
                  <option value='gift'>Gifting to someone</option>
                  <option value='other'>Other</option>
                </select>
              </div>

              {discardReason === 'other' && (
                <div className='form-group'>
                  <label htmlFor='bulk-discard-reason-note'>
                    Specify reason
                  </label>
                  <input
                    type='text'
                    id='bulk-discard-reason-note'
                    className='form-input'
                    value={discardReasonNote}
                    onChange={e => setDiscardReasonNote(e.target.value)}
                    placeholder='Enter your reason...'
                  />
                </div>
              )}

              <div className='form-group'>
                <label htmlFor='bulk-discard-value'>
                  Estimated value per item (USD)
                </label>
                <input
                  type='number'
                  id='bulk-discard-value'
                  className='form-input'
                  value={discardEstimatedValue}
                  onChange={e => setDiscardEstimatedValue(e.target.value)}
                  placeholder='0.00'
                  min='0'
                  step='0.01'
                />
              </div>

              <div className='form-group'>
                <label htmlFor='bulk-discard-notes'>Notes (optional)</label>
                <textarea
                  id='bulk-discard-notes'
                  className='form-textarea'
                  value={discardNotes}
                  onChange={e => setDiscardNotes(e.target.value)}
                  placeholder='Condition, pressing details, etc.'
                  rows={3}
                />
              </div>
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={handleCloseBulkDiscardModal}
                disabled={bulkAddingToDiscard}
              >
                Cancel
              </button>
              <button
                className='btn btn-primary'
                onClick={handleBulkAddToDiscardPile}
                disabled={bulkAddingToDiscard}
              >
                {bulkAddingToDiscard
                  ? 'Adding...'
                  : `Add ${selectedNotInDiscardCount} to Discard Pile`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CollectionPage;
