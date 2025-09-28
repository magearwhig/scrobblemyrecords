import React, { useState, useEffect } from 'react';

import { ScrobbleSession } from '../../shared/types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { formatLocalTimeClean, getTimezoneOffset } from '../utils/dateUtils';

const HistoryPage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state } = useApp();
  const [sessions, setSessions] = useState<ScrobbleSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedSession, setSelectedSession] =
    useState<ScrobbleSession | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      console.error('Error checking auth status:', error);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#28a745';
      case 'failed':
        return '#dc3545';
      case 'pending':
        return '#ffc107';
      default:
        return '#6c757d';
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

  const getUniqueAlbumCovers = (tracks: any[]) => {
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
        <h2>Scrobble History</h2>
        <p>
          Please authenticate with Last.fm first to view your scrobbling
          history.
        </p>
        <div style={{ marginTop: '1rem' }}>
          <a href='#setup' className='btn'>
            Go to Setup
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className='card'>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2>Scrobble History</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Times shown in {getTimezoneOffset()}
            </span>
          </div>
          <button
            className='btn btn-small btn-secondary'
            onClick={loadHistory}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className='error-message'>
            {error}
            <button
              className='btn btn-small'
              onClick={loadHistory}
              style={{ marginLeft: '1rem' }}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {loading && !sessions.length && (
        <div className='card'>
          <div className='loading'>
            <div className='spinner'></div>
            Loading scrobble history...
          </div>
        </div>
      )}

      {!loading && sessions.length === 0 && !error && (
        <div className='card'>
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            No scrobbling sessions found. Start scrobbling some tracks to see
            them here!
          </div>
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <a href='#collection' className='btn'>
              Browse Collection
            </a>
          </div>
        </div>
      )}

      {sessions.length > 0 && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {sessions.map(session => (
            <div key={session.id} className='card'>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span style={{ fontSize: '1.2rem' }}>
                      {getStatusIcon(session.status)}
                    </span>
                    <span
                      style={{
                        color: getStatusColor(session.status),
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {session.status}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '0.9rem',
                      color: '#666',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {formatDate(session.timestamp)}
                  </div>

                  <div style={{ fontSize: '0.9rem' }}>
                    <strong>{session.tracks.length}</strong> tracks
                    {session.status === 'completed' && (
                      <span style={{ color: '#28a745', marginLeft: '0.5rem' }}>
                        • Successfully scrobbled
                      </span>
                    )}
                    {session.status === 'failed' && session.error && (
                      <span style={{ color: '#dc3545', marginLeft: '0.5rem' }}>
                        • {session.error}
                      </span>
                    )}
                  </div>

                  {/* Album cover thumbnails */}
                  {(() => {
                    const uniqueAlbums = getUniqueAlbumCovers(session.tracks);
                    if (uniqueAlbums.length > 0) {
                      return (
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginTop: '0.75rem',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          {uniqueAlbums.slice(0, 5).map((album, idx) => (
                            <div
                              key={idx}
                              title={`${album.album} by ${album.artist}`}
                              style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '4px',
                                backgroundImage: `url(${album.cover})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                backgroundColor: '#f0f0f0',
                                border: '1px solid #e0e0e0',
                                cursor: 'pointer',
                              }}
                            />
                          ))}
                          {uniqueAlbums.length > 5 && (
                            <div
                              style={{
                                fontSize: '0.8rem',
                                color: '#666',
                                marginLeft: '0.5rem',
                              }}
                            >
                              +{uniqueAlbums.length - 5} more
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                  }}
                >
                  <button
                    className='btn btn-small btn-secondary'
                    onClick={() =>
                      setSelectedSession(
                        selectedSession?.id === session.id ? null : session
                      )
                    }
                  >
                    {selectedSession?.id === session.id
                      ? 'Hide Details'
                      : 'View Details'}
                  </button>

                  {/* Action buttons for pending and failed sessions */}
                  {(session.status === 'pending' ||
                    session.status === 'failed') && (
                    <>
                      <button
                        className='btn btn-small btn-danger'
                        onClick={() => handleDeleteSession(session.id)}
                        disabled={actionLoading === `delete-${session.id}`}
                      >
                        {actionLoading === `delete-${session.id}`
                          ? 'Deleting...'
                          : 'Delete'}
                      </button>
                      <button
                        className='btn btn-small'
                        onClick={() => handleResubmitSession(session.id)}
                        disabled={actionLoading === `resubmit-${session.id}`}
                      >
                        {actionLoading === `resubmit-${session.id}`
                          ? 'Resubmitting...'
                          : 'Resubmit'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selectedSession?.id === session.id && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e9ecef',
                    color: '#333',
                  }}
                >
                  <h4
                    style={{
                      marginTop: 0,
                      marginBottom: '1rem',
                      color: '#333',
                    }}
                  >
                    Session Details
                  </h4>

                  <div style={{ marginBottom: '1rem', color: '#333' }}>
                    <strong>Session ID:</strong> {session.id}
                  </div>

                  <div style={{ marginBottom: '1rem', color: '#333' }}>
                    <strong>Tracks ({session.tracks.length}):</strong>
                  </div>

                  <div
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      backgroundColor: 'white',
                    }}
                  >
                    {session.tracks.map((track, index) => (
                      <div
                        key={index}
                        style={{
                          padding: '0.75rem',
                          borderBottom:
                            index < session.tracks.length - 1
                              ? '1px solid #f0f0f0'
                              : 'none',
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 500,
                            fontSize: '0.9rem',
                            color: '#333',
                          }}
                        >
                          {track.track}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#666' }}>
                          {track.artist} • {track.album}
                        </div>
                        {track.timestamp && (
                          <div style={{ fontSize: '0.75rem', color: '#999' }}>
                            Scrobbled:{' '}
                            {formatLocalTimeClean(track.timestamp * 1000)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {sessions.length > 10 && (
        <div className='card' style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ color: '#666' }}>
            Showing recent sessions. Older sessions may be automatically cleaned
            up.
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
