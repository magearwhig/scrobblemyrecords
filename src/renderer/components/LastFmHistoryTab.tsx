import React, { useState, useEffect, useCallback } from 'react';

import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';

import SyncStatusBar from './SyncStatusBar';

interface AlbumHistoryItem {
  artist: string;
  album: string;
  playCount: number;
  lastPlayed: number;
}

type SortBy = 'playCount' | 'lastPlayed' | 'artist' | 'album';
type SortOrder = 'asc' | 'desc';

const LastFmHistoryTab: React.FC = () => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  const [albums, setAlbums] = useState<AlbumHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const perPage = 50;

  // Search and sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('playCount');
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

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.getAlbumHistoryPaginated(
        page,
        perPage,
        sortBy,
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
  }, [api, page, perPage, sortBy, sortOrder, debouncedSearch]);

  useEffect(() => {
    loadAlbums();
  }, [loadAlbums]);

  const handleSyncComplete = () => {
    // Reload albums when sync completes
    loadAlbums();
  };

  const handleSortChange = (newSortBy: SortBy) => {
    if (newSortBy === sortBy) {
      // Toggle order if same field
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc'); // Default to descending for new field
    }
    setPage(1);
  };

  const formatLastPlayed = (timestamp: number): string => {
    // timestamp is in seconds (Unix timestamp), convert to milliseconds
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

  const getSortIndicator = (field: SortBy) => {
    if (sortBy !== field) return null;
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

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
          <div className='lastfm-history-search'>
            <input
              type='text'
              placeholder='Search artists or albums...'
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
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={e => {
                const [newSort, newOrder] = e.target.value.split('-') as [
                  SortBy,
                  SortOrder,
                ];
                setSortBy(newSort);
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
          </div>
        </div>

        {total > 0 && (
          <div className='lastfm-history-stats'>
            Showing {albums.length} of {total.toLocaleString()} albums
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
              onClick={loadAlbums}
              style={{ marginLeft: '1rem' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && albums.length === 0 && (
        <div className='card'>
          <div className='loading'>
            <div className='spinner'></div>
            Loading album history...
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && albums.length === 0 && !error && (
        <div className='card'>
          <div className='lastfm-history-empty'>
            {debouncedSearch ? (
              <>
                <p>No albums found matching "{debouncedSearch}"</p>
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
      {albums.length > 0 && (
        <div className='card lastfm-history-list-card'>
          {/* Header row */}
          <div className='lastfm-history-list-header'>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-artist ${sortBy === 'artist' ? 'active' : ''}`}
              onClick={() => handleSortChange('artist')}
            >
              Artist{getSortIndicator('artist')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-album ${sortBy === 'album' ? 'active' : ''}`}
              onClick={() => handleSortChange('album')}
            >
              Album{getSortIndicator('album')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-plays ${sortBy === 'playCount' ? 'active' : ''}`}
              onClick={() => handleSortChange('playCount')}
            >
              Plays{getSortIndicator('playCount')}
            </button>
            <button
              className={`lastfm-history-header-btn lastfm-history-col-last ${sortBy === 'lastPlayed' ? 'active' : ''}`}
              onClick={() => handleSortChange('lastPlayed')}
            >
              Last Played{getSortIndicator('lastPlayed')}
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
