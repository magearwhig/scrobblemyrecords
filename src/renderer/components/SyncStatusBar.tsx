import React, { useState, useEffect, useRef, useCallback } from 'react';

import { SyncStatus } from '../../shared/types';
import { getApiService } from '../services/api';

interface SyncStatusBarProps {
  onSyncComplete?: () => void;
  compact?: boolean;
}

const SyncStatusBar: React.FC<SyncStatusBarProps> = ({
  onSyncComplete,
  compact = false,
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [storageStats, setStorageStats] = useState<{
    totalAlbums: number;
    totalScrobbles: number;
    lastSync: Date | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track sync status for interval callback to avoid stale closure
  const syncStatusRef = useRef<SyncStatus | null>(null);
  // Track previous status to detect transitions
  const prevStatusRef = useRef<string | null>(null);
  // Store onSyncComplete in ref to avoid recreating fetchStatus
  const onSyncCompleteRef = useRef(onSyncComplete);
  onSyncCompleteRef.current = onSyncComplete;

  const api = getApiService();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getHistorySyncStatus();
      const prevStatus = prevStatusRef.current;
      const newStatus = data.sync.status;

      setSyncStatus(data.sync);
      syncStatusRef.current = data.sync; // Keep ref in sync for interval callback
      prevStatusRef.current = newStatus;
      setStorageStats({
        totalAlbums: data.storage.totalAlbums,
        totalScrobbles: data.storage.totalScrobbles,
        lastSync: data.storage.lastSync
          ? new Date(data.storage.lastSync)
          : null,
      });
      setError(null);

      // Call onSyncComplete only when status TRANSITIONS to completed (not on initial load)
      if (
        prevStatus === 'syncing' &&
        newStatus === 'completed' &&
        onSyncCompleteRef.current
      ) {
        onSyncCompleteRef.current();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch sync status'
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchStatus();

    // Poll status every 2 seconds while syncing (use ref to avoid stale closure)
    const interval = setInterval(() => {
      const status = syncStatusRef.current?.status;
      if (status === 'syncing' || status === 'paused') {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStartSync = async (incremental: boolean = false) => {
    try {
      setError(null);
      // Immediately set status to syncing so polling starts right away
      syncStatusRef.current = {
        ...syncStatusRef.current,
        status: 'syncing',
      } as SyncStatus;
      setSyncStatus(prev => (prev ? { ...prev, status: 'syncing' } : null));
      await api.startHistorySync(incremental);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start sync');
    }
  };

  const handlePauseSync = async () => {
    try {
      await api.pauseHistorySync();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause sync');
    }
  };

  const handleResumeSync = async () => {
    try {
      await api.resumeHistorySync();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume sync');
    }
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const formatLastSync = (date: Date | null): string => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <div className='sync-status-bar sync-status-loading'>
        Loading sync status...
      </div>
    );
  }

  if (error) {
    return (
      <div className='sync-status-bar sync-status-error'>
        <span className='error-text'>{error}</span>
        <button className='btn btn-small' onClick={() => fetchStatus()}>
          Retry
        </button>
      </div>
    );
  }

  if (!syncStatus) return null;

  // Compact mode for embedding in other components
  if (compact) {
    if (syncStatus.status === 'syncing') {
      return (
        <div className='sync-status-compact'>
          <div className='sync-progress-inline'>
            <div
              className='sync-progress-bar'
              style={{ width: `${syncStatus.progress}%` }}
            />
          </div>
          <span className='sync-text'>Syncing: {syncStatus.progress}%</span>
        </div>
      );
    }

    if (storageStats && storageStats.totalScrobbles > 0) {
      return (
        <div className='sync-status-compact sync-status-idle'>
          <span className='sync-text'>
            {storageStats.totalScrobbles.toLocaleString()} scrobbles indexed
          </span>
        </div>
      );
    }

    return (
      <div className='sync-status-compact sync-status-empty'>
        <button
          className='btn btn-small btn-link'
          onClick={() => handleStartSync(false)}
        >
          Sync history to enable suggestions
        </button>
      </div>
    );
  }

  // Full status bar
  return (
    <div className='sync-status-bar'>
      {syncStatus.status === 'syncing' && (
        <>
          <div className='sync-progress-container'>
            <div className='sync-progress-info'>
              <span className='sync-label'>Building history index:</span>
              <span className='sync-percentage'>{syncStatus.progress}%</span>
              <span className='sync-detail'>
                ({syncStatus.scrobblesFetched.toLocaleString()} /{' '}
                {syncStatus.totalScrobbles.toLocaleString()})
              </span>
              {syncStatus.estimatedTimeRemaining && (
                <span className='sync-eta'>
                  ~{formatTimeRemaining(syncStatus.estimatedTimeRemaining)}{' '}
                  remaining
                </span>
              )}
            </div>
            <div className='sync-progress-track'>
              <div
                className='sync-progress-bar'
                style={{ width: `${syncStatus.progress}%` }}
              />
            </div>
          </div>
          <button
            className='btn btn-small btn-secondary'
            onClick={handlePauseSync}
          >
            Pause
          </button>
        </>
      )}

      {syncStatus.status === 'paused' && (
        <>
          <div className='sync-status-info'>
            <span className='sync-label'>Sync paused:</span>
            <span className='sync-detail'>
              {syncStatus.progress}% complete (
              {syncStatus.scrobblesFetched.toLocaleString()} scrobbles)
            </span>
          </div>
          <button className='btn btn-small' onClick={handleResumeSync}>
            Resume
          </button>
        </>
      )}

      {syncStatus.status === 'completed' && (
        <div className='sync-status-info sync-status-completed'>
          <span className='sync-label'>History indexed:</span>
          <span className='sync-detail'>
            {storageStats?.totalScrobbles.toLocaleString() || 0} scrobbles,{' '}
            {storageStats?.totalAlbums.toLocaleString() || 0} albums
          </span>
          <span className='sync-time'>
            Last synced: {formatLastSync(storageStats?.lastSync || null)}
          </span>
          <button
            className='btn btn-small btn-secondary'
            onClick={() => handleStartSync(true)}
            title='Fetch new scrobbles since last sync'
          >
            Refresh
          </button>
        </div>
      )}

      {syncStatus.status === 'idle' && (
        <div className='sync-status-info sync-status-idle'>
          {storageStats && storageStats.totalScrobbles > 0 ? (
            <>
              <span className='sync-label'>History indexed:</span>
              <span className='sync-detail'>
                {storageStats.totalScrobbles.toLocaleString()} scrobbles
              </span>
              <span className='sync-time'>
                Last synced: {formatLastSync(storageStats.lastSync)}
              </span>
              <button
                className='btn btn-small btn-secondary'
                onClick={() => handleStartSync(true)}
              >
                Sync New
              </button>
            </>
          ) : (
            <>
              <span className='sync-label'>No history synced yet</span>
              <span className='sync-detail'>
                Sync your Last.fm history to enable intelligent suggestions
              </span>
              <button
                className='btn btn-small'
                onClick={() => handleStartSync(false)}
              >
                Start Full Sync
              </button>
            </>
          )}
        </div>
      )}

      {syncStatus.status === 'error' && (
        <div className='sync-status-info sync-status-error'>
          <span className='error-text'>
            {syncStatus.error || 'Sync failed'}
          </span>
          <button
            className='btn btn-small'
            onClick={() => handleStartSync(false)}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default SyncStatusBar;
