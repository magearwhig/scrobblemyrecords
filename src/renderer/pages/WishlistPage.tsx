import React, { useEffect, useState, useCallback, useMemo } from 'react';

import {
  EnrichedWishlistItem,
  LocalWantItem,
  ReleaseVersion,
  WishlistSettings,
  WishlistSyncStatus,
  VinylStatus,
} from '../../shared/types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  useNotifications,
  createSuccessNotification,
} from '../hooks/useNotifications';
import { getApiService } from '../services/api';

type TabType = 'all' | 'vinyl' | 'cd_only' | 'affordable' | 'wanted';
type SortOption = 'date' | 'price' | 'artist' | 'album';

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

  // Local want list vinyl check state
  const [checkingLocalVinyl, setCheckingLocalVinyl] = useState(false);

  // Versions modal state
  const [versionsModal, setVersionsModal] = useState<VersionsModalState>({
    isOpen: false,
    item: null,
    versions: [],
    loading: false,
  });

  // Polling for sync status
  const [isPolling, setIsPolling] = useState(false);

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

  // Filter items based on active tab
  const filteredItems = useMemo(() => {
    let filtered = [...items];

    switch (activeTab) {
      case 'vinyl':
        filtered = filtered.filter(item => item.vinylStatus === 'has_vinyl');
        break;
      case 'cd_only':
        filtered = filtered.filter(item => item.vinylStatus === 'cd_only');
        break;
      case 'affordable':
        if (settings) {
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
    }

    return filtered;
  }, [items, activeTab, sortBy, settings]);

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
      wanted: localWantItems.length,
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

  // Add to vinyl watch list
  const handleAddToWatch = async (item: EnrichedWishlistItem) => {
    try {
      await api.addToVinylWatch({
        masterId: item.masterId,
        artist: item.artist,
        title: item.title,
        coverImage: item.coverImage,
      });
      // Could show a success notification here
    } catch (err) {
      console.error('Error adding to watch list:', err);
    }
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
        {(['all', 'vinyl', 'cd_only', 'affordable', 'wanted'] as TabType[]).map(
          tab => (
            <button
              key={tab}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'all' && `All (${tabCounts.all})`}
              {tab === 'vinyl' && `Has Vinyl (${tabCounts.vinyl})`}
              {tab === 'cd_only' && `CD Only (${tabCounts.cd_only})`}
              {tab === 'affordable' && `Affordable (${tabCounts.affordable})`}
              {tab === 'wanted' && `Wanted (${tabCounts.wanted})`}
            </button>
          )
        )}
      </div>

      {/* Sort Options - hide for Wanted tab */}
      {activeTab !== 'wanted' && (
        <div className='wishlist-sort'>
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className='form-select'
          >
            <option value='date'>Date Added</option>
            <option value='price'>Price (Low to High)</option>
            <option value='artist'>Artist</option>
            <option value='album'>Album</option>
          </select>
        </div>
      )}

      {/* Wanted Tab - Local Want List */}
      {activeTab === 'wanted' ? (
        <>
          <div className='wanted-actions'>
            <button
              className='btn btn-primary'
              onClick={handleCheckLocalVinyl}
              disabled={checkingLocalVinyl || localWantItems.length === 0}
            >
              {checkingLocalVinyl ? 'Checking...' : 'Check for Vinyl'}
            </button>
            <span className='wanted-info'>
              Albums added from Discovery page. Click "Check for Vinyl" to see
              if any are now available on vinyl.
            </span>
          </div>
          {loading ? (
            <div className='loading-spinner'>Loading wanted list...</div>
          ) : localWantItems.length === 0 ? (
            <div className='empty-state'>
              <p>
                Your wanted list is empty. Add albums from the Discovery page to
                track them for vinyl availability.
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
                      title='Remove from wanted list'
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
                    {item.vinylStatus === 'cd_only' && (
                      <button
                        className='btn btn-small btn-secondary'
                        onClick={() => handleAddToWatch(item)}
                        title='Watch for vinyl availability'
                      >
                        Watch
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
      {versionsModal.isOpen && versionsModal.item && (
        <div className='modal-overlay' onClick={closeVersionsModal}>
          <div className='modal modal-large' onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>
                {versionsModal.item.artist} - {versionsModal.item.title}
              </h3>
              <button className='modal-close' onClick={closeVersionsModal}>
                ×
              </button>
            </div>
            <div className='modal-content'>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
