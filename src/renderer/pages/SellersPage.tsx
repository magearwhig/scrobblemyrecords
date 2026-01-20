import React, { useState, useEffect, useCallback } from 'react';

import { MonitoredSeller, SellerScanStatus } from '../../shared/types';
import { Modal, ModalFooter } from '../components/ui';
import { useApp } from '../context/AppContext';
import {
  useNotifications,
  createSuccessNotification,
  createInfoNotification,
} from '../hooks/useNotifications';
import { getApiService } from '../services/api';

const SellersPage: React.FC = () => {
  const { state } = useApp();
  const { addNotification } = useNotifications();
  const api = getApiService(state.serverUrl);

  // State
  const [sellers, setSellers] = useState<MonitoredSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<SellerScanStatus | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newSellerUsername, setNewSellerUsername] = useState('');
  const [newSellerDisplayName, setNewSellerDisplayName] = useState('');
  const [addingInProgress, setAddingInProgress] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingUsername, setRemovingUsername] = useState<string | null>(null);

  // Wishlist check
  const [wishlistEmpty, setWishlistEmpty] = useState(false);
  const [checkingWishlist, setCheckingWishlist] = useState(true);

  // Cache stats
  const [cacheStats, setCacheStats] = useState<{
    totalReleases: number;
    totalMasters: number;
    lastUpdated: number;
    staleMasters: number;
  } | null>(null);
  const [refreshingCache, setRefreshingCache] = useState(false);

  // Load sellers
  const loadSellers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [sellersData, statusData, cacheStatsData] = await Promise.all([
        api.getSellers(),
        api.getSellerScanStatus(),
        api.getReleaseCacheStats(),
      ]);
      setSellers(sellersData);
      setScanStatus(statusData);
      setCacheStats(cacheStatsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sellers');
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Check wishlist for dependency
  const checkWishlist = useCallback(async () => {
    try {
      setCheckingWishlist(true);
      const [wishlist, localWant] = await Promise.all([
        api.getWishlist(),
        api.getLocalWantList(),
      ]);
      setWishlistEmpty(wishlist.length === 0 && localWant.length === 0);
    } catch {
      // If we can't check, assume it's not empty
      setWishlistEmpty(false);
    } finally {
      setCheckingWishlist(false);
    }
  }, [api]);

  // Initial load
  useEffect(() => {
    loadSellers();
    checkWishlist();
  }, [loadSellers, checkWishlist]);

  // Poll scan status while scanning or matching
  useEffect(() => {
    if (
      scanStatus?.status === 'scanning' ||
      scanStatus?.status === 'matching'
    ) {
      const interval = setInterval(async () => {
        try {
          const status = await api.getSellerScanStatus();
          setScanStatus(status);

          // If scan completed, reload sellers to get updated counts
          if (status.status === 'completed' || status.status === 'error') {
            loadSellers();

            // Check for new matches to notify
            if (status.status === 'completed' && status.newMatches > 0) {
              // Check if notifications are enabled in settings
              const settings = await api.getSellerSettings();
              if (!settings.notifyOnNewMatch) {
                // Notifications disabled - skip notification creation
                return;
              }

              // Load matches and create notifications for unnotified ones
              const matches = await api.getSellerMatches();
              const unnotified = matches.filter(
                m => !m.notified && m.status === 'active'
              );

              // Create notifications for up to 5 matches
              const toNotify = unnotified.slice(0, 5);
              for (const match of toNotify) {
                const seller = sellers.find(
                  s => s.username.toLowerCase() === match.sellerId.toLowerCase()
                );
                const sellerName = seller?.displayName || match.sellerId;

                addNotification(
                  createSuccessNotification(
                    'Wishlist item at local seller!',
                    `${match.artist} - ${match.title} at ${sellerName} for ${formatPrice(match.price, match.currency)}`,
                    {
                      label: 'View',
                      route: 'seller-matches',
                    }
                  )
                );
              }

              // If more than 5, add a summary notification
              if (unnotified.length > 5) {
                addNotification(
                  createInfoNotification(
                    `+${unnotified.length - 5} more matches`,
                    'View all matches on the Seller Matches page',
                    {
                      label: 'View All',
                      route: 'seller-matches',
                    }
                  )
                );
              }

              // Mark ALL unnotified matches as notified (not just the 5 we showed)
              // This prevents them from accumulating forever
              for (const match of unnotified) {
                await api.markMatchAsNotified(match.id);
              }
            }
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [scanStatus?.status, api, loadSellers, addNotification, sellers]);

  // Handle add seller
  const handleAddSeller = async () => {
    if (!newSellerUsername.trim()) {
      setAddError('Username is required');
      return;
    }

    try {
      setAddingInProgress(true);
      setAddError(null);
      await api.addSeller(
        newSellerUsername.trim(),
        newSellerDisplayName.trim() || undefined
      );
      setAddDialogOpen(false);
      setNewSellerUsername('');
      setNewSellerDisplayName('');
      loadSellers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add seller');
    } finally {
      setAddingInProgress(false);
    }
  };

  // Handle remove seller
  const handleRemoveSeller = async (username: string) => {
    if (
      !window.confirm(
        `Remove ${username} from monitoring? This will also delete all matches for this seller.`
      )
    ) {
      return;
    }

    try {
      setRemovingUsername(username);
      await api.removeSeller(username);
      loadSellers();
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Failed to remove seller'
      );
    } finally {
      setRemovingUsername(null);
    }
  };

  // Handle trigger scan
  const handleTriggerScan = async (forceFresh = false) => {
    try {
      // If cache is empty, auto-refresh it first
      if (cacheStats && cacheStats.totalMasters === 0) {
        setRefreshingCache(true);
        try {
          await api.refreshReleaseCache();
          // Reload cache stats after refresh
          const newStats = await api.getReleaseCacheStats();
          setCacheStats(newStats);
        } finally {
          setRefreshingCache(false);
        }
      }

      const status = await api.triggerSellerScan(forceFresh);
      setScanStatus(status);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Failed to start scan');
    }
  };

  // Handle refresh cache
  const handleRefreshCache = async () => {
    try {
      setRefreshingCache(true);
      const result = await api.refreshReleaseCache();
      addNotification(
        createSuccessNotification(
          'Master/Release Cache Refreshed',
          `Processed ${result.mastersProcessed} masters, added ${result.releasesAdded} releases`
        )
      );
      // Reload cache stats
      const newStats = await api.getReleaseCacheStats();
      setCacheStats(newStats);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Failed to refresh cache'
      );
    } finally {
      setRefreshingCache(false);
    }
  };

  // Format price
  const formatPrice = (price: number, currency: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(price);
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  // Loading state
  if (loading || checkingWishlist) {
    return (
      <div className='sellers-page'>
        <h1>Local Sellers</h1>
        <div className='loading-container'>
          <div className='spinner'></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className='sellers-page'>
        <h1>Local Sellers</h1>
        <div className='error-state'>
          <p>{error}</p>
          <button className='btn' onClick={loadSellers}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Wishlist dependency check
  if (wishlistEmpty) {
    return (
      <div className='sellers-page'>
        <h1>Local Sellers</h1>
        <div className='card'>
          <div className='empty-state'>
            <h2>Sync Wishlist First</h2>
            <p>
              You need items in your Discogs wishlist or local want list before
              scanning seller inventories.
            </p>
            <button
              className='btn'
              onClick={() => {
                window.location.hash = 'wishlist';
              }}
            >
              Go to Wishlist
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='sellers-page'>
      <h1>Local Sellers</h1>
      <p className='page-description'>
        Track inventories of local record shops for wishlist items.
      </p>

      {/* Header actions */}
      <div className='sellers-header'>
        <button className='btn' onClick={() => setAddDialogOpen(true)}>
          + Add Seller
        </button>
        <div className='sellers-scan-buttons'>
          <button
            className='btn btn-secondary'
            onClick={() => handleTriggerScan(false)}
            disabled={
              scanStatus?.status === 'scanning' ||
              scanStatus?.status === 'matching' ||
              sellers.length === 0 ||
              refreshingCache
            }
            title='Uses cached inventory, only fetches new listings from API'
          >
            {refreshingCache
              ? 'Preparing Cache...'
              : scanStatus?.status === 'scanning' ||
                  scanStatus?.status === 'matching'
                ? 'Scanning...'
                : 'Check for New'}
          </button>
          <button
            className='btn btn-outline btn-small'
            onClick={() => handleTriggerScan(true)}
            disabled={
              scanStatus?.status === 'scanning' ||
              scanStatus?.status === 'matching' ||
              sellers.length === 0 ||
              refreshingCache
            }
            title='Re-fetch ALL inventory pages from Discogs API (slow)'
          >
            Full Inventory Refresh
          </button>
        </div>
      </div>

      {/* Master/Release Cache Stats */}
      {cacheStats && (
        <div className='sellers-cache-card'>
          <div className='sellers-cache-header'>
            <h3>Release Matching Cache</h3>
            <span className='sellers-cache-hint'>
              Pre-fetched release IDs for your wishlist - enables instant
              matching without API calls
            </span>
          </div>
          <div className='sellers-cache-stats'>
            <div className='sellers-cache-stat'>
              <span className='sellers-cache-stat-value'>
                {cacheStats.totalMasters.toLocaleString()}
              </span>
              <span className='sellers-cache-stat-label'>Masters</span>
            </div>
            <div className='sellers-cache-stat'>
              <span className='sellers-cache-stat-value'>
                {cacheStats.totalReleases.toLocaleString()}
              </span>
              <span className='sellers-cache-stat-label'>Releases</span>
            </div>
            {cacheStats.staleMasters > 0 && (
              <div className='sellers-cache-stat sellers-cache-stat-warning'>
                <span className='sellers-cache-stat-value'>
                  {cacheStats.staleMasters.toLocaleString()}
                </span>
                <span className='sellers-cache-stat-label'>
                  Stale (30+ days)
                </span>
              </div>
            )}
          </div>
          <div className='sellers-cache-actions'>
            <button
              className='btn btn-small'
              onClick={handleRefreshCache}
              disabled={
                refreshingCache ||
                scanStatus?.status === 'scanning' ||
                scanStatus?.status === 'matching'
              }
              title='Fetch all release IDs for wishlist masters from Discogs'
            >
              {refreshingCache ? 'Building Cache...' : 'Build/Refresh Cache'}
            </button>
            {cacheStats.lastUpdated > 0 && (
              <span className='sellers-cache-updated'>
                Last updated: {formatRelativeTime(cacheStats.lastUpdated)}
              </span>
            )}
          </div>
          {cacheStats.totalMasters === 0 && (
            <div className='sellers-cache-empty-warning'>
              ⚠️ Cache is empty. Build the cache first for fast matching (no API
              calls during scan).
            </div>
          )}
        </div>
      )}

      {/* Scan progress */}
      {(scanStatus?.status === 'scanning' ||
        scanStatus?.status === 'matching') && (
        <div className='sellers-scan-progress'>
          <div className='sellers-scan-progress-text'>
            {scanStatus.status === 'matching' ? (
              <>
                Matching {scanStatus.currentSeller || '...'} inventory
                {scanStatus.matchingProgress && (
                  <>
                    {' '}
                    (
                    {scanStatus.matchingProgress.itemsProcessed.toLocaleString()}
                    /{scanStatus.matchingProgress.totalItems.toLocaleString()}{' '}
                    items)
                  </>
                )}
              </>
            ) : (
              <>
                Scanning {scanStatus.currentSeller || '...'}
                {scanStatus.currentPage && scanStatus.totalPages
                  ? ` (page ${scanStatus.currentPage}/${scanStatus.totalPages})`
                  : ''}
                ... ({scanStatus.progress}%)
              </>
            )}
          </div>
          <div className='sellers-scan-progress-bar'>
            <div
              className='sellers-scan-progress-fill'
              style={{
                width: `${
                  scanStatus.status === 'matching' &&
                  scanStatus.matchingProgress
                    ? Math.round(
                        (scanStatus.matchingProgress.itemsProcessed /
                          scanStatus.matchingProgress.totalItems) *
                          100
                      )
                    : scanStatus.progress
                }%`,
              }}
            ></div>
          </div>
          {scanStatus.status === 'matching' && scanStatus.matchingProgress && (
            <div className='sellers-scan-cache-stats'>
              {scanStatus.matchingProgress.cacheHits > 0 && (
                <span>
                  {scanStatus.matchingProgress.cacheHits.toLocaleString()} cache
                  hits
                </span>
              )}
              {scanStatus.matchingProgress.apiCalls > 0 && (
                <span>
                  , {scanStatus.matchingProgress.apiCalls.toLocaleString()} API
                  lookups
                </span>
              )}
            </div>
          )}
          {scanStatus.newMatches > 0 && (
            <div className='sellers-scan-matches-found'>
              {scanStatus.newMatches} new match
              {scanStatus.newMatches !== 1 ? 'es' : ''} found!
            </div>
          )}
        </div>
      )}

      {/* Scan completed status */}
      {scanStatus?.status === 'completed' && scanStatus.lastScanTimestamp && (
        <div className='sellers-scan-completed'>
          Last scan: {formatRelativeTime(scanStatus.lastScanTimestamp)}
          {scanStatus.newMatches > 0 &&
            ` - Found ${scanStatus.newMatches} new match${scanStatus.newMatches !== 1 ? 'es' : ''}`}
        </div>
      )}

      {/* Error status */}
      {scanStatus?.status === 'error' && scanStatus.error && (
        <div className='sellers-scan-error'>Scan error: {scanStatus.error}</div>
      )}

      {/* Sellers list */}
      {sellers.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <h2>No Sellers Added</h2>
            <p>
              Add local record shops by their Discogs username to monitor their
              inventories for items on your wishlist.
            </p>
            <button className='btn' onClick={() => setAddDialogOpen(true)}>
              + Add Your First Seller
            </button>
          </div>
        </div>
      ) : (
        <div className='sellers-list'>
          {sellers.map(seller => (
            <div key={seller.username} className='seller-card'>
              <div className='seller-card-header'>
                <div className='seller-card-info'>
                  <div className='seller-card-name'>{seller.displayName}</div>
                  <div className='seller-card-username'>@{seller.username}</div>
                </div>
                <div className='seller-card-stats'>
                  <span>
                    Inventory: {seller.inventorySize?.toLocaleString() || '?'}
                  </span>
                  <span>Matches: {seller.matchCount || 0}</span>
                </div>
              </div>
              <div className='seller-card-meta'>
                {seller.lastScanned
                  ? `Last scanned: ${formatRelativeTime(seller.lastScanned)}`
                  : 'Not yet scanned'}
              </div>
              <div className='seller-card-actions'>
                {(seller.matchCount || 0) > 0 && (
                  <button
                    className='btn btn-small'
                    onClick={() => {
                      window.location.hash = `seller-matches?seller=${encodeURIComponent(seller.username)}`;
                    }}
                  >
                    View Matches
                  </button>
                )}
                <button
                  className='btn btn-small btn-danger'
                  onClick={() => handleRemoveSeller(seller.username)}
                  disabled={removingUsername === seller.username}
                >
                  {removingUsername === seller.username
                    ? 'Removing...'
                    : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add seller modal */}
      <Modal
        isOpen={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        title='Add Local Seller'
        size='small'
      >
        <div className='form-group'>
          <label className='form-label'>Discogs Username *</label>
          <input
            type='text'
            className='form-input'
            placeholder='localvinylshop'
            value={newSellerUsername}
            onChange={e => setNewSellerUsername(e.target.value)}
            disabled={addingInProgress}
            autoFocus
          />
          <span className='form-hint'>
            The seller's username on Discogs Marketplace
          </span>
        </div>
        <div className='form-group'>
          <label className='form-label'>Display Name (optional)</label>
          <input
            type='text'
            className='form-input'
            placeholder='Local Vinyl Shop'
            value={newSellerDisplayName}
            onChange={e => setNewSellerDisplayName(e.target.value)}
            disabled={addingInProgress}
          />
          <span className='form-hint'>
            A friendly name to display in the app
          </span>
        </div>
        {addError && <div className='form-error'>{addError}</div>}
        <ModalFooter>
          <button
            className='btn btn-secondary'
            onClick={() => setAddDialogOpen(false)}
            disabled={addingInProgress}
          >
            Cancel
          </button>
          <button
            className='btn'
            onClick={handleAddSeller}
            disabled={addingInProgress || !newSellerUsername.trim()}
          >
            {addingInProgress ? 'Adding...' : 'Add Seller'}
          </button>
        </ModalFooter>
      </Modal>

      {/* View all matches link */}
      {sellers.some(s => (s.matchCount || 0) > 0) && (
        <div className='sellers-view-all'>
          <button
            className='btn btn-outline'
            onClick={() => {
              window.location.hash = 'seller-matches';
            }}
          >
            View All Matches
          </button>
        </div>
      )}
    </div>
  );
};

export default SellersPage;
