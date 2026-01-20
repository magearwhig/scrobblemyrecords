import React, { useEffect, useState, useCallback, useMemo } from 'react';

import {
  AlbumIdentifier,
  AlbumPlayCountResult,
  EnrichedWishlistItem,
  LocalWantItem,
  ReleaseVersion,
  WishlistSettings,
  WishlistSyncStatus,
  VinylStatus,
} from '../../shared/types';
import { Modal } from '../components/ui';
import { NewReleasesTab } from '../components/wishlist/NewReleasesTab';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  useNotifications,
  createSuccessNotification,
} from '../hooks/useNotifications';
import { getApiService } from '../services/api';

type TabType =
  | 'all'
  | 'vinyl'
  | 'cd_only'
  | 'affordable'
  | 'monitoring'
  | 'new_releases';
type SortOption = 'date' | 'price' | 'artist' | 'album' | 'scrobbles';

interface VersionsModalState {
  isOpen: boolean;
  item: EnrichedWishlistItem | null;
  versions: ReleaseVersion[];
  loading: boolean;
}

const WishlistPage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const { addNotification } = useNotifications();
  const [items, setItems] = useState<EnrichedWishlistItem[]>([]);
  const [localWantItems, setLocalWantItems] = useState<LocalWantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<WishlistSyncStatus | null>(null);
  const [settings, setSettings] = useState<WishlistSettings | null>(null);

  // Tab and sorting state
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');

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
        console.error('Error fetching play counts:', err);
      } finally {
        setLoadingPlayCounts(false);
      }
    },
    [api, playCounts, getPlayCountKey]
  );

  // Fetch play counts when sorting by scrobbles
  // Include both Discogs items and local monitored items when toggle is on
  useEffect(() => {
    if (sortBy === 'scrobbles') {
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
    }
  }, [sortBy, items, localWantItems, includeMonitored, fetchPlayCounts]);

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
        console.error('Error polling sync status:', err);
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
    }

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
  ]);

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
        console.error('Error loading versions:', err);
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
              route: '/wishlist',
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
      console.error('Error removing from local want list:', err);
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

  if (!authStatus.discogs.authenticated) {
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
    <div className='page'>
      <div className='page-header'>
        <h2>Wishlist</h2>
        <div className='page-header-actions'>
          <button
            className='btn btn-primary'
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
          </button>
          <button
            className='btn btn-secondary'
            onClick={() => handleSync(true)}
            disabled={
              syncStarting ||
              syncStatus?.status === 'syncing' ||
              syncStatus?.status === 'checking_vinyl'
            }
            title='Re-check vinyl availability for all items (slower, makes more API calls)'
          >
            Refresh All
          </button>
        </div>
      </div>

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
              <div className='sync-progress-bar'>
                <div
                  className='sync-progress-fill'
                  style={{ width: `${syncStatus.progress}%` }}
                />
              </div>
              <span className='sync-progress-text'>
                {Math.round(syncStatus.progress)}%
              </span>
            </>
          )}
          {syncStarting && (
            <div
              className='spinner'
              style={{ width: '20px', height: '20px' }}
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

      {error && <div className='error-message'>{error}</div>}

      {/* Tabs */}
      <div className='tabs'>
        {(
          [
            'all',
            'vinyl',
            'cd_only',
            'affordable',
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
            <button
              className='btn btn-primary'
              onClick={handleCheckLocalVinyl}
              disabled={checkingLocalVinyl || localWantItems.length === 0}
            >
              {checkingLocalVinyl ? 'Checking...' : 'Check for Vinyl'}
            </button>
            <span className='monitoring-info'>
              Albums added from Discovery page. Click "Check for Vinyl" to see
              if any are now available on vinyl.
            </span>
          </div>
          {loading ? (
            <div className='loading-spinner'>Loading monitored albums...</div>
          ) : localWantItems.length === 0 ? (
            <div className='empty-state'>
              <p>
                No albums being monitored. Use Discovery to find albums to
                monitor for vinyl availability.
              </p>
            </div>
          ) : (
            <div className='wishlist-grid'>
              {localWantItems.map(item => (
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
                      <button
                        className='btn btn-small btn-primary'
                        onClick={() => {
                          const url = `https://www.discogs.com/sell/list?master_id=${item.masterId}&format=Vinyl`;
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                        title='Browse vinyl on Discogs Marketplace'
                      >
                        Shop
                      </button>
                    )}
                    <button
                      className='btn btn-small btn-danger'
                      onClick={() => handleRemoveFromLocalWant(item.id)}
                      title='Stop monitoring this album'
                    >
                      Remove
                    </button>
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
            <div className='loading-spinner'>Loading wishlist...</div>
          ) : filteredItems.length === 0 ? (
            <div className='empty-state'>
              <p>
                {items.length === 0
                  ? 'Your wishlist is empty. Sync to load items from Discogs.'
                  : 'No items match the current filter.'}
              </p>
            </div>
          ) : (
            <div className='wishlist-grid'>
              {filteredItems.map(item => (
                <div key={item.id} className='wishlist-card'>
                  <div className='wishlist-card-image'>
                    {item.coverImage ? (
                      <img src={item.coverImage} alt={item.title} />
                    ) : (
                      <div className='wishlist-card-placeholder'>No Image</div>
                    )}
                    {getStatusBadge(item.vinylStatus)}
                    {isItemMonitored(item.artist, item.title) && (
                      <span className='wishlist-badge wishlist-badge-monitored'>
                        Monitored
                      </span>
                    )}
                  </div>
                  <div className='wishlist-card-content'>
                    <h4 className='wishlist-card-title'>{item.title}</h4>
                    <p className='wishlist-card-artist'>{item.artist}</p>
                    {item.year && (
                      <p className='wishlist-card-year'>{item.year}</p>
                    )}
                    <div className='wishlist-card-meta'>
                      <span className='wishlist-card-date'>
                        Added: {formatDate(item.dateAdded)}
                      </span>
                      {item.lowestVinylPrice !== undefined && (
                        <span className='wishlist-card-price'>
                          From:{' '}
                          {formatPrice(
                            item.lowestVinylPrice,
                            item.priceCurrency
                          )}
                        </span>
                      )}
                      {sortBy === 'scrobbles' &&
                        (playCounts.get(
                          getPlayCountKey(item.artist, item.title)
                        )?.playCount ?? 0) > 0 && (
                          <span className='wishlist-card-plays'>
                            {
                              playCounts.get(
                                getPlayCountKey(item.artist, item.title)
                              )?.playCount
                            }{' '}
                            plays
                          </span>
                        )}
                    </div>
                  </div>
                  <div className='wishlist-card-actions'>
                    <button
                      className='btn btn-small btn-secondary'
                      onClick={() => openVersionsModal(item)}
                      title='View all versions/pressings'
                    >
                      Versions
                    </button>
                    {item.vinylStatus === 'has_vinyl' && (
                      <button
                        className='btn btn-small btn-primary'
                        onClick={() => openDiscogsMarketplace(item)}
                        title='Browse vinyl on Discogs Marketplace'
                      >
                        Shop
                      </button>
                    )}
                  </div>
                </div>
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
            <div className='loading-spinner'>Loading versions...</div>
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
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() =>
                            window.open(
                              `https://www.discogs.com/release/${version.releaseId}`,
                              '_blank'
                            )
                          }
                        >
                          View
                        </button>
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
