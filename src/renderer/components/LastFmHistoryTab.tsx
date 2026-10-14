import React, { useState, useEffect, useCallback, useRef } from 'react';

import { CollectionItem } from '../../shared/types';
import { stripDiscogsSuffix } from '../../shared/utils/albumMapping';
import { toDisplayName } from '../../shared/utils/displayName';
import { normalizeForMatching } from '../../shared/utils/trackNormalization';
import { useApp } from '../context/AppContext';
import {
  useCollectionLookup,
  lookupInCollection,
} from '../hooks/useCollectionLookup';
import { navigate, ROUTES } from '../routes';
import { getApiService } from '../services/api';
import { imagesApi } from '../services/statsApi';
import { createLogger } from '../utils/logger';
import {
  playAlbumOnSpotify,
  playArtistOnSpotify,
  playTrackOnSpotify,
} from '../utils/spotifyUtils';

import AlbumLink from './AlbumLink';
import ArtistLink from './ArtistLink';
import { RankedListHeader, RankedRow } from './RankedRow';
import TrackLink from './TrackLink';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

const logger = createLogger('LastFmHistoryTab');

interface AlbumHistoryItem {
  artist: string;
  /** Artist with display casing from the server's name mappings */
  artistName?: string;
  album: string;
  playCount: number;
  firstPlayed?: number;
  lastPlayed: number;
}

interface TrackHistoryItem {
  artist: string;
  artistName?: string;
  album: string;
  /** Plays without album info; `album` is only a placeholder label */
  albumUnknown?: boolean;
  track: string;
  playCount: number;
  firstPlayed?: number;
  lastPlayed: number;
}

interface ArtistHistoryItem {
  artist: string;
  playCount: number;
  albumCount: number;
  firstPlayed?: number;
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

const VIEW_LABELS: Record<ViewMode, string> = {
  albums: 'Albums',
  artists: 'Artists',
  tracks: 'Tracks',
};

/** Keys the image endpoints use for their results */
const albumImageKey = (artist: string, album: string): string =>
  `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;

const sameText = (a: string, b: string): boolean =>
  a.toLowerCase().trim() === b.toLowerCase().trim();

/**
 * History stores names lowercased. Prefer the collection's spelling when it
 * is the same name, then the server's mapped name, then title casing.
 */
const displayArtist = (
  artist: string,
  mappedName: string | undefined,
  collectionItem: CollectionItem | undefined
): string => {
  const owned = collectionItem
    ? stripDiscogsSuffix(collectionItem.release.artist)
    : undefined;
  if (owned && sameText(owned, artist)) return owned;
  return toDisplayName(mappedName ?? artist);
};

const displayAlbum = (
  album: string,
  collectionItem: CollectionItem | undefined
): string => {
  const owned = collectionItem?.release.title;
  if (owned && sameText(owned, album)) return owned;
  return toDisplayName(album);
};

const formatMonthYear = (timestamp: number): string =>
  new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
  });

const formatDate = (timestamp: number): string =>
  new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const LastFmHistoryTab: React.FC = () => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  // Collection lookup for "In Collection" badges
  const { collectionMap, collectionArtistCounts, collectionArtistCovers } =
    useCollectionLookup();

  // Plays without album info aren't in the Albums view; point to them
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api
      .getUnresolvedHistorySummary()
      .then(summary => {
        if (!cancelled) setUnresolvedCount(summary.unresolvedCount);
      })
      .catch(() => {
        // The note is optional; leave it hidden on failure
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Navigate to a collection item's release details page
  const navigateToAlbum = (item: CollectionItem) => {
    localStorage.setItem('selectedRelease', JSON.stringify(item.release));
    localStorage.setItem('selectedCollectionItemId', item.id.toString());
    navigate('release-details');
  };

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
  // Top play count among all results, to scale the play bars
  const [maxPlayCount, setMaxPlayCount] = useState(0);
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
    // Only a changed search goes back to page 1; otherwise this would also
    // fire 300ms after opening and undo a quick click on Next
    if (searchQuery === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, debouncedSearch]);

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
      setMaxPlayCount(
        result.maxPlayCount ??
          result.items.reduce((max, i) => Math.max(max, i.playCount), 0)
      );
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
      setMaxPlayCount(
        result.maxPlayCount ??
          result.items.reduce((max, i) => Math.max(max, i.playCount), 0)
      );
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
      setMaxPlayCount(
        result.maxPlayCount ??
          result.items.reduce((max, i) => Math.max(max, i.playCount), 0)
      );
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

  const formatLastPlayed = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    const ago = (count: number, unit: string) =>
      `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return ago(diffDays, 'day');
    if (diffDays < 30) return ago(Math.floor(diffDays / 7), 'week');
    if (diffDays < 365) return ago(Math.floor(diffDays / 30), 'month');
    return ago(Math.floor(diffDays / 365), 'year');
  };

  const items =
    viewMode === 'albums' ? albums : viewMode === 'tracks' ? tracks : artists;
  const itemType =
    viewMode === 'albums'
      ? 'albums'
      : viewMode === 'tracks'
        ? 'tracks'
        : 'artists';

  // Ranks only make sense for the full list ordered by most played
  const activeSortBy =
    viewMode === 'albums'
      ? albumSortBy
      : viewMode === 'tracks'
        ? trackSortBy
        : artistSortBy;
  const isRanked =
    activeSortBy === 'playCount' && sortOrder === 'desc' && !debouncedSearch;
  const rankOf = (index: number): number | undefined =>
    isRanked ? (page - 1) * perPage + index + 1 : undefined;
  const firstShown = (page - 1) * perPage + 1;

  // Cover art: collection covers first, then the image endpoint for the rest
  // of the page (results are kept across pages)
  const imageCache = useRef(new Map<string, string | null>());
  const imageRequestSeq = useRef(0);
  const [images, setImages] = useState<Map<string, string | null>>(
    () => new Map()
  );

  useEffect(() => {
    const cache = imageCache.current;
    const seq = ++imageRequestSeq.current;
    const missingAlbums = new Map<string, { artist: string; album: string }>();
    const addAlbum = (artist: string, album: string) => {
      const key = albumImageKey(artist, album);
      if (
        !cache.has(key) &&
        !lookupInCollection(collectionMap, artist, album)?.release.cover_image
      ) {
        missingAlbums.set(key, { artist, album });
      }
    };

    let request: Promise<Record<string, string | null> | undefined> | null =
      null;
    let requestedKeys: string[] = [];
    if (viewMode === 'albums') {
      albums.forEach(a => addAlbum(a.artist, a.album));
    } else if (viewMode === 'tracks') {
      tracks.forEach(t => {
        if (!t.albumUnknown) addAlbum(t.artist, t.album);
      });
    }
    // Artists use a cover from the collection instead: Last.fm no longer
    // has artist photos, so asking it for 50 artists would be wasted calls
    if (missingAlbums.size > 0) {
      requestedKeys = [...missingAlbums.keys()];
      request = imagesApi
        .batchGetAlbumCovers([...missingAlbums.values()])
        .then(res => (res.success ? res.data : undefined));
    }

    if (!request) {
      // Nothing to fetch; only re-render if an earlier request added images
      setImages(prev => (prev.size === cache.size ? prev : new Map(cache)));
      return;
    }
    request
      .then(data => {
        if (!data) return;
        for (const key of requestedKeys) {
          // An overlapping request may already have found this cover
          if (!cache.get(key)) cache.set(key, data[key] ?? null);
        }
        // A later page or view has replaced this one; it renders the cache
        if (seq === imageRequestSeq.current) setImages(new Map(cache));
      })
      .catch(err => logger.warn('Failed to load list images', err));
  }, [viewMode, albums, tracks, collectionMap]);

  const albumCover = (
    artist: string,
    album: string,
    collectionItem: CollectionItem | undefined
  ): string | null =>
    collectionItem?.release.cover_image ||
    images.get(albumImageKey(artist, album)) ||
    null;

  const ownedBadge = (collectionItem: CollectionItem, name: string) => (
    <button
      type='button'
      className='enrichment-collection-link'
      onClick={() => navigateToAlbum(collectionItem)}
      title='View in Collection'
      aria-label={`View ${name} in your collection`}
    >
      <Badge variant='success' size='small'>
        Owned
      </Badge>
    </button>
  );

  const lastPlayedCell = (timestamp: number) => (
    <span title={`Last played ${formatDate(timestamp)}`}>
      {formatLastPlayed(timestamp)}
    </span>
  );

  const firstPlayedCell = (timestamp: number | undefined) =>
    timestamp ? (
      <span title={`First played ${formatDate(timestamp)}`}>
        {formatMonthYear(timestamp)}
      </span>
    ) : (
      ''
    );

  const shareOf = (playCount: number): number | undefined =>
    maxPlayCount > 0 ? playCount / maxPlayCount : undefined;

  return (
    <div className='lastfm-history-tab'>
      {viewMode === 'albums' && unresolvedCount > 0 && (
        <p className='lastfm-history-unresolved-note'>
          {unresolvedCount.toLocaleString()} plays without album info
          aren&apos;t listed here.{' '}
          <button
            type='button'
            className='lastfm-history-unresolved-link'
            onClick={() => navigate(ROUTES.HISTORY, { tab: 'unresolved' })}
          >
            Review them
          </button>
        </p>
      )}
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
                <option value='album-asc'>Album (A-Z)</option>
                <option value='album-desc'>Album (Z-A)</option>
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
      </div>

      {/* Error state */}
      {error && (
        <div className='card'>
          <div className='error-message'>
            {error}
            <Button
              size='small'
              className='ml-1'
              onClick={
                viewMode === 'albums'
                  ? loadAlbums
                  : viewMode === 'tracks'
                    ? loadTracks
                    : loadArtists
              }
            >
              Retry
            </Button>
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
                <Button variant='secondary' onClick={() => setSearchQuery('')}>
                  Clear Search
                </Button>
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

      {items.length > 0 && (
        <section
          className='card lastfm-history-list-card ranked-list-container'
          aria-labelledby='lastfm-history-list-title'
          aria-busy={loading}
        >
          <div className='lastfm-history-list-header'>
            <h3
              id='lastfm-history-list-title'
              className='lastfm-history-list-title'
            >
              All-time {VIEW_LABELS[viewMode].toLowerCase()}
            </h3>
            <p className='lastfm-history-list-summary'>
              {items.length === total
                ? `${total.toLocaleString()} ${itemType}`
                : `${firstShown.toLocaleString()}–${(firstShown + items.length - 1).toLocaleString()} of ${total.toLocaleString()} ${itemType}`}
              {debouncedSearch && ` matching "${debouncedSearch}"`}
            </p>
          </div>

          <RankedListHeader />
          <ol className='ranked-list' aria-label={`All-time ${itemType}`}>
            {viewMode === 'albums' &&
              albums.map((album, index) => {
                const collectionItem = lookupInCollection(
                  collectionMap,
                  album.artist,
                  album.album
                );
                const albumName = displayAlbum(album.album, collectionItem);
                return (
                  <RankedRow
                    key={`${album.artist}|${album.album}`}
                    rank={rankOf(index)}
                    imageKind='album'
                    imageUrl={albumCover(
                      album.artist,
                      album.album,
                      collectionItem
                    )}
                    imageAlt={`${albumName} cover`}
                    title={
                      <AlbumLink
                        artist={album.artist}
                        album={album.album}
                        label={albumName}
                      />
                    }
                    badge={
                      collectionItem && ownedBadge(collectionItem, albumName)
                    }
                    subtitle={
                      <ArtistLink
                        artist={album.artist}
                        label={displayArtist(
                          album.artist,
                          album.artistName,
                          collectionItem
                        )}
                      />
                    }
                    share={shareOf(album.playCount)}
                    firstPlayed={firstPlayedCell(album.firstPlayed)}
                    lastPlayed={lastPlayedCell(album.lastPlayed)}
                    onPlay={() => playAlbumOnSpotify(album.artist, album.album)}
                    playCount={album.playCount}
                  />
                );
              })}

            {viewMode === 'tracks' &&
              tracks.map((track, index) => {
                const collectionItem = track.albumUnknown
                  ? undefined
                  : lookupInCollection(
                      collectionMap,
                      track.artist,
                      track.album
                    );
                const albumName = track.albumUnknown
                  ? undefined
                  : displayAlbum(track.album, collectionItem);
                return (
                  <RankedRow
                    key={`${track.artist}|${track.album}|${track.track}|${index}`}
                    rank={rankOf(index)}
                    imageKind='album'
                    imageUrl={
                      track.albumUnknown
                        ? null
                        : albumCover(track.artist, track.album, collectionItem)
                    }
                    imageAlt={albumName ? `${albumName} cover` : ''}
                    title={
                      <TrackLink
                        artist={track.artist}
                        track={track.track}
                        album={track.albumUnknown ? undefined : track.album}
                      />
                    }
                    badge={
                      collectionItem &&
                      albumName &&
                      ownedBadge(collectionItem, albumName)
                    }
                    subtitle={
                      <>
                        <ArtistLink
                          artist={track.artist}
                          label={displayArtist(
                            track.artist,
                            track.artistName,
                            collectionItem
                          )}
                        />
                        <span className='lastfm-history-separator'>
                          {' · '}
                        </span>
                        {albumName ? (
                          <AlbumLink
                            artist={track.artist}
                            album={track.album}
                            label={albumName}
                          />
                        ) : (
                          <span className='lastfm-history-no-album'>
                            No album info
                          </span>
                        )}
                      </>
                    }
                    share={shareOf(track.playCount)}
                    firstPlayed={firstPlayedCell(track.firstPlayed)}
                    lastPlayed={lastPlayedCell(track.lastPlayed)}
                    onPlay={() =>
                      playTrackOnSpotify(
                        track.artist,
                        track.track,
                        track.albumUnknown ? undefined : track.album
                      )
                    }
                    playCount={track.playCount}
                  />
                );
              })}

            {viewMode === 'artists' &&
              artists.map((artist, index) => {
                const ownedCount = collectionArtistCounts.get(
                  normalizeForMatching(artist.artist)
                );
                return (
                  <RankedRow
                    key={artist.artist}
                    rank={rankOf(index)}
                    imageKind='artist'
                    imageUrl={collectionArtistCovers.get(
                      normalizeForMatching(artist.artist)
                    )}
                    imageAlt={artist.artist}
                    title={
                      <ArtistLink
                        artist={artist.artist}
                        label={toDisplayName(artist.artist)}
                      />
                    }
                    badge={
                      !!ownedCount &&
                      ownedCount > 0 && (
                        <Badge variant='success' size='small'>
                          {ownedCount} owned
                        </Badge>
                      )
                    }
                    subtitle={`${artist.albumCount.toLocaleString()} ${artist.albumCount === 1 ? 'album' : 'albums'}`}
                    share={shareOf(artist.playCount)}
                    firstPlayed={firstPlayedCell(artist.firstPlayed)}
                    lastPlayed={lastPlayedCell(artist.lastPlayed)}
                    onPlay={() => playArtistOnSpotify(artist.artist)}
                    playCount={artist.playCount}
                  />
                );
              })}
          </ol>

          {/* Loading overlay for pagination */}
          {loading && (
            <div className='lastfm-history-loading-overlay'>
              <div className='spinner'></div>
            </div>
          )}
        </section>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='card lastfm-history-pagination'>
          <Button
            variant='secondary'
            size='small'
            onClick={() => setPage(1)}
            disabled={page === 1 || loading}
          >
            First
          </Button>
          <Button
            variant='secondary'
            size='small'
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>
          <span className='lastfm-history-page-info'>
            Page {page} of {totalPages}
          </span>
          <Button
            variant='secondary'
            size='small'
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
          </Button>
          <Button
            variant='secondary'
            size='small'
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages || loading}
          >
            Last
          </Button>
        </div>
      )}
    </div>
  );
};

export default LastFmHistoryTab;
