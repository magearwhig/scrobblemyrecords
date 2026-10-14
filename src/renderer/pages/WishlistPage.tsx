import { Search, X } from 'lucide-react';
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import './WishlistPage.page.css';

import {
  AlbumIdentifier,
  AlbumPlayCountResult,
  EnrichedWishlistItem,
  LocalWantItem,
  ReleaseVersion,
  WishlistPriceRefreshStatus,
  WishlistSettings,
  WishlistSyncStatus,
  VinylStatus,
} from '../../shared/types';
import { Modal } from '../components/ui';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import {
  AlbumCardSkeleton,
  Skeleton,
  TableRowSkeleton,
} from '../components/ui/Skeleton';
import { NewReleasesTab } from '../components/wishlist/NewReleasesTab';
import WishlistPriceAlert, {
  formatCheckedAgo,
} from '../components/wishlist/WishlistPriceAlert';
import WishlistItemCard from '../components/WishlistItemCard';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  useNotifications,
  createSuccessNotification,
} from '../hooks/useNotifications';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('WishlistPage');

/** How often prices are re-read while the background check is still filling them in */
export const PRICE_POLL_MS = 60 * 1000;
/** How often prices are re-read once every pressing has been checked */
export const PRICE_IDLE_POLL_MS = 5 * 60 * 1000;
/** After setting an alert, when to re-read its record's freshly checked prices */
const ALERT_PRICE_RECHECK_MS = 30 * 1000;

/** Prefer the server's error message (axios `response.data.error`) */
function getErrorMessage(err: unknown, fallback: string): string {
  const serverError = (err as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  if (typeof serverError === 'string' && serverError) return serverError;
  return err instanceof Error && err.message ? err.message : fallback;
}

type TabType =
  | 'all'
  | 'vinyl'
  | 'cd_only'
  | 'affordable'
  | 'price_alerts'
  | 'monitoring'
  | 'new_releases';
type SortOption = 'date' | 'price' | 'artist' | 'album' | 'scrobbles';

interface VersionsModalState {
  isOpen: boolean;
  item: EnrichedWishlistItem | null;
  versions: ReleaseVersion[];
  loading: boolean;
}

interface WishlistPageProps {
  embedded?: boolean;
}

const WishlistPage: React.FC<WishlistPageProps> = ({ embedded = false }) => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const { addNotification } = useNotifications();
  const { showToast } = useToast();
  const [items, setItems] = useState<EnrichedWishlistItem[]>([]);
  const [localWantItems, setLocalWantItems] = useState<LocalWantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<WishlistSyncStatus | null>(null);
  const [settings, setSettings] = useState<WishlistSettings | null>(null);
  const [priceRefreshStatus, setPriceRefreshStatus] =
    useState<WishlistPriceRefreshStatus | null>(null);

  // Tab and sorting state
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [searchQuery, setSearchQuery] = useState('');

  // Include monitored albums toggle (Phase 2)
  const [includeMonitored, setIncludeMonitored] = useState(false);

  // Local want list vinyl check state
  const [checkingLocalVinyl, setCheckingLocalVinyl] = useState(false);

  // New releases count (Feature 5.5)
  const [newReleasesCount, setNewReleasesCount] = useState(0);

  // Versions modal state
  const [versionsModal, setVersionsModal] = useState<VersionsModalState>({
    isOpen: false,
    item: null,
    versions: [],
    loading: false,
  });

  // Polling for sync status
  const [isPolling, setIsPolling] = useState(false);

  // Play counts state for scrobbles sorting (Feature 8)
  const [playCounts, setPlayCounts] = useState<
    Map<string, AlbumPlayCountResult>
  >(new Map());
  const [loadingPlayCounts, setLoadingPlayCounts] = useState(false);

  const api = getApiService(state.serverUrl);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [wishlistItems, status, wishlistSettings, localItems] =
        await Promise.all([
          api.getWishlist(),
          api.getWishlistSyncStatus(),
          api.getWishlistSettings(),
          api.getLocalWantList(),
        ]);

      setItems(wishlistItems);
      setSyncStatus(status);
      setSettings(wishlistSettings);
      setLocalWantItems(localItems);

      // If a sync is already in progress, start polling
      if (status.status === 'syncing' || status.status === 'checking_vinyl') {
        setIsPolling(true);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load wishlist data'
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Background price refresh progress; purely informational, so fail silently
  const loadPriceRefreshStatus = useCallback(async () => {
    try {
      setPriceRefreshStatus(await api.getWishlistPriceRefreshStatus());
    } catch (err) {
      logger.warn('Could not load price refresh status', err);
    }
  }, [api]);

  useEffect(() => {
    loadPriceRefreshStatus();
  }, [loadPriceRefreshStatus]);

  // Prices are checked in the background; re-read them without a loading
  // state so new prices and alerts show up while the page is open
  const refreshPricesQuietly = useCallback(async () => {
    try {
      const [wishlistItems, status] = await Promise.all([
        api.getWishlist(),
        api.getWishlistPriceRefreshStatus(),
      ]);
      setItems(wishlistItems);
      setPriceRefreshStatus(status);
    } catch (err) {
      logger.warn('Could not refresh wishlist prices', err);
    }
  }, [api]);

  const pricesPending = (priceRefreshStatus?.pressingsUnchecked ?? 0) > 0;
  useEffect(() => {
    const timer = setInterval(
      refreshPricesQuietly,
      pricesPending ? PRICE_POLL_MS : PRICE_IDLE_POLL_MS
    );
    return () => clearInterval(timer);
  }, [pricesPending, refreshPricesQuietly]);

  const recheckTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => recheckTimers.current.forEach(timer => clearTimeout(timer)),
    []
  );

  const handleSavePriceAlert = useCallback(
    async (masterId: number, maxPrice: number) => {
      try {
        const updated = await api.setWishlistPriceAlert(masterId, maxPrice);
        // Several wanted releases can share a master: copy the master-level
        // price fields onto each rather than replacing the items
        setItems(prev =>
          prev.map(item =>
            item.masterId === masterId
              ? {
                  ...item,
                  priceAlert: updated.priceAlert,
                  lowestListing: updated.lowestListing,
                  lowestVinylPrice: updated.lowestVinylPrice,
                  priceCurrency: updated.priceCurrency,
                }
              : item
          )
        );
        loadPriceRefreshStatus();
        // The server re-checks this record's pressings right after saving
        recheckTimers.current.push(
          setTimeout(refreshPricesQuietly, ALERT_PRICE_RECHECK_MS)
        );
      } catch (err) {
        showToast('error', getErrorMessage(err, 'Failed to save price alert'));
        throw err;
      }
    },
    [api, showToast, loadPriceRefreshStatus, refreshPricesQuietly]
  );

  const handleRemovePriceAlert = useCallback(
    async (masterId: number) => {
      try {
        await api.removeWishlistPriceAlert(masterId);
        setItems(prev =>
          prev.map(item =>
            item.masterId === masterId
              ? { ...item, priceAlert: undefined }
              : item
          )
        );
      } catch (err) {
        showToast(
          'error',
          getErrorMessage(err, 'Failed to remove price alert')
        );
        throw err;
      }
    },
    [api, showToast]
  );

  // Helper to create a cache key for play counts
  const getPlayCountKey = useCallback(
    (artist: string, title: string): string => {
      return `${artist.toLowerCase()}|${title.toLowerCase()}`;
    },
    []
  );

  // Albums whose play counts were already requested. Without this, an album
  // the server returns no result for stays "uncached", and every cache
  // update would request it again in an endless loop.
  const requestedPlayCounts = useRef(new Set<string>());

  // Fetch play counts when scrobbles sort is selected
  const fetchPlayCounts = useCallback(
    async (albums: AlbumIdentifier[]) => {
      if (albums.length === 0) return;

      // Filter out albums we already have cached or asked for
      const uncachedAlbums = albums.filter(album => {
        const key = getPlayCountKey(album.artist, album.title);
        return !playCounts.has(key) && !requestedPlayCounts.current.has(key);
      });

      if (uncachedAlbums.length === 0) return;
      for (const album of uncachedAlbums) {
        requestedPlayCounts.current.add(
          getPlayCountKey(album.artist, album.title)
        );
      }

      try {
        setLoadingPlayCounts(true);
        const response = await api.getAlbumPlayCounts(uncachedAlbums);

        // Update the cache with new results
        if (response.results.length > 0) {
          setPlayCounts(prev => {
            const newMap = new Map(prev);
            for (const result of response.results) {
              newMap.set(getPlayCountKey(result.artist, result.title), result);
            }
            return newMap;
          });
        }
      } catch (err) {
        // Let a later render try these again
        for (const album of uncachedAlbums) {
          requestedPlayCounts.current.delete(
            getPlayCountKey(album.artist, album.title)
          );
        }
        logger.error('Error fetching play counts', err);
      } finally {
        setLoadingPlayCounts(false);
      }
    },
    [api, playCounts, getPlayCountKey]
  );

  // Fetch play counts eagerly on load for all wishlist items
  // Also include local monitored items when toggle is on
  useEffect(() => {
    const albums: AlbumIdentifier[] = [];

    // Add Discogs wishlist items
    for (const item of items) {
      albums.push({ artist: item.artist, title: item.title });
    }

    // Add local monitored items if toggle is on
    if (includeMonitored) {
      for (const item of localWantItems) {
        albums.push({ artist: item.artist, title: item.album });
      }
    }

    if (albums.length > 0) {
      fetchPlayCounts(albums);
    }
  }, [items, localWantItems, includeMonitored, fetchPlayCounts]);

  // Poll for sync status when syncing
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(async () => {
      try {
        const status = await api.getWishlistSyncStatus();
        setSyncStatus(status);

        if (status.status === 'completed' || status.status === 'error') {
          setIsPolling(false);
          // Reload data after sync completes
          if (status.status === 'completed') {
            const wishlistItems = await api.getWishlist();
            setItems(wishlistItems);
          }
        }
      } catch (err) {
        logger.error('Error polling sync status', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isPolling, api]);

  // Track if sync is starting (for immediate feedback)
  const [syncStarting, setSyncStarting] = useState(false);

  const handleSync = async (forceRefresh = false) => {
    try {
      setSyncStarting(true);
      setError(null);
      const result = await api.startWishlistSync(forceRefresh);
      setSyncStatus(result.status);
      setIsPolling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    } finally {
      setSyncStarting(false);
    }
  };

  // Helper to normalize artist/album for deduplication
  const normalizeForComparison = useCallback((str: string): string => {
    return str.toLowerCase().trim();
  }, []);

  // Create set of monitored album keys for deduplication and badge display
  const monitoredAlbumKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of localWantItems) {
      keys.add(
        `${normalizeForComparison(item.artist)}|${normalizeForComparison(item.album)}`
      );
    }
    return keys;
  }, [localWantItems, normalizeForComparison]);

  // Check if an item is also being monitored locally
  const isItemMonitored = useCallback(
    (artist: string, title: string): boolean => {
      return monitoredAlbumKeys.has(
        `${normalizeForComparison(artist)}|${normalizeForComparison(title)}`
      );
    },
    [monitoredAlbumKeys, normalizeForComparison]
  );

  // Case-insensitive artist/album match for the search box
  const matchesSearch = useCallback(
    (artist: string, album: string): boolean => {
      const query = normalizeForComparison(searchQuery);
      if (!query) return true;
      return (
        artist.toLowerCase().includes(query) ||
        album.toLowerCase().includes(query)
      );
    },
    [searchQuery, normalizeForComparison]
  );

  // Filter items based on active tab
  const filteredItems = useMemo(() => {
    // Start with Discogs wishlist items
    let filtered = [...items];

    // If includeMonitored is ON, merge in local want items that aren't already in Discogs
    if (includeMonitored && activeTab !== 'monitoring') {
      // Create set of existing Discogs items for deduplication
      const discogsKeys = new Set<string>();
      for (const item of items) {
        discogsKeys.add(
          `${normalizeForComparison(item.artist)}|${normalizeForComparison(item.title)}`
        );
      }

      // Convert local want items to wishlist-compatible format
      for (const localItem of localWantItems) {
        const key = `${normalizeForComparison(localItem.artist)}|${normalizeForComparison(localItem.album)}`;

        // Skip if already in Discogs (Discogs item will show with "Monitored" badge)
        if (discogsKeys.has(key)) continue;

        // Convert to EnrichedWishlistItem format
        // Use negative ID to ensure uniqueness from Discogs items (which have positive IDs)
        const uniqueId = -(localWantItems.indexOf(localItem) + 1);
        const converted: EnrichedWishlistItem = {
          id: uniqueId,
          masterId: localItem.masterId || 0,
          releaseId: 0,
          artist: localItem.artist,
          title: localItem.album,
          coverImage: localItem.coverImage,
          dateAdded: new Date(localItem.addedAt).toISOString(),
          vinylStatus: localItem.vinylStatus,
          vinylVersions: [],
          notes: '',
          rating: 0,
        };
        filtered.push(converted);
      }
    }

    switch (activeTab) {
      case 'vinyl':
        filtered = filtered.filter(item => item.vinylStatus === 'has_vinyl');
        break;
      case 'cd_only':
        filtered = filtered.filter(item => item.vinylStatus === 'cd_only');
        break;
      case 'affordable':
        if (settings) {
          // Only include items with price data (excludes most monitored items)
          filtered = filtered.filter(
            item =>
              item.vinylStatus === 'has_vinyl' &&
              item.lowestVinylPrice !== undefined &&
              (settings.priceThreshold === undefined ||
                item.lowestVinylPrice <= settings.priceThreshold)
          );
        }
        break;
      case 'price_alerts':
        filtered = filtered.filter(item => item.priceAlert);
        break;
    }

    filtered = filtered.filter(item => matchesSearch(item.artist, item.title));

    // Sort items
    switch (sortBy) {
      case 'date':
        filtered.sort(
          (a, b) =>
            new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
        );
        break;
      case 'price':
        filtered.sort((a, b) => {
          const priceA = a.lowestVinylPrice ?? Infinity;
          const priceB = b.lowestVinylPrice ?? Infinity;
          return priceA - priceB;
        });
        break;
      case 'artist':
        filtered.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case 'album':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'scrobbles':
        // Sort by play count (descending), with secondary sort by date added
        filtered.sort((a, b) => {
          const keyA = getPlayCountKey(a.artist, a.title);
          const keyB = getPlayCountKey(b.artist, b.title);
          const countA = playCounts.get(keyA)?.playCount ?? 0;
          const countB = playCounts.get(keyB)?.playCount ?? 0;

          // Primary: descending by play count
          if (countB !== countA) {
            return countB - countA;
          }
          // Secondary: descending by date added (stable sort)
          return (
            new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
          );
        });
        break;
    }

    // Price alerts tab: triggered alerts first, keeping the chosen order within
    if (activeTab === 'price_alerts') {
      filtered.sort(
        (a, b) =>
          Number(Boolean(b.priceAlert?.triggered)) -
          Number(Boolean(a.priceAlert?.triggered))
      );
    }

    return filtered;
  }, [
    items,
    localWantItems,
    activeTab,
    sortBy,
    settings,
    playCounts,
    getPlayCountKey,
    includeMonitored,
    normalizeForComparison,
    matchesSearch,
  ]);

  const filteredLocalWantItems = useMemo(
    () => localWantItems.filter(item => matchesSearch(item.artist, item.album)),
    [localWantItems, matchesSearch]
  );

  // Tab counts
  const tabCounts = useMemo(() => {
    const vinylCount = items.filter(i => i.vinylStatus === 'has_vinyl').length;
    const cdCount = items.filter(i => i.vinylStatus === 'cd_only').length;
    const affordableCount = settings
      ? items.filter(
          i =>
            i.vinylStatus === 'has_vinyl' &&
            i.lowestVinylPrice !== undefined &&
            (settings.priceThreshold === undefined ||
              i.lowestVinylPrice <= settings.priceThreshold)
        ).length
      : 0;

    return {
      all: items.length,
      vinyl: vinylCount,
      cd_only: cdCount,
      affordable: affordableCount,
      monitoring: localWantItems.length,
      priceAlerts: items.filter(i => i.priceAlert).length,
      priceAlertsTriggered: items.filter(i => i.priceAlert?.triggered).length,
    };
  }, [items, settings, localWantItems]);

  // Open versions modal
  const openVersionsModal = async (item: EnrichedWishlistItem) => {
    setVersionsModal({
      isOpen: true,
      item,
      versions: item.vinylVersions || [],
      loading: item.vinylVersions.length === 0,
    });

    // Fetch versions if not already loaded
    if (item.vinylVersions.length === 0 && item.masterId) {
      try {
        const { versions } = await api.getMasterVersions(item.masterId);
        setVersionsModal(prev => ({
          ...prev,
          versions,
          loading: false,
        }));
      } catch (err) {
        logger.error('Error loading versions', err);
        setVersionsModal(prev => ({ ...prev, loading: false }));
      }
    }
  };

  const closeVersionsModal = () => {
    setVersionsModal({
      isOpen: false,
      item: null,
      versions: [],
      loading: false,
    });
  };

  // Check local want list for vinyl availability
  const handleCheckLocalVinyl = async () => {
    try {
      setCheckingLocalVinyl(true);
      const newlyAvailable = await api.checkLocalWantListForVinyl();

      // Reload local want list to get updated statuses
      const updatedItems = await api.getLocalWantList();
      setLocalWantItems(updatedItems);

      // Create notifications for newly available vinyl
      for (const item of newlyAvailable) {
        addNotification(
          createSuccessNotification(
            'Vinyl Now Available!',
            `${item.artist} - ${item.album} now has vinyl pressings available`,
            {
              label: 'View',
              route: '/marketplace?tab=wishlist',
            }
          )
        );
      }

      if (newlyAvailable.length > 0) {
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to check vinyl availability'
      );
    } finally {
      setCheckingLocalVinyl(false);
    }
  };

  // Remove item from local want list
  const handleRemoveFromLocalWant = async (id: string) => {
    try {
      await api.removeFromLocalWantList(id);
      setLocalWantItems(prev => prev.filter(item => item.id !== id));
    } catch (err) {
      logger.error('Error removing from local want list', err);
    }
  };

  // Open Discogs marketplace
  const openDiscogsMarketplace = (item: EnrichedWishlistItem) => {
    const url = `https://www.discogs.com/sell/list?master_id=${item.masterId}&format=Vinyl`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  // Format price
  const formatPrice = (
    price: number | undefined,
    currency: string | undefined
  ): string => {
    if (price === undefined) return 'N/A';
    const currencySymbol =
      currency === 'USD'
        ? '$'
        : currency === 'EUR'
          ? '€'
          : currency === 'GBP'
            ? '£'
            : currency || '$';
    return `${currencySymbol}${price.toFixed(2)}`;
  };

  // Get vinyl status badge
  const getStatusBadge = (status: VinylStatus) => {
    switch (status) {
      case 'has_vinyl':
        return (
          <span className='wishlist-badge wishlist-badge-vinyl'>Vinyl</span>
        );
      case 'cd_only':
        return (
          <span className='wishlist-badge wishlist-badge-cd'>CD Only</span>
        );
      case 'checking':
        return (
          <span className='wishlist-badge wishlist-badge-checking'>
            Checking...
          </span>
        );
      case 'unknown':
      default:
        return (
          <span className='wishlist-badge wishlist-badge-unknown'>Unknown</span>
        );
    }
  };

  if (!authStatus.discogs.authenticated && !embedded) {
    return (
      <div className='page'>
        <div className='page-header'>
          <h2>Wishlist</h2>
        </div>
        <div className='card'>
          <p className='text-secondary'>
            Please connect to Discogs to view your wishlist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'wishlist-embedded' : 'page'}>
      {!embedded && (
        <div className='page-header'>
          <h2>Wishlist</h2>
          <div className='page-header-actions'>
            <Button
              onClick={() => handleSync(false)}
              disabled={
                syncStarting ||
                syncStatus?.status === 'syncing' ||
                syncStatus?.status === 'checking_vinyl'
              }
            >
              {syncStarting
                ? 'Starting...'
                : syncStatus?.status === 'syncing' ||
                    syncStatus?.status === 'checking_vinyl'
                  ? 'Syncing...'
                  : 'Sync Wishlist'}
            </Button>
            <Button
              variant='secondary'
              onClick={() => handleSync(true)}
              disabled={
                syncStarting ||
                syncStatus?.status === 'syncing' ||
                syncStatus?.status === 'checking_vinyl'
              }
              title='Re-check vinyl availability for all items (slower, makes more API calls)'
            >
              Refresh All
            </Button>
          </div>
        </div>
      )}
      {embedded && (
        <div className='wishlist-actions'>
          <Button
            onClick={() => handleSync(false)}
            disabled={
              syncStarting ||
              syncStatus?.status === 'syncing' ||
              syncStatus?.status === 'checking_vinyl'
            }
          >
            {syncStarting
              ? 'Starting...'
              : syncStatus?.status === 'syncing' ||
                  syncStatus?.status === 'checking_vinyl'
                ? 'Syncing...'
                : 'Sync Wishlist'}
          </Button>
          <Button
            variant='secondary'
            onClick={() => handleSync(true)}
            disabled={
              syncStarting ||
              syncStatus?.status === 'syncing' ||
              syncStatus?.status === 'checking_vinyl'
            }
            title='Re-check vinyl availability for all items (slower, makes more API calls)'
          >
            Refresh All
          </Button>
        </div>
      )}

      {/* Sync Status Bar */}
      {(syncStarting ||
        syncStatus?.status === 'syncing' ||
        syncStatus?.status === 'checking_vinyl') && (
        <div className='sync-status-bar'>
          <div className='sync-status-info'>
            <span className='sync-status-text'>
              {syncStarting
                ? 'Starting sync...'
                : syncStatus?.status === 'syncing'
                  ? 'Syncing wishlist...'
                  : 'Checking vinyl availability...'}
            </span>
            {syncStatus?.currentItem && (
              <span className='sync-status-current'>
                {syncStatus.currentItem}
              </span>
            )}
          </div>
          {!syncStarting && syncStatus && (
            <>
              <ProgressBar
                value={syncStatus.progress}
                size='small'
                showLabel
                animated
              />
            </>
          )}
          {syncStarting && (
            <Skeleton
              variant='circular'
              width={20}
              height={20}
              animation='pulse'
            />
          )}
        </div>
      )}

      {/* Last Sync Info */}
      {syncStatus?.lastSyncTimestamp && syncStatus.status !== 'syncing' && (
        <div className='wishlist-sync-info'>
          Last synced: {new Date(syncStatus.lastSyncTimestamp).toLocaleString()}
          {' • '}
          {items.length} items{' • '}
          {tabCounts.vinyl} with vinyl
        </div>
      )}

      {priceRefreshStatus &&
        (priceRefreshStatus.pressingsUnchecked > 0 ||
          priceRefreshStatus.lastCheckedAt !== undefined) && (
          <div className='wishlist-price-refresh-status'>
            {priceRefreshStatus.pressingsUnchecked > 0 ? (
              <span>
                Checking prices in the background:{' '}
                {(
                  priceRefreshStatus.pressingsTotal -
                  priceRefreshStatus.pressingsUnchecked
                ).toLocaleString()}{' '}
                of {priceRefreshStatus.pressingsTotal.toLocaleString()}{' '}
                pressings checked
              </span>
            ) : (
              <span>
                Prices of {priceRefreshStatus.pressingsTotal.toLocaleString()}{' '}
                pressings are rechecked every 12 hours (every 6 for records with
                an alert)
              </span>
            )}
            {priceRefreshStatus.lastCheckedAt !== undefined && (
              <span>
                {' '}
                · last check{' '}
                {formatCheckedAgo(priceRefreshStatus.lastCheckedAt)}
              </span>
            )}
          </div>
        )}

      {error && <div className='error-message'>{error}</div>}

      {/* Tabs */}
      <div className='tabs'>
        {(
          [
            'all',
            'vinyl',
            'cd_only',
            'affordable',
            'price_alerts',
            'monitoring',
            'new_releases',
          ] as TabType[]
        ).map(tab => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' && `All (${tabCounts.all})`}
            {tab === 'vinyl' && `Has Vinyl (${tabCounts.vinyl})`}
            {tab === 'cd_only' && `CD Only (${tabCounts.cd_only})`}
            {tab === 'affordable' && `Affordable (${tabCounts.affordable})`}
            {tab === 'price_alerts' &&
              (tabCounts.priceAlertsTriggered > 0
                ? `Price alerts (${tabCounts.priceAlertsTriggered})`
                : 'Price alerts')}
            {tab === 'monitoring' && `Monitoring (${tabCounts.monitoring})`}
            {tab === 'new_releases' && (
              <>
                New Releases
                {newReleasesCount > 0 && (
                  <span className='tab-badge'>{newReleasesCount}</span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      {/* Search - applies to all tabs except New Releases */}
      {activeTab !== 'new_releases' && (
        <div className='wishlist-search search-input-wrapper'>
          <Search
            size={16}
            className='wishlist-search-icon'
            aria-hidden='true'
          />
          <input
            type='search'
            className='search-input wishlist-search-input'
            placeholder='Search artist or album...'
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label='Search wishlist'
          />
          {searchQuery && (
            <button
              type='button'
              className='wishlist-search-clear'
              onClick={() => setSearchQuery('')}
              aria-label='Clear search'
            >
              <X size={16} aria-hidden='true' />
            </button>
          )}
        </div>
      )}

      {/* Sort Options - hide for Monitoring and New Releases tabs */}
      {activeTab !== 'monitoring' && activeTab !== 'new_releases' && (
        <div className='wishlist-sort'>
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className='form-select'
          >
            <option value='date'>Date Added</option>
            <option value='scrobbles'>Scrobbles (Most Played)</option>
            <option value='price'>Price (Low to High)</option>
            <option value='artist'>Artist</option>
            <option value='album'>Album</option>
          </select>
          {sortBy === 'scrobbles' && loadingPlayCounts && (
            <span className='wishlist-sort-loading'>
              Loading play counts...
            </span>
          )}

          {/* Include Monitored toggle (Phase 2) */}
          {localWantItems.length > 0 && (
            <label className='wishlist-toggle'>
              <input
                type='checkbox'
                checked={includeMonitored}
                onChange={e => setIncludeMonitored(e.target.checked)}
              />
              <span>Include monitored ({localWantItems.length})</span>
            </label>
          )}
        </div>
      )}

      {/* New Releases Tab (Feature 5.5) */}
      {activeTab === 'new_releases' ? (
        <NewReleasesTab onCountChange={setNewReleasesCount} />
      ) : /* Monitoring Tab - Monitored Albums */
      activeTab === 'monitoring' ? (
        <>
          <div className='monitoring-actions'>
            <Button
              onClick={handleCheckLocalVinyl}
              disabled={checkingLocalVinyl || localWantItems.length === 0}
            >
              {checkingLocalVinyl ? 'Checking...' : 'Check for Vinyl'}
            </Button>
            <span className='monitoring-info'>
              Albums added from Discovery page. Click "Check for Vinyl" to see
              if any are now available on vinyl.
            </span>
          </div>
          {checkingLocalVinyl && (
            <div className='monitoring-check-progress'>
              <span className='monitoring-check-text'>
                Checking vinyl availability...
              </span>
              <ProgressBar value={0} indeterminate size='small' animated />
            </div>
          )}
          {loading ? (
            <AlbumCardSkeleton count={4} />
          ) : localWantItems.length === 0 ? (
            <div className='empty-state'>
              <p>
                No albums being monitored. Use Discovery to find albums to
                monitor for vinyl availability.
              </p>
            </div>
          ) : filteredLocalWantItems.length === 0 ? (
            <div className='empty-state'>
              <p>No monitored albums match your search.</p>
            </div>
          ) : (
            <div className='wishlist-grid'>
              {filteredLocalWantItems.map(item => (
                <div
                  key={item.id}
                  className={`wishlist-card ${item.vinylStatus === 'has_vinyl' ? 'wishlist-card-highlight' : ''}`}
                >
                  <div className='wishlist-card-image'>
                    {item.coverImage ? (
                      <img src={item.coverImage} alt={item.album} />
                    ) : (
                      <div className='wishlist-card-placeholder'>No Image</div>
                    )}
                    {getStatusBadge(item.vinylStatus)}
                  </div>
                  <div className='wishlist-card-content'>
                    <h4 className='wishlist-card-title'>{item.album}</h4>
                    <p className='wishlist-card-artist'>{item.artist}</p>
                    <div className='wishlist-card-meta'>
                      <span className='wishlist-card-date'>
                        Added: {new Date(item.addedAt).toLocaleDateString()}
                      </span>
                      {item.playCount > 0 && (
                        <span className='wishlist-card-plays'>
                          {item.playCount} plays
                        </span>
                      )}
                    </div>
                    {item.lastChecked && (
                      <div className='wishlist-card-checked'>
                        Last checked:{' '}
                        {new Date(item.lastChecked).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className='wishlist-card-actions'>
                    {item.vinylStatus === 'has_vinyl' && item.masterId && (
                      <Button
                        size='small'
                        onClick={() => {
                          const url = `https://www.discogs.com/sell/list?master_id=${item.masterId}&format=Vinyl`;
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                        title='Browse vinyl on Discogs Marketplace'
                      >
                        Shop
                      </Button>
                    )}
                    <Button
                      variant='danger'
                      size='small'
                      onClick={() => handleRemoveFromLocalWant(item.id)}
                      title='Stop monitoring this album'
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Regular Wishlist Items */
        <>
          {loading ? (
            <AlbumCardSkeleton count={6} />
          ) : activeTab === 'price_alerts' && tabCounts.priceAlerts === 0 ? (
            <div className='empty-state'>
              <p>
                No price alerts yet. On any record in the All tab, enter the
                most you would pay in the &quot;Alert at…&quot; box and choose
                Set alert. You will be notified when any vinyl pressing is
                listed at or below that price.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className='empty-state'>
              <p>
                {items.length === 0
                  ? 'Your wishlist is empty. Sync to load items from Discogs.'
                  : searchQuery.trim()
                    ? 'No items match your search.'
                    : 'No items match the current filter.'}
              </p>
            </div>
          ) : (
            <div className='wishlist-grid'>
              {filteredItems.map(item => (
                <WishlistItemCard
                  key={item.id}
                  item={item}
                  isMonitored={isItemMonitored(item.artist, item.title)}
                  getStatusBadge={getStatusBadge}
                  formatDate={formatDate}
                  formatPrice={formatPrice}
                  playCount={playCounts.get(
                    getPlayCountKey(item.artist, item.title)
                  )}
                  onOpenVersions={openVersionsModal}
                  onOpenMarketplace={openDiscogsMarketplace}
                  className={
                    item.priceAlert?.triggered
                      ? 'wishlist-card-price-triggered'
                      : undefined
                  }
                  footer={
                    // Discogs wantlist records only (merged monitored items have negative IDs)
                    item.id > 0 && item.masterId > 0 ? (
                      <WishlistPriceAlert
                        item={item}
                        currency={settings?.currency ?? 'USD'}
                        onSave={handleSavePriceAlert}
                        onRemove={handleRemovePriceAlert}
                      />
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Versions Modal */}
      {versionsModal.item && (
        <Modal
          isOpen={versionsModal.isOpen}
          onClose={closeVersionsModal}
          title={`${versionsModal.item.artist} - ${versionsModal.item.title}`}
          size='large'
          loading={versionsModal.loading}
        >
          {versionsModal.loading ? (
            <table className='versions-table'>
              <tbody>
                <TableRowSkeleton count={5} columns={4} />
              </tbody>
            </table>
          ) : versionsModal.versions.length === 0 ? (
            <p className='text-secondary'>No versions found.</p>
          ) : (
            <div className='versions-table-wrapper'>
              <table className='versions-table'>
                <thead>
                  <tr>
                    <th>Format</th>
                    <th>Label</th>
                    <th>Country</th>
                    <th>Year</th>
                    <th>Vinyl</th>
                    <th>Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versionsModal.versions.map(version => (
                    <tr
                      key={version.releaseId}
                      className={version.hasVinyl ? 'version-vinyl' : ''}
                    >
                      <td>{version.format.join(', ')}</td>
                      <td>{version.label}</td>
                      <td>{version.country}</td>
                      <td>{version.year || 'N/A'}</td>
                      <td>
                        {version.hasVinyl ? (
                          <span className='version-vinyl-yes'>Yes</span>
                        ) : (
                          <span className='version-vinyl-no'>No</span>
                        )}
                      </td>
                      <td>
                        {version.marketplaceStats?.lowestPrice
                          ? formatPrice(
                              version.marketplaceStats.lowestPrice,
                              version.marketplaceStats.currency
                            )
                          : 'N/A'}
                      </td>
                      <td>
                        <Button
                          variant='secondary'
                          size='small'
                          onClick={() =>
                            window.open(
                              `https://www.discogs.com/release/${version.releaseId}`,
                              '_blank'
                            )
                          }
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default WishlistPage;
