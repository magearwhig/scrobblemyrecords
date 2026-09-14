import { AlertTriangle } from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';

import './MarketplacePage.page.css';

import {
  MonitoredSeller,
  ReleaseCacheRefreshStatus,
  SellerScanStatus,
} from '../../shared/types';
import SellerCard from '../components/SellerCard';
import { Modal, ModalFooter } from '../components/ui';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ListItemSkeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useConfirmModal } from '../hooks/useConfirmModal';
import {
  useNotifications,
  createSuccessNotification,
  createInfoNotification,
} from '../hooks/useNotifications';
import { navigate } from '../routes';
import { getApiService } from '../services/api';

interface SellersPageProps {
  embedded?: boolean;
}

/** A scan requested while the release cache was empty */
type PendingScan =
  | { kind: 'all'; forceFresh: boolean }
  | { kind: 'seller'; username: string };

/** Prefer the server's error message over axios' generic status text */
const getErrorMessage = (err: unknown, fallback: string): string => {
  const apiError = (err as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  if (typeof apiError === 'string') return apiError;
  return err instanceof Error ? err.message : fallback;
};

/**
 * Status responses can resolve out of order (initial load vs polling). Keep
 * whichever describes the newer run, and never move a run backwards.
 */
const newerRefreshStatus = (
  prev: ReleaseCacheRefreshStatus | null,
  next: ReleaseCacheRefreshStatus
): ReleaseCacheRefreshStatus => {
  if (!prev) return next;
  const prevStart = prev.startedAt ?? 0;
  const nextStart = next.startedAt ?? 0;
  if (nextStart !== prevStart) return nextStart > prevStart ? next : prev;
  if (prev.status !== 'running' && next.status === 'running') return prev;
  if (
    prev.status === 'running' &&
    next.status === 'running' &&
    next.mastersProcessed < prev.mastersProcessed
  ) {
    return prev;
  }
  return next;
};

const describeCacheRefresh = (status: ReleaseCacheRefreshStatus): string => {
  if (status.status === 'error') {
    return `Cache refresh failed: ${status.error || 'Unknown error'}`;
  }
  if (status.status === 'idle') {
    return 'Cache refresh was interrupted (server restarted)';
  }
  if (status.mastersTotal === 0) {
    return 'Cache is already up to date';
  }
  const failed =
    status.mastersFailed > 0 ? `, ${status.mastersFailed} failed` : '';
  const skipped =
    status.mastersSkipped > 0
      ? ` (${status.mastersSkipped} already cached)`
      : '';
  return `Processed ${status.mastersProcessed} masters, added ${status.releasesAdded} releases${failed}${skipped}`;
};

const SellersPage: React.FC<SellersPageProps> = ({ embedded = false }) => {
  const { state } = useApp();
  const { addNotification } = useNotifications();
  const { showToast } = useToast();
  const [confirmAction, ConfirmModal] = useConfirmModal();
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
  const [cancelling, setCancelling] = useState(false);

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
  const [cacheRefreshStatus, setCacheRefreshStatus] =
    useState<ReleaseCacheRefreshStatus | null>(null);
  const refreshingCache = cacheRefreshStatus?.status === 'running';
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);
  // Scan to start once the cache refresh finishes. The ref is read by the
  // polling callback; the state drives the "scan will start" hint.
  const pendingScanRef = useRef<PendingScan | null>(null);
  const [hasPendingScan, setHasPendingScan] = useState(false);
  const setPendingScan = (scan: PendingScan | null) => {
    pendingScanRef.current = scan;
    setHasPendingScan(scan !== null);
  };

  // Load sellers
  const loadSellers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [sellersData, statusData, cacheStatsData, cacheRefreshData] =
        await Promise.all([
          api.getSellers(),
          api.getSellerScanStatus(),
          api.getReleaseCacheStats(),
          api.getReleaseCacheRefreshStatus(),
        ]);
      setSellers(sellersData);
      setScanStatus(statusData);
      setCacheStats(cacheStatsData);
      setCacheRefreshStatus(prev => newerRefreshStatus(prev, cacheRefreshData));
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
          if (
            status.status === 'completed' ||
            status.status === 'error' ||
            status.status === 'cancelled'
          ) {
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
                      route: 'marketplace?tab=matches',
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
                      route: 'marketplace?tab=matches',
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
    const confirmed = await confirmAction(
      `Remove ${username} from monitoring? This will also delete all matches for this seller.`,
      { title: 'Remove Seller', confirmLabel: 'Remove' }
    );
    if (!confirmed) {
      return;
    }

    try {
      setRemovingUsername(username);
      await api.removeSeller(username);
      loadSellers();
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to remove seller'
      );
    } finally {
      setRemovingUsername(null);
    }
  };

  const startScan = useCallback(
    async (scan: PendingScan) => {
      try {
        const status =
          scan.kind === 'all'
            ? await api.triggerSellerScan(scan.forceFresh)
            : await api.triggerSingleSellerScan(scan.username);
        setScanStatus(status);
      } catch (err) {
        showToast('error', getErrorMessage(err, 'Failed to start scan'));
      }
    },
    [api, showToast]
  );

  // Handle refresh cache - starts a background refresh on the server
  const handleRefreshCache = async () => {
    try {
      setCacheMessage(null);
      const status = await api.refreshReleaseCache();
      setCacheRefreshStatus(prev => newerRefreshStatus(prev, status));
    } catch (err) {
      setPendingScan(null);
      setCacheMessage(getErrorMessage(err, 'Failed to refresh cache'));
    }
  };

  // Scans need the release cache; if it's empty, build it first and start the
  // scan automatically once the refresh completes
  const requestScan = async (scan: PendingScan) => {
    if (cacheStats && cacheStats.totalMasters === 0) {
      setPendingScan(scan);
      await handleRefreshCache();
      return;
    }
    await startScan(scan);
  };

  // Handle trigger scan (all sellers)
  const handleTriggerScan = (forceFresh = false) =>
    requestScan({ kind: 'all', forceFresh });

  // Handle scan single seller
  const handleScanSeller = (username: string) =>
    requestScan({ kind: 'seller', username });

  const finishCacheRefresh = useCallback(
    async (status: ReleaseCacheRefreshStatus) => {
      setCacheMessage(describeCacheRefresh(status));
      try {
        setCacheStats(await api.getReleaseCacheStats());
      } catch {
        // Stats will refresh on next load
      }

      const pending = pendingScanRef.current;
      pendingScanRef.current = null;
      setHasPendingScan(false);
      if (!pending) return;
      if (status.status === 'completed') {
        await startScan(pending);
      } else {
        showToast('error', 'Scan not started: release cache refresh failed');
      }
    },
    [api, showToast, startScan]
  );

  // Poll release cache refresh progress while it runs
  useEffect(() => {
    if (cacheRefreshStatus?.status !== 'running') return;

    const interval = setInterval(async () => {
      try {
        const status = await api.getReleaseCacheRefreshStatus();
        if (status.status === 'idle') {
          // Server restarted mid-refresh - that run is gone
          setCacheRefreshStatus(status);
        } else {
          setCacheRefreshStatus(prev => newerRefreshStatus(prev, status));
        }
        if (status.status !== 'running') {
          await finishCacheRefresh(status);
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [cacheRefreshStatus?.status, api, finishCacheRefresh]);

  // Handle cancel scan
  const handleCancelScan = async () => {
    try {
      setCancelling(true);
      await api.cancelSellerScan();
      // Poll one more time to get the updated status
      const status = await api.getSellerScanStatus();
      setScanStatus(status);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to cancel scan'
      );
    } finally {
      setCancelling(false);
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
        {!embedded && <h1>Local Sellers</h1>}
        <div className='loading-container'>
          <ListItemSkeleton count={4} />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className='sellers-page'>
        {!embedded && <h1>Local Sellers</h1>}
        <div className='error-state'>
          <p>{error}</p>
          <Button onClick={loadSellers}>Try Again</Button>
        </div>
      </div>
    );
  }

  // Wishlist dependency check
  if (wishlistEmpty) {
    return (
      <div className='sellers-page'>
        {!embedded && <h1>Local Sellers</h1>}
        <div className='card'>
          <div className='empty-state'>
            <h2>Sync Wishlist First</h2>
            <p>
              You need items in your Discogs wishlist or local want list before
              scanning seller inventories.
            </p>
            <Button
              onClick={() => {
                navigate('marketplace?tab=wishlist');
              }}
            >
              Go to Wishlist
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className='sellers-page'>
      {ConfirmModal}
      {!embedded && (
        <>
          <h1>Local Sellers</h1>
          <p className='page-description'>
            Track inventories of local record shops for wishlist items.
          </p>
        </>
      )}

      {/* Header actions */}
      <div className='sellers-header'>
        <Button onClick={() => setAddDialogOpen(true)}>+ Add Seller</Button>
        <div className='sellers-scan-buttons'>
          <Button
            variant='secondary'
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
          </Button>
          <Button
            variant='outline'
            size='small'
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
          </Button>
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
            <Button
              size='small'
              onClick={handleRefreshCache}
              disabled={
                refreshingCache ||
                scanStatus?.status === 'scanning' ||
                scanStatus?.status === 'matching'
              }
              title='Fetch all release IDs for wishlist masters from Discogs'
            >
              {refreshingCache ? 'Building Cache...' : 'Build/Refresh Cache'}
            </Button>
            {cacheStats.lastUpdated > 0 && (
              <span className='sellers-cache-updated'>
                Last updated: {formatRelativeTime(cacheStats.lastUpdated)}
              </span>
            )}
            {cacheMessage && (
              <span className='sellers-cache-updated'>{cacheMessage}</span>
            )}
          </div>
          {refreshingCache && cacheRefreshStatus && (
            <div className='sellers-scan-progress'>
              <div className='sellers-scan-progress-text'>
                {cacheRefreshStatus.mastersTotal > 0
                  ? `Building release cache... ${cacheRefreshStatus.mastersProcessed} of ${cacheRefreshStatus.mastersTotal} masters`
                  : 'Building release cache...'}
                {cacheRefreshStatus.mastersFailed > 0 &&
                  ` (${cacheRefreshStatus.mastersFailed} failed)`}
                {hasPendingScan && ' Scan will start when the cache is ready.'}
              </div>
              <ProgressBar
                value={
                  cacheRefreshStatus.mastersTotal > 0
                    ? Math.round(
                        (cacheRefreshStatus.mastersProcessed /
                          cacheRefreshStatus.mastersTotal) *
                          100
                      )
                    : 0
                }
                indeterminate={cacheRefreshStatus.mastersTotal === 0}
                size='small'
                animated
              />
            </div>
          )}
          {cacheStats.totalMasters === 0 && (
            <div className='sellers-cache-empty-warning'>
              <AlertTriangle size={14} aria-hidden='true' /> Cache is empty.
              Build the cache first for fast matching (no API calls during
              scan).
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
                Fetching {scanStatus.currentSeller || '...'} inventory
                {scanStatus.currentPage && scanStatus.totalPages
                  ? ` (page ${scanStatus.currentPage} of ${scanStatus.totalPages})`
                  : '...'}
              </>
            )}
          </div>
          <ProgressBar
            value={
              scanStatus.status === 'matching' && scanStatus.matchingProgress
                ? Math.round(
                    (scanStatus.matchingProgress.itemsProcessed /
                      scanStatus.matchingProgress.totalItems) *
                      100
                  )
                : scanStatus.currentPage && scanStatus.totalPages
                  ? Math.round(
                      (scanStatus.currentPage / scanStatus.totalPages) * 100
                    )
                  : scanStatus.progress
            }
            size='small'
            animated
          />
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
              {scanStatus.matchingProgress.rateLimited > 0 && (
                <span className='sellers-scan-rate-limited'>
                  , {scanStatus.matchingProgress.rateLimited.toLocaleString()}{' '}
                  rate limited
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
          <div className='sellers-scan-actions'>
            <Button
              variant='outline'
              size='small'
              onClick={handleCancelScan}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Scan'}
            </Button>
          </div>
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

      {/* Cancelled status */}
      {scanStatus?.status === 'cancelled' && (
        <div className='sellers-scan-cancelled'>
          Scan was cancelled.{' '}
          <Button
            variant='outline'
            size='small'
            onClick={() => handleTriggerScan(false)}
          >
            Restart Scan
          </Button>
        </div>
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
            <Button onClick={() => setAddDialogOpen(true)}>
              + Add Your First Seller
            </Button>
          </div>
        </div>
      ) : (
        <div className='sellers-list'>
          {sellers.map(seller => (
            <SellerCard
              key={seller.username}
              seller={seller}
              formatRelativeTime={formatRelativeTime}
              onRemove={handleRemoveSeller}
              removing={removingUsername === seller.username}
              onScan={handleScanSeller}
              scanDisabled={
                scanStatus?.status === 'scanning' ||
                scanStatus?.status === 'matching' ||
                refreshingCache
              }
            />
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
          <Button
            variant='secondary'
            onClick={() => setAddDialogOpen(false)}
            disabled={addingInProgress}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddSeller}
            disabled={addingInProgress || !newSellerUsername.trim()}
          >
            {addingInProgress ? 'Adding...' : 'Add Seller'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* View all matches link */}
      {sellers.some(s => (s.matchCount || 0) > 0) && (
        <div className='sellers-view-all'>
          <Button
            variant='outline'
            onClick={() => {
              navigate('marketplace?tab=matches');
            }}
          >
            View All Matches
          </Button>
        </div>
      )}
    </div>
  );
};

export default SellersPage;
