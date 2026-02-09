import React, { useState, useEffect } from 'react';

import { ScrobbleSession, ScrobbleTrack } from '../../shared/types';
import LastFmHistoryTab from '../components/LastFmHistoryTab';
import ScrobbleSessionCard from '../components/ScrobbleSessionCard';
import { EmptyState } from '../components/ui/EmptyState';
import { SessionCardSkeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { formatLocalTimeClean, getTimezoneOffset } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('HistoryPage');

type HistoryTab = 'sessions' | 'lastfm';

// Auto-select lastfm tab when deep-linked with ?view= param
const getInitialTab = (): HistoryTab => {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return 'sessions';

  const queryString = hash.slice(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  if (params.get('view')) return 'lastfm';
  return 'sessions';
};

const HistoryPage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state } = useApp();
  const [activeTab, setActiveTab] = useState<HistoryTab>(getInitialTab);
  const [sessions, setSessions] = useState<ScrobbleSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedSession, setSelectedSession] =
    useState<ScrobbleSession | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);

  const api = getApiService(state.serverUrl);

  useEffect(() => {
    // Check authentication status if not already authenticated
    if (!authStatus.lastfm.authenticated) {
      checkAuthStatus();
    }
  }, []);

  useEffect(() => {
    if (authStatus.lastfm.authenticated) {
      loadHistory();
    }
  }, [authStatus.lastfm.authenticated]);

  const checkAuthStatus = async () => {
    try {
      const status = await api.getAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      logger.error('Error checking auth status', error);
    }
  };

  const loadHistory = async () => {
    setLoading(true);
    setError('');

    try {
      const history = await api.getScrobbleHistory();
      setSessions(history);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to load history'
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return formatLocalTimeClean(timestamp);
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this session? This action cannot be undone.'
      )
    ) {
      return;
    }

    setActionLoading(`delete-${sessionId}`);
    try {
      await api.deleteScrobbleSession(sessionId);
      // Reload history to reflect the change
      await loadHistory();
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
      await loadHistory();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to resubmit session'
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

    if (
      !window.confirm(
        'This will search your Discogs collection to add album covers to existing scrobble sessions. This may take a while for large collections. Continue?'
      )
    ) {
      return;
    }

    setBackfillLoading(true);
    setError('');

    try {
      const result = await api.backfillAlbumCovers(authStatus.discogs.username);

      // Show success message
      // eslint-disable-next-line no-undef
      alert(
        `Backfill completed!\n\n` +
          `• Updated ${result.updatedSessions} sessions\n` +
          `• Added covers to ${result.updatedTracks} tracks\n` +
          `• Processed ${result.totalSessions} total sessions`
      );

      // Reload history to show the new covers
      await loadHistory();
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
        return '✅';
      case 'failed':
        return '❌';
      case 'pending':
        return '⏳';
      default:
        return '⚪';
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
          <a href='#settings?tab=connections' className='btn'>
            Connect Last.fm
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className='card'>
        <h2>History</h2>
        <p className='history-page-description'>
          View your scrobbling activity from this app and your complete Last.fm
          listening history.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className='history-tabs'>
        <button
          className={`history-tab ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          App Scrobble Sessions
        </button>
        <button
          className={`history-tab ${activeTab === 'lastfm' ? 'active' : ''}`}
          onClick={() => setActiveTab('lastfm')}
        >
          Last.fm Listening History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'lastfm' && <LastFmHistoryTab />}

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
                  <button
                    className='btn btn-small btn-secondary'
                    onClick={handleBackfillCovers}
                    disabled={backfillLoading || loading}
                    title='Add album covers to existing scrobble sessions using your Discogs collection'
                  >
                    {backfillLoading ? 'Backfilling...' : 'Backfill Covers'}
                  </button>
                )}
                <button
                  className='btn btn-small btn-secondary'
                  onClick={loadHistory}
                  disabled={loading}
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>

            {error && (
              <div className='error-message'>
                {error}
                <button
                  className='btn btn-small history-error-retry'
                  onClick={loadHistory}
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {loading && !sessions.length && (
            <div className='history-sessions-grid'>
              <SessionCardSkeleton count={3} />
            </div>
          )}

          {!loading && sessions.length === 0 && !error && (
            <div className='card'>
              <EmptyState
                icon='📝'
                title='No Scrobble Sessions Yet'
                description='Start scrobbling tracks from your collection to see your listening history here.'
                suggestion='Select an album from your collection and click "Scrobble" to begin.'
                actions={[
                  {
                    label: 'Browse Collection',
                    onClick: () => {
                      window.location.hash = 'collection';
                    },
                  },
                ]}
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
                  actionLoading={actionLoading}
                  getUniqueAlbumCovers={getUniqueAlbumCovers}
                />
              ))}
            </div>
          )}

          {sessions.length > 10 && (
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
