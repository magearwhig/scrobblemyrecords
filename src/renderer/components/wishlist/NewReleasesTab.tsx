import React, { useEffect, useState, useCallback, useRef } from 'react';

import {
  NewReleaseSyncStatus,
  WishlistNewRelease,
} from '../../../shared/types';
import { useApp } from '../../context/AppContext';
import { getApiService } from '../../services/api';

import { NewReleaseCard } from './NewReleaseCard';

interface Props {
  onCountChange: (count: number) => void;
}

type SourceFilter = '' | 'wishlist' | 'local_want';
type DaysFilter = '' | '7' | '30' | '90';

/**
 * Tab component for displaying newly detected vinyl releases
 */
export const NewReleasesTab: React.FC<Props> = ({ onCountChange }) => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  const [releases, setReleases] = useState<WishlistNewRelease[]>([]);
  const [lastCheck, setLastCheck] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<NewReleaseSyncStatus | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [checkStarting, setCheckStarting] = useState(false);

  // Auto-continue mode state
  const [autoContinue, setAutoContinue] = useState(false);
  const autoContinueRef = useRef(false);

  // Filter state
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('');
  const [daysFilter, setDaysFilter] = useState<DaysFilter>('');
  const [showDismissed, setShowDismissed] = useState(false);

  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    autoContinueRef.current = autoContinue;
  }, [autoContinue]);

  const fetchNewReleases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const options: {
        source?: 'wishlist' | 'local_want';
        days?: number;
        showDismissed?: boolean;
      } = {};

      if (sourceFilter) {
        options.source = sourceFilter;
      }
      if (daysFilter) {
        options.days = parseInt(daysFilter, 10);
      }
      if (showDismissed) {
        options.showDismissed = true;
      }

      const data = await api.getWishlistNewReleases(options);
      setReleases(data.releases);
      setLastCheck(data.lastCheck);
      onCountChange(data.count);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load new releases'
      );
    } finally {
      setLoading(false);
    }
  }, [api, sourceFilter, daysFilter, showDismissed, onCountChange]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const status = await api.getNewReleaseSyncStatus();
      setSyncStatus(status);
      return status;
    } catch {
      // Ignore status fetch errors
      return null;
    }
  }, [api]);

  // Initial load
  useEffect(() => {
    fetchNewReleases();
    fetchSyncStatus();
  }, [fetchNewReleases, fetchSyncStatus]);

  // Poll sync status while syncing
  useEffect(() => {
    if (syncStatus?.status !== 'syncing') return;

    const interval = setInterval(async () => {
      const status = await fetchSyncStatus();
      if (status?.status === 'completed' || status?.status === 'error') {
        // Refresh releases after sync completes
        await fetchNewReleases();

        // Auto-continue: if there are more masters to check and auto-continue is enabled
        if (
          status?.status === 'completed' &&
          autoContinueRef.current &&
          status.lastCheckedIndex > 0 &&
          status.lastCheckedIndex < status.totalMasters
        ) {
          // Trigger next batch after a short delay
          setTimeout(async () => {
            try {
              await api.checkForNewReleases();
              await fetchSyncStatus();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : 'Auto-continue failed'
              );
              setAutoContinue(false);
            }
          }, 500);
        } else if (
          status?.status === 'completed' &&
          autoContinueRef.current &&
          status.lastCheckedIndex === 0
        ) {
          // Full cycle completed, turn off auto-continue
          setAutoContinue(false);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncStatus?.status, fetchSyncStatus, fetchNewReleases, api]);

  const handleCheckNow = async (withAutoContinue = false) => {
    try {
      setCheckStarting(true);
      setError(null);
      if (withAutoContinue) {
        setAutoContinue(true);
      }
      await api.checkForNewReleases();

      // Poll until status becomes 'syncing' (backend may take a moment to start)
      // This ensures the UI shows the progress bar immediately
      let attempts = 0;
      const maxAttempts = 5;
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const status = await fetchSyncStatus();
        if (status?.status === 'syncing') {
          break;
        }
        attempts++;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
      setAutoContinue(false);
    } finally {
      setCheckStarting(false);
    }
  };

  const handleStopAutoContinue = () => {
    setAutoContinue(false);
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.dismissNewRelease(id);
      setReleases(prev => prev.filter(r => r.id !== id));
      onCountChange(releases.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss failed');
    }
  };

  const handleDismissAll = async () => {
    if (
      !confirm(
        `Dismiss all ${releases.filter(r => !r.dismissed).length} new releases?`
      )
    ) {
      return;
    }
    try {
      await api.dismissAllNewReleases();
      // Refresh to get updated list
      await fetchNewReleases();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dismiss all failed');
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return days === 1 ? '1 day ago' : `${days} days ago`;
    }
    if (hours > 0) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    }
    return 'Just now';
  };

  const isSyncing = checkStarting || syncStatus?.status === 'syncing';

  // Calculate overall progress for display
  const totalMasters = syncStatus?.totalMasters || 0;
  const lastCheckedIndex = syncStatus?.lastCheckedIndex || 0;
  const currentBatchProcessed = syncStatus?.mastersProcessed || 0;
  const overallChecked = lastCheckedIndex + currentBatchProcessed;
  const overallProgress =
    totalMasters > 0 ? Math.round((overallChecked / totalMasters) * 100) : 0;

  // Check if there are more batches to process
  const hasMoreBatches =
    syncStatus?.status === 'completed' &&
    lastCheckedIndex > 0 &&
    lastCheckedIndex < totalMasters;

  return (
    <div className='new-releases-tab'>
      {/* Header with sync status */}
      <div className='new-releases-header'>
        <div className='new-releases-last-check'>
          Last checked: {formatRelativeTime(lastCheck)}
          {totalMasters > 0 && !isSyncing && (
            <span className='new-releases-progress-summary'>
              {' '}
              •{' '}
              {lastCheckedIndex === 0
                ? 'Full scan complete'
                : `${lastCheckedIndex} of ${totalMasters} masters checked`}
            </span>
          )}
        </div>

        {isSyncing ? (
          <div className='new-releases-sync-progress'>
            <span className='sync-text'>
              {syncStatus?.currentMaster
                ? `Checking: ${syncStatus.currentMaster}`
                : 'Checking for new releases...'}
            </span>
            <div className='sync-progress-info'>
              <span className='sync-masters-count'>
                {overallChecked} of {totalMasters} masters
              </span>
              {autoContinue && (
                <span className='sync-auto-continue-badge'>Auto-continue</span>
              )}
            </div>
            <div className='sync-progress-bar-container'>
              <div
                className='sync-progress-bar'
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className='sync-progress-actions'>
              <span className='sync-percent'>{overallProgress}%</span>
              {autoContinue && (
                <button
                  className='btn btn-sm btn-ghost'
                  onClick={handleStopAutoContinue}
                >
                  Stop
                </button>
              )}
            </div>
          </div>
        ) : hasMoreBatches ? (
          <div className='new-releases-continue-actions'>
            <span className='continue-hint'>
              {totalMasters - lastCheckedIndex} masters remaining
            </span>
            <button
              className='btn btn-secondary'
              onClick={() => handleCheckNow(false)}
              disabled={isSyncing}
            >
              Check Next Batch
            </button>
            <button
              className='btn btn-primary'
              onClick={() => handleCheckNow(true)}
              disabled={isSyncing}
            >
              Check All Remaining
            </button>
          </div>
        ) : (
          <button
            className='btn btn-primary'
            onClick={() => handleCheckNow(false)}
            disabled={isSyncing}
          >
            Check Now
          </button>
        )}
      </div>

      {/* Error state */}
      {(error || syncStatus?.status === 'error') && (
        <div className='new-releases-error'>
          <span>{error || syncStatus?.error}</span>
          <button
            className='btn btn-sm btn-ghost'
            onClick={() => handleCheckNow()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className='new-releases-filters'>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value as SourceFilter)}
          className='form-select'
        >
          <option value=''>All Sources</option>
          <option value='wishlist'>Discogs Wishlist</option>
          <option value='local_want'>Local Want List</option>
        </select>

        <select
          value={daysFilter}
          onChange={e => setDaysFilter(e.target.value as DaysFilter)}
          className='form-select'
        >
          <option value=''>Detected: All Time</option>
          <option value='7'>Detected: Past 7 Days</option>
          <option value='30'>Detected: Past 30 Days</option>
          <option value='90'>Detected: Past 90 Days</option>
        </select>

        <label className='new-releases-show-dismissed'>
          <input
            type='checkbox'
            checked={showDismissed}
            onChange={e => setShowDismissed(e.target.checked)}
          />
          Show dismissed
        </label>

        {/* Dismiss All button - only show when there are non-dismissed releases */}
        {releases.filter(r => !r.dismissed).length > 0 && (
          <button
            className='btn btn-sm btn-secondary'
            onClick={handleDismissAll}
            disabled={isSyncing}
          >
            Dismiss All ({releases.filter(r => !r.dismissed).length})
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className='loading-spinner'>Loading new releases...</div>
      ) : releases.length === 0 ? (
        <div className='empty-state'>
          <p>No new releases detected.</p>
          <p className='text-secondary'>
            New vinyl pressings for albums on your wishlist will appear here.
            Click "Check Now" to scan for new releases.
          </p>
        </div>
      ) : (
        <div className='new-releases-list'>
          {releases.map(release => (
            <NewReleaseCard
              key={release.id}
              release={release}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default NewReleasesTab;
