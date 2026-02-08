import React, { useState, useEffect, useCallback } from 'react';

import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { playTrackOnSpotify } from '../utils/spotifyUtils';

import SyncStatusBar from './SyncStatusBar';

interface AlbumHistoryItem {
  artist: string;
  album: string;
  playCount: number;
  lastPlayed: number;
}

interface TrackHistoryItem {
  artist: string;
  album: string;
  track: string;
  playCount: number;
  lastPlayed: number;
}

interface ArtistHistoryItem {
  artist: string;
  playCount: number;
  albumCount: number;
  lastPlayed: number;
}

type ViewMode = 'albums' | 'tracks' | 'artists';
type AlbumSortBy = 'playCount' | 'lastPlayed' | 'artist' | 'album';
type TrackSortBy = 'playCount' | 'lastPlayed' | 'artist' | 'album' | 'track';
type ArtistSortBy = 'playCount' | 'lastPlayed' | 'artist' | 'albumCount';
type SortOrder = 'asc' | 'desc';

// Parse view mode from URL hash query params (e.g., #history?view=artists)
const getViewFromUrl = (): ViewMode | null => {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;

  const queryString = hash.slice(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  const view = params.get('view');

  if (view === 'albums' || view === 'tracks' || view === 'artists') {
    return view;
  }
  return null;
};

const LastFmHistoryTab: React.FC = () => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  // View mode toggle (supports deep-linking via ?view= param)
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => getViewFromUrl() || 'albums'
  );

  // Album data
  const [albums, setAlbums] = useState<AlbumHistoryItem[]>([]);

  // Track data
  const [tracks, setTracks] = useState<TrackHistoryItem[]>([]);

  // Artist data
  const [artists, setArtists] = useState<ArtistHistoryItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 50;

  // Search and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [albumSortBy, setAlbumSortBy] = useState<AlbumSortBy>('playCount');
  const [trackSortBy, setTrackSortBy] = useState<TrackSortBy>('playCount');
  const [artistSortBy, setArtistSortBy] = useState<ArtistSortBy>('playCount');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset pagination when switching view modes
  useEffect(() => {
    setPage(1);
  }, [viewMode]);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.getAlbumHistoryPaginated(
        page,
        perPage,
        albumSortBy,
        sortOrder,
        debouncedSearch || undefined
      );
      setAlbums(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load album history'
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, perPage, albumSortBy, sortOrder, debouncedSearch]);

  const loadTracks = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.getTrackHistoryPaginated(
        page,
        perPage,
        trackSortBy,
        sortOrder,
        debouncedSearch || undefined
      );
      setTracks(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load track history'
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, perPage, trackSortBy, sortOrder, debouncedSearch]);

  const loadArtists = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.getArtistHistoryPaginated(
        page,
        perPage,
        artistSortBy,
        sortOrder,
        debouncedSearch || undefined
      );
      setArtists(result.items);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load artist history'
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, perPage, artistSortBy, sortOrder, debouncedSearch]);

  useEffect(() => {
    if (viewMode === 'albums') {
      loadAlbums();
    } else if (viewMode === 'tracks') {
      loadTracks();
    } else {
      loadArtists();
    }
  }, [viewMode, loadAlbums, loadTracks, loadArtists]);

  const handleSyncComplete = () => {
    // Reload data when sync completes
    if (viewMode === 'albums') {
      loadAlbums();
    } else if (viewMode === 'tracks') {
      loadTracks();
    } else {
      loadArtists();
    }
  };

  const handleAlbumSortChange = (newSortBy: AlbumSortBy) => {
    if (newSortBy === albumSortBy) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setAlbumSortBy(newSortBy);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleTrackSortChange = (newSortBy: TrackSortBy) => {
    if (newSortBy === trackSortBy) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setTrackSortBy(newSortBy);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleArtistSortChange = (newSortBy: ArtistSortBy) => {
    if (newSortBy === artistSortBy) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setArtistSortBy(newSortBy);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const formatLastPlayed = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const getAlbumSortIndicator = (field: AlbumSortBy) => {
    if (albumSortBy !== field) return null;
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

  const getTrackSortIndicator = (field: TrackSortBy) => {
    if (trackSortBy !== field) return null;
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

  const getArtistSortIndicator = (field: ArtistSortBy) => {
    if (artistSortBy !== field) return null;
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

  const items =
    viewMode === 'albums' ? albums : viewMode === 'tracks' ? tracks : artists;
  const itemType =
    viewMode === 'albums'
      ? 'albums'
      : viewMode === 'tracks'
        ? 'tracks'
        : 'artists';

  return (
    <div className='lastfm-history-tab'>
      {/* Sync Status */}
      <div className='card'>
        <h3 className='lastfm-history-section-title'>Last.fm Sync Status</h3>
        <SyncStatusBar onSyncComplete={handleSyncComplete} />
      </div>

      {/* Search and Controls */}
      <div className='card'>
        <div className='lastfm-history-controls'>
          {/* View Mode Toggle */}
          <div className='lastfm-history-view-toggle'>
            <button
              className={`lastfm-history-view-btn ${viewMode === 'albums' ? 'active' : ''}`}
              onClick={() => setViewMode('albums')}
            >
              Albums
            </button>
            <button
              className={`lastfm-history-view-btn ${viewMode === 'artists' ? 'active' : ''}`}
              onClick={() => setViewMode('artists')}
            >
              Artists
            </button>
            <button
              className={`lastfm-history-view-btn ${viewMode === 'tracks' ? 'active' : ''}`}
              onClick={() => setViewMode('tracks')}
            >
              Tracks
            </button>
          </div>

          <div className='lastfm-history-search'>
            <input
              type='text'
              placeholder={
                viewMode === 'albums'
                  ? 'Search artists or albums...'
                  : viewMode === 'tracks'
                    ? 'Search artists, albums, or tracks...'
                    : 'Search artists...'
              }
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='lastfm-history-search-input'
            />
            {searchQuery && (
              <button
                className='lastfm-history-search-clear'
                onClick={() => setSearchQuery('')}
                aria-label='Clear search'
              >
                ×
              </button>
            )}
          </div>

          <div className='lastfm-history-sort'>
            <label>Sort by:</label>
            {viewMode === 'albums' ? (
              <select
                value={`${albumSortBy}-${sortOrder}`}
                onChange={e => {
                  const [newSort, newOrder] = e.target.value.split('-') as [
                    AlbumSortBy,
                    SortOrder,
                  ];
                  setAlbumSortBy(newSort);
                  setSortOrder(newOrder);
                  setPage(1);
                }}
                className='lastfm-history-sort-select'
              >
                <option value='playCount-desc'>Most Played</option>
                <option value='playCount-asc'>Least Played</option>
                <option value='lastPlayed-desc'>Recently Played</option>
                <option value='lastPlayed-asc'>Oldest Played</option>
                <option value='artist-asc'>Artist (A-Z)</option>
                <option value='artist-desc'>Artist (Z-A)</option>
                <option value='album-asc'>Album (A-Z)</option>
                <option value='album-desc'>Album (Z-A)</option>
              </select>
            ) : viewMode === 'tracks' ? (
              <select
                value={`${trackSortBy}-${sortOrder}`}
                onChange={e => {
                  const [newSort, newOrder] = e.target.value.split('-') as [
                    TrackSortBy,
                    SortOrder,
                  ];
                  setTrackSortBy(newSort);
                  setSortOrder(newOrder);
                  setPage(1);
                }}
                className='lastfm-history-sort-select'
              >
                <option value='playCount-desc'>Most Played</option>
                <option value='playCount-asc'>Least Played</option>
                <option value='lastPlayed-desc'>Recently Played</option>
                <option value='lastPlayed-asc'>Oldest Played</option>
                <option value='artist-asc'>Artist (A-Z)</option>
                <option value='artist-desc'>Artist (Z-A)</option>
                <option value='track-asc'>Track (A-Z)</option>
                <option value='track-desc'>Track (Z-A)</option>
              </select>
            ) : (
              <select
                value={`${artistSortBy}-${sortOrder}`}
                onChange={e => {
                  const [newSort, newOrder] = e.target.value.split('-') as [
                    ArtistSortBy,
                    SortOrder,
                  ];
                  setArtistSortBy(newSort);
                  setSortOrder(newOrder);
                  setPage(1);
                }}
                className='lastfm-history-sort-select'
              >
                <option value='playCount-desc'>Most Played</option>
                <option value='playCount-asc'>Least Played</option>
                <option value='lastPlayed-desc'>Recently Played</option>
                <option value='lastPlayed-asc'>Oldest Played</option>
                <option value='artist-asc'>Artist (A-Z)</option>
                <option value='artist-desc'>Artist (Z-A)</option>
                <option value='albumCount-desc'>Most Albums</option>
                <option value='albumCount-asc'>Fewest Albums</option>
              </select>
            )}
          </div>
        </div>

        {total > 0 && (
          <div className='lastfm-history-stats'>
            Showing {items.length} of {total.toLocaleString()} {itemType}
            {debouncedSearch && ` matching "${debouncedSearch}"`}
          </div>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className='card'>
          <div className='error-message'>
            {error}
            <button
              className='btn btn-small'
              onClick={
                viewMode === 'albums'
                  ? loadAlbums
                  : viewMode === 'tracks'
                    ? loadTracks
                    : loadArtists
              }
              style={{ marginLeft: '1rem' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && items.length === 0 && (
        <div className='card'>
          <div className='loading'>
            <div className='spinner'></div>
            Loading {itemType} history...
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && !error && (
        <div className='card'>
          <div className='lastfm-history-empty'>
            {debouncedSearch ? (
              <>
                <p>
                  No {itemType} found matching "{debouncedSearch}"
                </p>
                <button
                  className='btn btn-secondary'
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search
                </button>
              </>
            ) : (
              <>
                <p>No listening history synced yet.</p>
                <p className='lastfm-history-empty-hint'>
                  Use the sync controls above to import your Last.fm history.
                  This includes plays from all sources (Spotify, Apple Music,
                  etc.)
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Album list */}
      {viewMode === 'albums' && albums.length > 0 && (
        <div className='card lastfm-history-list-card'>
          {/* Header row */}
          <div className='lastfm-history-list-header'>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-artist ${albumSortBy === 'artist' ? 'active' : ''}`}
              onClick={() => handleAlbumSortChange('artist')}
            >
              Artist{getAlbumSortIndicator('artist')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-album ${albumSortBy === 'album' ? 'active' : ''}`}
              onClick={() => handleAlbumSortChange('album')}
            >
              Album{getAlbumSortIndicator('album')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-plays ${albumSortBy === 'playCount' ? 'active' : ''}`}
              onClick={() => handleAlbumSortChange('playCount')}
            >
              Plays{getAlbumSortIndicator('playCount')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-last ${albumSortBy === 'lastPlayed' ? 'active' : ''}`}
              onClick={() => handleAlbumSortChange('lastPlayed')}
            >
              Last Played{getAlbumSortIndicator('lastPlayed')}
            </button>
          </div>

          {/* Album rows */}
          <div className='lastfm-history-list'>
            {albums.map((album, index) => (
              <div
                key={`${album.artist}-${album.album}-${index}`}
                className='lastfm-history-item'
              >
                <div className='lastfm-history-col-artist' title={album.artist}>
                  {album.artist}
                </div>
                <div className='lastfm-history-col-album' title={album.album}>
                  {album.album}
                </div>
                <div className='lastfm-history-col-plays'>
                  {album.playCount.toLocaleString()}
                </div>
                <div className='lastfm-history-col-last'>
                  {formatLastPlayed(album.lastPlayed)}
                </div>
              </div>
            ))}
          </div>

          {/* Loading overlay for pagination */}
          {loading && albums.length > 0 && (
            <div className='lastfm-history-loading-overlay'>
              <div className='spinner'></div>
            </div>
          )}
        </div>
      )}

      {/* Track list */}
      {viewMode === 'tracks' && tracks.length > 0 && (
        <div className='card lastfm-history-list-card'>
          {/* Header row */}
          <div className='lastfm-history-list-header lastfm-history-track-header'>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-track ${trackSortBy === 'track' ? 'active' : ''}`}
              onClick={() => handleTrackSortChange('track')}
            >
              Track{getTrackSortIndicator('track')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-artist-sm ${trackSortBy === 'artist' ? 'active' : ''}`}
              onClick={() => handleTrackSortChange('artist')}
            >
              Artist{getTrackSortIndicator('artist')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-album-sm ${trackSortBy === 'album' ? 'active' : ''}`}
              onClick={() => handleTrackSortChange('album')}
            >
              Album{getTrackSortIndicator('album')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-plays ${trackSortBy === 'playCount' ? 'active' : ''}`}
              onClick={() => handleTrackSortChange('playCount')}
            >
              Plays{getTrackSortIndicator('playCount')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-last ${trackSortBy === 'lastPlayed' ? 'active' : ''}`}
              onClick={() => handleTrackSortChange('lastPlayed')}
            >
              Last Played{getTrackSortIndicator('lastPlayed')}
            </button>
            <div className='lastfm-history-col-actions'></div>
          </div>

          {/* Track rows */}
          <div className='lastfm-history-list'>
            {tracks.map((track, index) => (
              <div
                key={`${track.artist}-${track.album}-${track.track}-${index}`}
                className='lastfm-history-item lastfm-history-track-item'
              >
                <div className='lastfm-history-col-track' title={track.track}>
                  {track.track}
                </div>
                <div
                  className='lastfm-history-col-artist-sm'
                  title={track.artist}
                >
                  {track.artist}
                </div>
                <div
                  className='lastfm-history-col-album-sm'
                  title={track.album}
                >
                  {track.album}
                </div>
                <div className='lastfm-history-col-plays'>
                  {track.playCount.toLocaleString()}
                </div>
                <div className='lastfm-history-col-last'>
                  {formatLastPlayed(track.lastPlayed)}
                </div>
                <div className='lastfm-history-col-actions'>
                  <button
                    className='btn btn-small btn-icon'
                    onClick={() =>
                      playTrackOnSpotify(track.artist, track.track, track.album)
                    }
                    title='Play on Spotify'
                  >
                    ▶️
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Loading overlay for pagination */}
          {loading && tracks.length > 0 && (
            <div className='lastfm-history-loading-overlay'>
              <div className='spinner'></div>
            </div>
          )}
        </div>
      )}

      {/* Artist list */}
      {viewMode === 'artists' && artists.length > 0 && (
        <div className='card lastfm-history-list-card'>
          {/* Header row */}
          <div className='lastfm-history-list-header lastfm-history-artist-header'>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-artist ${artistSortBy === 'artist' ? 'active' : ''}`}
              onClick={() => handleArtistSortChange('artist')}
            >
              Artist{getArtistSortIndicator('artist')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-albums ${artistSortBy === 'albumCount' ? 'active' : ''}`}
              onClick={() => handleArtistSortChange('albumCount')}
            >
              Albums{getArtistSortIndicator('albumCount')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-plays ${artistSortBy === 'playCount' ? 'active' : ''}`}
              onClick={() => handleArtistSortChange('playCount')}
            >
              Plays{getArtistSortIndicator('playCount')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-last ${artistSortBy === 'lastPlayed' ? 'active' : ''}`}
              onClick={() => handleArtistSortChange('lastPlayed')}
            >
              Last Played{getArtistSortIndicator('lastPlayed')}
            </button>
          </div>

          {/* Artist rows */}
          <div className='lastfm-history-list'>
            {artists.map((artist, index) => (
              <div
                key={`${artist.artist}-${index}`}
                className='lastfm-history-item lastfm-history-artist-item'
              >
                <div
                  className='lastfm-history-col-artist'
                  title={artist.artist}
                >
                  {artist.artist}
                </div>
                <div className='lastfm-history-col-albums'>
                  {artist.albumCount.toLocaleString()}
                </div>
                <div className='lastfm-history-col-plays'>
                  {artist.playCount.toLocaleString()}
                </div>
                <div className='lastfm-history-col-last'>
                  {formatLastPlayed(artist.lastPlayed)}
                </div>
              </div>
            ))}
          </div>

          {/* Loading overlay for pagination */}
          {loading && artists.length > 0 && (
            <div className='lastfm-history-loading-overlay'>
              <div className='spinner'></div>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='card lastfm-history-pagination'>
          <button
            className='btn btn-small btn-secondary'
            onClick={() => setPage(1)}
            disabled={page === 1 || loading}
          >
            First
          </button>
          <button
            className='btn btn-small btn-secondary'
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </button>
          <span className='lastfm-history-page-info'>
            Page {page} of {totalPages}
          </span>
          <button
            className='btn btn-small btn-secondary'
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
          </button>
          <button
            className='btn btn-small btn-secondary'
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages || loading}
          >
            Last
          </button>
        </div>
      )}
    </div>
  );
};

export default LastFmHistoryTab;
