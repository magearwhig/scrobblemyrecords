import React, { useEffect, useState, useCallback } from 'react';

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

  // Filter state
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('');
  const [daysFilter, setDaysFilter] = useState<DaysFilter>('');
  const [showDismissed, setShowDismissed] = useState(false);

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
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [syncStatus?.status, fetchSyncStatus, fetchNewReleases]);

  const handleCheckNow = async () => {
    try {
      setCheckStarting(true);
      setError(null);
      await api.checkForNewReleases();
      // Start polling for status
      await fetchSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setCheckStarting(false);
    }
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

  return (
    <div className='new-releases-tab'>
      {/* Header with sync status */}
      <div className='new-releases-header'>
        <div className='new-releases-last-check'>
          Last checked: {formatRelativeTime(lastCheck)}
        </div>

        {isSyncing ? (
          <div className='new-releases-sync-progress'>
            <span className='sync-text'>
              {syncStatus?.currentMaster
                ? `Checking: ${syncStatus.currentMaster}`
                : 'Checking for new releases...'}
            </span>
            <div className='sync-progress-bar-container'>
              <div
                className='sync-progress-bar'
                style={{ width: `${syncStatus?.progress || 0}%` }}
              />
            </div>
            <span className='sync-percent'>{syncStatus?.progress || 0}%</span>
          </div>
        ) : (
          <button
            className='btn btn-primary'
            onClick={handleCheckNow}
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
          <button className='btn btn-sm btn-ghost' onClick={handleCheckNow}>
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
