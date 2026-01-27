import React, { useEffect, useState, useCallback } from 'react';

import { useApp } from '../context/AppContext';
import { useNotifications } from '../hooks/useNotifications';
import { getApiService } from '../services/api';

import { Modal, ModalFooter } from './ui';

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
  const { addNotification } = useNotifications();
  const [history, setHistory] = useState<AlbumHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Mapping modal state
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{
      artist: string;
      album: string;
      playCount: number;
      lastPlayed: number;
    }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mappingInProgress, setMappingInProgress] = useState(false);
  const [existingMappings, setExistingMappings] = useState<Set<string>>(
    new Set()
  );

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

  // Search Last.fm scrobble history
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    try {
      setSearchLoading(true);
      const response = await api.getAlbumHistoryPaginated(
        1,
        20,
        'playCount',
        'desc',
        searchQuery
      );
      setSearchResults(response.items);
    } catch {
      // Search failed silently - user can try again
    } finally {
      setSearchLoading(false);
    }
  }, [api, searchQuery]);

  // Create mapping from selected Last.fm album to current Discogs album
  const handleSelectMapping = async (historyItem: {
    artist: string;
    album: string;
    playCount: number;
    lastPlayed: number;
  }) => {
    try {
      setMappingInProgress(true);

      await api.createDiscoveryAlbumMapping({
        historyArtist: historyItem.artist,
        historyAlbum: historyItem.album,
        collectionId: 0, // Not available in this context
        collectionArtist: artist,
        collectionAlbum: album,
      });

      // Add to existing mappings set so it shows as mapped immediately
      const mappingKey = `${historyItem.artist.toLowerCase()}|${historyItem.album.toLowerCase()}`;
      setExistingMappings(prev => new Set(prev).add(mappingKey));

      // Reload history to show the newly mapped scrobbles
      const data = await api.getAlbumHistory(artist, album);
      setHistory(data);

      // Don't close modal - allow user to create more mappings
      // Just clear the search to allow a new search
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      addNotification({
        type: 'error',
        message:
          err instanceof Error
            ? `Failed to create mapping: ${err.message}`
            : 'Failed to create mapping',
      });
    } finally {
      setMappingInProgress(false);
    }
  };

  const openMappingModal = async () => {
    setShowMappingModal(true);
    // Pre-fill with artist name to help narrow search
    setSearchQuery(artist);
    setSearchResults([]);

    // Load existing mappings to show indicators
    try {
      const mappings = await api.getDiscoveryAlbumMappings();
      const mappingKeys = new Set<string>(
        mappings
          .filter(
            (m: { collectionArtist: string; collectionAlbum: string }) =>
              m.collectionArtist.toLowerCase() === artist.toLowerCase() &&
              m.collectionAlbum.toLowerCase() === album.toLowerCase()
          )
          .map(
            (m: { historyArtist: string; historyAlbum: string }) =>
              `${m.historyArtist.toLowerCase()}|${m.historyAlbum.toLowerCase()}`
          )
      );
      setExistingMappings(mappingKeys);
    } catch {
      // Failed to load mappings silently - user can still create new ones
    }
  };

  const closeMappingModal = () => {
    setShowMappingModal(false);
    setSearchQuery('');
    setSearchResults([]);
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
      <>
        <div className='album-history'>
          <div className='album-history-header'>
            <h3>Scrobble History</h3>
          </div>
          <div className='album-history-empty'>
            <span className='album-history-empty-icon'>📀</span>
            <p>No scrobbles found for this album</p>
            <p className='album-history-empty-hint'>
              If you've scrobbled this album under a different name on Last.fm,
              you can create a mapping to link them together.
            </p>
            <button
              onClick={openMappingModal}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              🔗 Map to Last.fm Album
            </button>
          </div>
        </div>

        {/* Mapping Modal */}
        <Modal
          isOpen={showMappingModal}
          onClose={closeMappingModal}
          title='Map Album to Last.fm History'
          size='medium'
          className='mapping-modal'
        >
          <div className='mapping-source'>
            <strong>Mapping scrobbles to:</strong>
            <div className='mapping-source-info'>
              <span className='mapping-album'>{album}</span>
              <span className='mapping-artist'>by {artist}</span>
            </div>
          </div>

          <div className='mapping-search'>
            <label>
              Search your Last.fm scrobble history to find the album you want to
              map:
            </label>
            <div className='mapping-search-row'>
              <input
                type='text'
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder='Search for artist or album...'
                className='mapping-search-input'
              />
              <button
                className='btn'
                onClick={handleSearch}
                disabled={searchLoading || !searchQuery.trim()}
              >
                {searchLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          <div className='mapping-results'>
            {searchLoading ? (
              <div className='mapping-results-loading'>
                <div className='loading-spinner' />
              </div>
            ) : searchResults.length === 0 ? (
              <p className='mapping-results-empty'>
                {searchQuery
                  ? 'No matching albums found in your Last.fm history.'
                  : 'Enter a search term to find albums in your Last.fm scrobble history.'}
              </p>
            ) : (
              <div className='mapping-results-list'>
                {searchResults.map((item, index) => (
                  <div
                    key={`${item.artist}-${item.album}-${index}`}
                    className='mapping-result-item'
                    onClick={() =>
                      !mappingInProgress && handleSelectMapping(item)
                    }
                    style={{ cursor: 'pointer' }}
                  >
                    <div className='mapping-result-info'>
                      <div className='mapping-result-title'>{item.album}</div>
                      <div className='mapping-result-artist'>{item.artist}</div>
                      <div className='mapping-result-stats'>
                        <span>{item.playCount} plays</span>
                        <span className='separator'>•</span>
                        <span>Last played: {formatDate(item.lastPlayed)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ModalFooter>
            <button className='btn btn-secondary' onClick={closeMappingModal}>
              Cancel
            </button>
          </ModalFooter>
        </Modal>
      </>
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
    <>
      <div className='album-history'>
        <div className='album-history-header'>
          <h3>Scrobble History</h3>
          <button
            onClick={openMappingModal}
            style={{
              marginLeft: 'auto',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            🔗 Add Mapping
          </button>
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
            <span className='album-history-stat-value'>
              {history.playCount}
            </span>
            <span className='album-history-stat-detail'>
              {history.playCount === 1 ? 'track scrobble' : 'track scrobbles'}
            </span>
          </div>

          <div className='album-history-stat'>
            <span className='album-history-stat-label'>Sessions</span>
            <span className='album-history-stat-value'>{playsByDay.size}</span>
            <span className='album-history-stat-detail'>
              {playsByDay.size === 1
                ? 'listening session'
                : 'listening sessions'}
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
                    <span className='album-history-item-track'>
                      {play.track}
                    </span>
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

      {/* Mapping Modal */}
      <Modal
        isOpen={showMappingModal}
        onClose={closeMappingModal}
        title='Map Album to Last.fm History'
        size='medium'
        className='mapping-modal'
      >
        <div className='mapping-source'>
          <strong>Mapping scrobbles to:</strong>
          <div className='mapping-source-info'>
            <span className='mapping-album'>{album}</span>
            <span className='mapping-artist'>by {artist}</span>
          </div>
        </div>

        <div className='mapping-search'>
          <div className='mapping-search-input'>
            <input
              type='text'
              placeholder='Search Last.fm scrobble history...'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              disabled={searchLoading || mappingInProgress}
            />
            <button
              className='btn btn-primary'
              onClick={handleSearch}
              disabled={
                !searchQuery.trim() || searchLoading || mappingInProgress
              }
            >
              {searchLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        <div className='mapping-results'>
          {searchResults.length === 0 ? (
            <p className='mapping-results-empty'>
              {searchQuery && !searchLoading
                ? 'No matching albums found in your Last.fm history.'
                : 'Enter a search term to find albums in your Last.fm scrobble history.'}
            </p>
          ) : (
            <div className='mapping-results-list'>
              {searchResults.map((item, index) => {
                const mappingKey = `${item.artist.toLowerCase()}|${item.album.toLowerCase()}`;
                const isAlreadyMapped = existingMappings.has(mappingKey);

                return (
                  <div
                    key={`${item.artist}-${item.album}-${index}`}
                    className={`mapping-result-item ${isAlreadyMapped ? 'mapping-result-item-disabled' : ''}`}
                    onClick={() =>
                      !mappingInProgress &&
                      !isAlreadyMapped &&
                      handleSelectMapping(item)
                    }
                    style={{
                      cursor: isAlreadyMapped ? 'not-allowed' : 'pointer',
                      opacity: isAlreadyMapped ? 0.6 : 1,
                    }}
                  >
                    <div className='mapping-result-info'>
                      <div className='mapping-result-title'>
                        {item.album}
                        {isAlreadyMapped && (
                          <span
                            style={{
                              marginLeft: '0.5rem',
                              padding: '0.2rem 0.5rem',
                              fontSize: '0.75rem',
                              backgroundColor: 'var(--color-success)',
                              color: 'white',
                              borderRadius: '4px',
                            }}
                          >
                            ✓ Mapped
                          </span>
                        )}
                      </div>
                      <div className='mapping-result-artist'>{item.artist}</div>
                      <div className='mapping-result-stats'>
                        <span>{item.playCount} plays</span>
                        <span className='separator'>•</span>
                        <span>Last played: {formatDate(item.lastPlayed)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <ModalFooter>
          <button className='btn btn-secondary' onClick={closeMappingModal}>
            Cancel
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default AlbumScrobbleHistory;
