import { History, ListChecks, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { SyncStatus, UnresolvedHistorySummary } from '../../../shared/types';
import { useToast } from '../../context/ToastContext';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Skeleton } from '../ui/Skeleton';

import './UnresolvedSummaryBanner.css';
import { formatCount, formatDateMs, pluralize } from './unresolvedFormat';

const logger = createLogger('UnresolvedSummaryBanner');

/** How often sync status is polled while a backfill runs. */
export const BACKFILL_POLL_INTERVAL_MS = 2000;

/**
 * Polls to wait for a just-started backfill to report 'syncing' before
 * treating it as finished anyway (about 30 seconds).
 */
export const BACKFILL_START_GRACE_POLLS = 15;

const isConflict = (err: unknown): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { response?: { status?: number } }).response?.status === 409;

export interface UnresolvedSummaryBannerProps {
  summary: UnresolvedHistorySummary | null;
  loading: boolean;
  rulesOpen: boolean;
  onToggleRules: () => void;
  /** Called when a sync/backfill finishes so the caller can refresh. */
  onBackfillComplete: () => void;
}

/**
 * Summary of albumless plays, the Last.fm vs index gap, and the
 * "Recover missing history" backfill action with live progress.
 */
export const UnresolvedSummaryBanner: React.FC<
  UnresolvedSummaryBannerProps
> = ({ summary, loading, rulesOpen, onToggleRules, onBackfillComplete }) => {
  const api = getApiService();
  const { showToast } = useToast();
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [starting, setStarting] = useState(false);
  // True from a successful start (or an observed running sync) until it ends
  const [watching, setWatching] = useState(false);
  const sawSyncing = useRef(false);
  const pollsBeforeSyncing = useRef(0);
  const onCompleteRef = useRef(onBackfillComplete);
  onCompleteRef.current = onBackfillComplete;

  const refreshSyncStatus = useCallback(async () => {
    try {
      const { sync } = await api.getHistorySyncStatus();
      setSyncStatus(sync);
    } catch (err) {
      logger.warn('Failed to load history sync status', err);
    }
  }, [api]);

  const startWatching = useCallback(() => {
    sawSyncing.current = false;
    pollsBeforeSyncing.current = 0;
    setWatching(true);
  }, []);

  // Initial status, so the button is disabled if a sync is already running
  useEffect(() => {
    refreshSyncStatus();
  }, [refreshSyncStatus]);

  const isSyncing = syncStatus?.status === 'syncing';

  // A sync that is already running when the tab opens is watched too
  useEffect(() => {
    if (isSyncing && !watching) startWatching();
  }, [isSyncing, watching, startWatching]);

  // Poll for as long as we are watching
  useEffect(() => {
    if (!watching) return undefined;
    const timer = setInterval(refreshSyncStatus, BACKFILL_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [watching, refreshSyncStatus]);

  // Decide when the watched run has ended. The backend only reports
  // 'syncing' after it fetched the first page, so a non-syncing status right
  // after starting is not the end; give it a grace period instead.
  useEffect(() => {
    if (!watching || !syncStatus) return;
    if (syncStatus.status === 'syncing') {
      sawSyncing.current = true;
      return;
    }
    if (!sawSyncing.current) {
      pollsBeforeSyncing.current += 1;
      if (pollsBeforeSyncing.current <= BACKFILL_START_GRACE_POLLS) return;
    }

    setWatching(false);
    if (syncStatus.status === 'completed') {
      showToast('success', 'Missing listening history recovered');
    } else if (syncStatus.status === 'error') {
      showToast(
        'error',
        syncStatus.error
          ? `History recovery failed: ${syncStatus.error}`
          : 'History recovery failed'
      );
    } else if (sawSyncing.current) {
      showToast('info', 'History recovery stopped before it finished');
    }
    onCompleteRef.current();
  }, [watching, syncStatus, showToast]);

  const handleBackfill = async () => {
    setStarting(true);
    try {
      await api.startHistoryBackfill();
      showToast('info', 'Recovering missing history from Last.fm...');
      startWatching();
    } catch (err) {
      if (isConflict(err)) {
        showToast(
          'warning',
          'A history sync is already running. Try again when it finishes.'
        );
      } else {
        logger.error('Failed to start history backfill', err);
        showToast(
          'error',
          err instanceof Error ? err.message : 'Failed to start recovery'
        );
      }
    } finally {
      await refreshSyncStatus();
      setStarting(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className='card unresolved-banner' aria-busy='true'>
        <Skeleton variant='text' height={24} width='60%' />
        <Skeleton variant='text' height={16} width='40%' />
      </div>
    );
  }

  if (!summary) return null;

  const hasBackfilled = summary.lastFullBackfillAt !== null;
  const busy = starting || isSyncing || watching;

  return (
    <section
      className='card unresolved-banner'
      aria-labelledby='unresolved-banner-title'
    >
      <div className='unresolved-banner-main'>
        <h3 id='unresolved-banner-title' className='unresolved-banner-title'>
          {pluralize(summary.unresolvedCount, 'play')} without album info
        </h3>
        <p className='unresolved-banner-subtitle'>
          Counted in listening stats, excluded from album stats.
        </p>
        {summary.lastfmTotal !== null && (
          <p className='unresolved-banner-meta'>
            Last.fm reports {formatCount(summary.lastfmTotal)} · indexed{' '}
            {formatCount(summary.indexedTotal)}
            {summary.gap !== null && summary.gap > 0 && (
              <span className='unresolved-banner-gap'>
                {' '}
                ({pluralize(summary.gap, 'play')} missing)
              </span>
            )}
          </p>
        )}
      </div>

      <div className='unresolved-banner-rules'>
        <span className='unresolved-banner-rules-text'>
          {pluralize(summary.resolvedByRuleCount, 'play')} given an album by{' '}
          {pluralize(summary.resolutionCount, 'rule')}
        </span>
        <Button
          variant='ghost'
          size='small'
          onClick={onToggleRules}
          aria-expanded={rulesOpen}
          aria-controls='unresolved-rules-panel'
          iconLeft={<ListChecks size={16} aria-hidden='true' />}
        >
          {rulesOpen ? 'Hide rules' : 'Manage rules'}
        </Button>
      </div>

      <div className='unresolved-banner-backfill'>
        {hasBackfilled ? (
          <div className='unresolved-banner-backfill-row'>
            <span className='unresolved-banner-backfill-text'>
              History last recovered{' '}
              {formatDateMs(summary.lastFullBackfillAt as number)}.
            </span>
            <Button
              variant='ghost'
              size='small'
              onClick={handleBackfill}
              disabled={busy}
              iconLeft={<RefreshCw size={16} aria-hidden='true' />}
            >
              Run again
            </Button>
          </div>
        ) : (
          <div className='unresolved-banner-backfill-row'>
            <p className='unresolved-banner-backfill-text'>
              Older syncs skipped plays without album info. Recovery re-reads
              your history from Last.fm (about 5 minutes) and only adds missing
              plays.
            </p>
            <Button
              variant='primary'
              size='small'
              onClick={handleBackfill}
              disabled={busy}
              iconLeft={<History size={16} aria-hidden='true' />}
            >
              Recover missing history
            </Button>
          </div>
        )}

        {watching && !isSyncing && (
          <span className='unresolved-banner-progress-text' role='status'>
            Starting recovery...
          </span>
        )}
        {isSyncing && syncStatus && (
          <div className='unresolved-banner-progress' role='status'>
            <ProgressBar
              value={syncStatus.progress}
              size='small'
              animated
              showLabel
              label={`Syncing with Last.fm: ${Math.round(syncStatus.progress)}%`}
            />
            {syncStatus.totalPages > 0 && (
              <span className='unresolved-banner-progress-text'>
                Page {formatCount(syncStatus.currentPage)} of{' '}
                {formatCount(syncStatus.totalPages)}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default UnresolvedSummaryBanner;
