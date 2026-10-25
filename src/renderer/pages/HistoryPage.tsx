import { Check, Circle, Clock, FileText, XCircle } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';

import './HistoryPage.page.css';

import { ScrobbleSession, ScrobbleTrack } from '../../shared/types';
import LastFmHistoryTab from '../components/LastFmHistoryTab';
import ScrobbleSessionCard from '../components/ScrobbleSessionCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { SessionCardSkeleton } from '../components/ui/Skeleton';
import UnresolvedHistoryTab from '../components/UnresolvedHistoryTab';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { useTabKeyNavigation } from '../hooks/useTabKeyNavigation';
import { navigate } from '../routes';
import { getApiService } from '../services/api';
import { formatLocalTimeClean, getTimezoneOffset } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('HistoryPage');

/** Sessions per page; a reload re-reads up to API_MAX_PAGE */
const PAGE_SIZE = 20;
const API_MAX_PAGE = 100;
const SEARCH_DEBOUNCE_MS = 300;

type HistoryTab = 'sessions' | 'lastfm' | 'unresolved';

// Returns the tab from URL params, or null if no URL override
const getTabFromUrl = (): HistoryTab | null => {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;

  const queryString = hash.slice(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  const tab = params.get('tab');
  if (tab === 'sessions' || tab === 'lastfm' || tab === 'unresolved') {
    return tab;
  }
  if (params.get('view')) return 'lastfm';
  return null;
};

const HistoryPage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state } = useApp();
  const { showToast } = useToast();
  const [confirmAction, ConfirmModal] = useConfirmModal();
  const handleTabKeyDown = useTabKeyNavigation();
  // Default to 'lastfm' per spec; URL param overrides; persisted preference loaded async
  const [activeTab, setActiveTab] = useState<HistoryTab>(
    () => getTabFromUrl() ?? 'lastfm'
  );
  const [sessions, setSessions] = useState<ScrobbleSession[]>([]);
  /** Sessions matching the search, and all sessions */
  const [total, setTotal] = useState(0);
  const [unfilteredTotal, setUnfilteredTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedSession, setSelectedSession] =
    useState<ScrobbleSession | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedQuery = searchQuery.trim().toLowerCase();
  // The search sent to the server, once typing pauses
  const [appliedQuery, setAppliedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(
      () => setAppliedQuery(normalizedQuery),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [normalizedQuery]);
  // Only the newest request may update the list
  const requestRef = useRef(0);
  // Read at call time, so a reload started before a new search (e.g. after
  // a resubmit) loads the current search and shown count
  const appliedQueryRef = useRef(appliedQuery);
  appliedQueryRef.current = appliedQuery;
  const shownCountRef = useRef(0);
  shownCountRef.current = sessions.length;
  // The search the list was last loaded for (null: not loaded yet)
  const loadedQueryRef = useRef<string | null>(null);

  const api = getApiService(state.serverUrl);

  useEffect(() => {
    // Check authentication status if not already authenticated
    if (!authStatus.lastfm.authenticated) {
      checkAuthStatus();
    }
  }, []);

  // Load persisted history tab preference (URL param takes priority)
  useEffect(() => {
    const urlTab = getTabFromUrl();
    if (urlTab) return; // URL takes priority, no need to load preference
    api
      .getUserPreferences()
      .then((prefs: { historyDefaultTab?: 'sessions' | 'lastfm' }) => {
        setActiveTab(prefs.historyDefaultTab ?? 'lastfm');
      })
      .catch((err: unknown) => {
        logger.warn('Failed to load history tab preference', err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow in-app deep links (e.g. #history?tab=unresolved) while mounted
  useEffect(() => {
    const handleHashChange = () => {
      const urlTab = getTabFromUrl();
      if (urlTab) setActiveTab(urlTab);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sessions load only on their tab, and again when the search changes
  useEffect(() => {
    if (
      authStatus.lastfm.authenticated &&
      activeTab === 'sessions' &&
      loadedQueryRef.current !== appliedQuery
    ) {
      loadHistory();
    }
  }, [authStatus.lastfm.authenticated, activeTab, appliedQuery]);

  const checkAuthStatus = async () => {
    try {
      const status = await api.getAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      logger.error('Error checking auth status', error);
    }
  };

  /**
   * Load the first page for the current search. After an action the pages
   * already shown are re-read (up to API_MAX_PAGE sessions).
   */
  const loadHistory = async (keepShown = false) => {
    const request = ++requestRef.current;
    const query = appliedQueryRef.current;
    const limit = keepShown
      ? Math.min(API_MAX_PAGE, Math.max(PAGE_SIZE, shownCountRef.current))
      : PAGE_SIZE;
    loadedQueryRef.current = query;
    setLoading(true);
    setLoadingMore(false);
    setError('');

    try {
      const page = await api.getScrobbleHistoryPage({
        offset: 0,
        limit,
        q: query,
      });
      if (request !== requestRef.current) return;
      setSessions(page.sessions);
      setTotal(page.total);
      setUnfilteredTotal(page.unfilteredTotal);
    } catch (error) {
      if (request !== requestRef.current) return;
      // Forget the search so returning to the tab tries again
      loadedQueryRef.current = null;
      setSessions([]);
      setTotal(0);
      setError(
        error instanceof Error ? error.message : 'Failed to load history'
      );
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    const request = ++requestRef.current;
    setLoadingMore(true);
    setError('');
    try {
      const page = await api.getScrobbleHistoryPage({
        offset: sessions.length,
        limit: PAGE_SIZE,
        q: appliedQuery,
      });
      if (request !== requestRef.current) return;
      const shown = new Set(sessions.map(session => session.id));
      setSessions([
        ...sessions,
        ...page.sessions.filter(session => !shown.has(session.id)),
      ]);
      setTotal(page.total);
      setUnfilteredTotal(page.unfilteredTotal);
    } catch (error) {
      if (request !== requestRef.current) return;
      setError(
        error instanceof Error ? error.message : 'Failed to load more sessions'
      );
    } finally {
      if (request === requestRef.current) setLoadingMore(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return formatLocalTimeClean(timestamp);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const confirmed = await confirmAction(
      'Are you sure you want to delete this session? This action cannot be undone.',
      { title: 'Delete Session', confirmLabel: 'Delete' }
    );
    if (!confirmed) {
      return;
    }

    setActionLoading(`delete-${sessionId}`);
    try {
      await api.deleteScrobbleSession(sessionId);
      // Reload history to reflect the change
      await loadHistory(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to delete session'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleResubmitSession = async (sessionId: string) => {
    setActionLoading(`resubmit-${sessionId}`);
    try {
      await api.resubmitScrobbleSession(sessionId);
      // Reload history to reflect the change
      await loadHistory(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to resubmit session'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleResubmitTrack = async (sessionId: string, trackIndex: number) => {
    setActionLoading(`resubmit-track-${sessionId}-${trackIndex}`);
    try {
      await api.resubmitSessionTrack(sessionId, trackIndex);
      await loadHistory(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to resubmit track'
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleBackfillCovers = async () => {
    if (!authStatus.discogs.authenticated || !authStatus.discogs.username) {
      setError('Discogs authentication required to backfill album covers');
      return;
    }

    const confirmed = await confirmAction(
      'This will search your Discogs collection to add album covers to existing scrobble sessions. This may take a while for large collections. Continue?',
      { title: 'Backfill Album Covers', confirmLabel: 'Continue' }
    );
    if (!confirmed) {
      return;
    }

    setBackfillLoading(true);
    setError('');

    try {
      const result = await api.backfillAlbumCovers(authStatus.discogs.username);

      showToast(
        'success',
        `Backfill completed: updated ${result.updatedSessions} sessions, added covers to ${result.updatedTracks} tracks (${result.totalSessions} total processed)`
      );

      // Reload history to show the new covers
      await loadHistory(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to backfill album covers'
      );
    } finally {
      setBackfillLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check size={14} aria-hidden='true' />;
      case 'failed':
        return <XCircle size={14} aria-hidden='true' />;
      case 'pending':
        return <Clock size={14} aria-hidden='true' />;
      default:
        return <Circle size={14} aria-hidden='true' />;
    }
  };

  const getUniqueAlbumCovers = (tracks: ScrobbleTrack[]) => {
    const uniqueAlbums = new Map();
    tracks.forEach(track => {
      if (track.album && track.albumCover && !uniqueAlbums.has(track.album)) {
        uniqueAlbums.set(track.album, {
          album: track.album,
          artist: track.artist,
          cover: track.albumCover,
        });
      }
    });
    return Array.from(uniqueAlbums.values());
  };

  if (!authStatus.lastfm.authenticated) {
    return (
      <div className='card'>
        <h2>History</h2>
        <p>
          Please authenticate with Last.fm first to view your scrobbling
          history.
        </p>
        <div className='history-auth-link-container'>
          <a
            href='#settings?tab=connections'
            className='button button--primary button--medium'
          >
            Connect Last.fm
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {ConfirmModal}
      {/* Page Header */}
      <div className='card'>
        <h2>History</h2>
        <p className='history-page-description'>
          View your scrobbling activity from this app and your complete Last.fm
          listening history.
        </p>
      </div>

      {/* Tab Navigation */}
      <div
        className='history-tabs'
        role='tablist'
        aria-label='History sections'
      >
        <button
          role='tab'
          className={`history-tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
          onKeyDown={handleTabKeyDown}
          aria-selected={activeTab === 'sessions'}
          tabIndex={activeTab === 'sessions' ? 0 : -1}
        >
          App Scrobble Sessions
        </button>
        <button
          role='tab'
          className={`history-tab ${activeTab === 'lastfm' ? 'active' : ''}`}
          onClick={() => setActiveTab('lastfm')}
          onKeyDown={handleTabKeyDown}
          aria-selected={activeTab === 'lastfm'}
          tabIndex={activeTab === 'lastfm' ? 0 : -1}
        >
          Last.fm Listening History
        </button>
        <button
          role='tab'
          className={`history-tab ${activeTab === 'unresolved' ? 'active' : ''}`}
          onClick={() => setActiveTab('unresolved')}
          onKeyDown={handleTabKeyDown}
          aria-selected={activeTab === 'unresolved'}
          tabIndex={activeTab === 'unresolved' ? 0 : -1}
        >
          Unresolved
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'lastfm' && <LastFmHistoryTab />}

      {activeTab === 'unresolved' && <UnresolvedHistoryTab />}

      {activeTab === 'sessions' && (
        <>
          <div className='card'>
            <div className='history-sessions-header'>
              <div>
                <h3 className='history-sessions-title'>
                  Scrobbled from This App
                </h3>
                <span className='history-sessions-timezone'>
                  Times shown in {getTimezoneOffset()}
                </span>
              </div>
              <div className='history-sessions-actions'>
                {authStatus.discogs.authenticated && (
                  <Button
                    variant='secondary'
                    size='small'
                    onClick={handleBackfillCovers}
                    disabled={backfillLoading || loading}
                    title='Add album covers to existing scrobble sessions using your Discogs collection'
                  >
                    {backfillLoading ? 'Backfilling...' : 'Backfill Covers'}
                  </Button>
                )}
                <Button
                  variant='secondary'
                  size='small'
                  onClick={() => loadHistory(true)}
                  disabled={loading}
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </div>

            {(unfilteredTotal > 0 || searchQuery) && (
              <div className='history-sessions-search'>
                <input
                  type='text'
                  placeholder='Search by artist, album, or track...'
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className='history-sessions-search-input'
                  aria-label='Search scrobble sessions'
                />
                {searchQuery && (
                  <button
                    className='history-sessions-search-clear'
                    onClick={() => setSearchQuery('')}
                    aria-label='Clear search'
                  >
                    ×
                  </button>
                )}
              </div>
            )}
            {appliedQuery &&
              appliedQuery === normalizedQuery &&
              !loading &&
              total > 0 && (
                <div className='history-sessions-search-count'>
                  {total} of {unfilteredTotal} sessions match
                </div>
              )}

            {error && (
              <div className='error-message'>
                {error}
                <Button
                  size='small'
                  className='history-error-retry'
                  onClick={() => loadHistory()}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>

          {loading && !sessions.length && (
            <div className='history-sessions-grid'>
              <SessionCardSkeleton count={3} />
            </div>
          )}

          {!loading && !appliedQuery && sessions.length === 0 && !error && (
            <div className='card'>
              <EmptyState
                icon={<FileText size={48} aria-hidden='true' />}
                title='No Scrobble Sessions Yet'
                description='Start scrobbling tracks from your collection to see your listening history here.'
                suggestion='Select an album from your collection and click "Scrobble" to begin.'
                actions={[
                  {
                    label: 'Browse Collection',
                    onClick: () => {
                      navigate('collection');
                    },
                  },
                ]}
              />
            </div>
          )}

          {!loading &&
            !!appliedQuery &&
            appliedQuery === normalizedQuery &&
            sessions.length === 0 &&
            !error && (
              <div className='card'>
                <EmptyState
                  icon={<FileText size={48} aria-hidden='true' />}
                  title='No Matching Sessions'
                  description={`No scrobble sessions contain "${searchQuery.trim()}".`}
                  suggestion='Try a different artist, album, or track name.'
                />
              </div>
            )}

          {sessions.length > 0 && (
            <div className='history-sessions-grid'>
              {sessions.map(session => (
                <ScrobbleSessionCard
                  key={session.id}
                  session={session}
                  isExpanded={selectedSession?.id === session.id}
                  onToggleDetails={() =>
                    setSelectedSession(
                      selectedSession?.id === session.id ? null : session
                    )
                  }
                  getStatusIcon={getStatusIcon}
                  formatDate={formatDate}
                  formatTrackTimestamp={formatLocalTimeClean}
                  onDelete={handleDeleteSession}
                  onResubmit={handleResubmitSession}
                  onResubmitTrack={handleResubmitTrack}
                  actionLoading={actionLoading}
                  getUniqueAlbumCovers={getUniqueAlbumCovers}
                />
              ))}
            </div>
          )}

          {sessions.length > 0 && sessions.length < total && (
            <div className='history-load-more'>
              <Button
                variant='secondary'
                onClick={loadMore}
                disabled={loadingMore || loading}
              >
                {loadingMore
                  ? 'Loading...'
                  : `Show more (${total - sessions.length} older)`}
              </Button>
            </div>
          )}

          {!appliedQuery && unfilteredTotal > 10 && (
            <div className='card history-footer'>
              <div className='history-footer-text'>
                Showing recent sessions. Older sessions may be automatically
                cleaned up.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HistoryPage;
