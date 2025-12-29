import React, { useEffect, useState } from 'react';

import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';

interface AlbumHistoryData {
  found: boolean;
  artist: string;
  album: string;
  lastPlayed: number | null;
  playCount: number;
  plays: Array<{ timestamp: number; track?: string }>;
}

interface AlbumScrobbleHistoryProps {
  artist: string;
  album: string;
}

const AlbumScrobbleHistory: React.FC<AlbumScrobbleHistoryProps> = ({
  artist,
  album,
}) => {
  const { state } = useApp();
  const [history, setHistory] = useState<AlbumHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const api = getApiService(state.serverUrl);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getAlbumHistory(artist, album);
        setHistory(data);
      } catch (err) {
        // 404 means never played, which is not an error
        if (err instanceof Error && err.message.includes('404')) {
          setHistory(null);
        } else {
          setError(
            err instanceof Error ? err.message : 'Failed to load history'
          );
        }
      } finally {
        setLoading(false);
      }
    };

    if (artist && album) {
      fetchHistory();
    }
  }, [artist, album, api]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp * 1000;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
  };

  if (loading) {
    return (
      <div className='album-history'>
        <div className='album-history-header'>
          <h3>Scrobble History</h3>
        </div>
        <div className='album-history-loading'>Loading history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='album-history'>
        <div className='album-history-header'>
          <h3>Scrobble History</h3>
        </div>
        <div className='album-history-error'>{error}</div>
      </div>
    );
  }

  if (!history || !history.found || history.playCount === 0) {
    return (
      <div className='album-history'>
        <div className='album-history-header'>
          <h3>Scrobble History</h3>
        </div>
        <div className='album-history-empty'>
          <span className='album-history-empty-icon'>📀</span>
          <p>No scrobbles found for this album</p>
          <p className='album-history-empty-hint'>
            Play this album and scrobble it to see your listening history here.
          </p>
        </div>
      </div>
    );
  }

  // Get unique plays by day for the timeline
  const playsByDay = new Map<string, number[]>();
  for (const play of history.plays) {
    const dayKey = formatDate(play.timestamp);
    if (!playsByDay.has(dayKey)) {
      playsByDay.set(dayKey, []);
    }
    playsByDay.get(dayKey)!.push(play.timestamp);
  }

  // Sort plays by most recent first
  const sortedPlays = [...history.plays].sort(
    (a, b) => b.timestamp - a.timestamp
  );
  const recentPlays = expanded ? sortedPlays : sortedPlays.slice(0, 5);

  // At this point we know lastPlayed is not null because playCount > 0
  const lastPlayed = history.lastPlayed as number;

  return (
    <div className='album-history'>
      <div className='album-history-header'>
        <h3>Scrobble History</h3>
      </div>

      <div className='album-history-stats'>
        <div className='album-history-stat'>
          <span className='album-history-stat-label'>Last Played</span>
          <span className='album-history-stat-value'>
            {formatRelativeTime(lastPlayed)}
          </span>
          <span className='album-history-stat-detail'>
            {formatDate(lastPlayed)}
          </span>
        </div>

        <div className='album-history-stat'>
          <span className='album-history-stat-label'>Total Plays</span>
          <span className='album-history-stat-value'>{history.playCount}</span>
          <span className='album-history-stat-detail'>
            {history.playCount === 1 ? 'track scrobble' : 'track scrobbles'}
          </span>
        </div>

        <div className='album-history-stat'>
          <span className='album-history-stat-label'>Sessions</span>
          <span className='album-history-stat-value'>{playsByDay.size}</span>
          <span className='album-history-stat-detail'>
            {playsByDay.size === 1 ? 'listening session' : 'listening sessions'}
          </span>
        </div>
      </div>

      <div className='album-history-timeline'>
        <h4>Recent Scrobbles</h4>
        <div className='album-history-list'>
          {recentPlays.map((play, index) => (
            <div
              key={`${play.timestamp}-${index}`}
              className='album-history-item'
            >
              <span className='album-history-item-date'>
                {formatDateTime(play.timestamp)}
              </span>
              {play.track && (
                <>
                  <span className='album-history-item-separator'>—</span>
                  <span className='album-history-item-track'>{play.track}</span>
                </>
              )}
            </div>
          ))}
        </div>

        {sortedPlays.length > 5 && (
          <button
            className='album-history-toggle'
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? 'Show less'
              : `Show all ${sortedPlays.length} scrobbles`}
          </button>
        )}
      </div>
    </div>
  );
};

export default AlbumScrobbleHistory;
