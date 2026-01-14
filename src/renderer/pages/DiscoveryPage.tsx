import React, { useEffect, useState, useCallback } from 'react';

import {
  MissingAlbum,
  MissingArtist,
  CollectionItem,
  LocalWantItem,
  EnrichedWishlistItem,
} from '../../shared/types';
import SyncStatusBar from '../components/SyncStatusBar';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';

type TabType = 'albums' | 'artists';
type AlbumSortOption = 'plays' | 'artist' | 'album' | 'recent';
type ArtistSortOption = 'plays' | 'artist' | 'albums' | 'recent';

interface MappingModalState {
  isOpen: boolean;
  type: 'album' | 'artist';
  historyArtist: string;
  historyAlbum?: string;
}

const DiscoveryPage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('albums');
  const [missingAlbums, setMissingAlbums] = useState<MissingAlbum[]>([]);
  const [missingArtists, setMissingArtists] = useState<MissingArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mapping modal state
  const [mappingModal, setMappingModal] = useState<MappingModalState>({
    isOpen: false,
    type: 'album',
    historyArtist: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CollectionItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mappingInProgress, setMappingInProgress] = useState(false);

  // Want list state - track which albums are being added
  const [addingToWantList, setAddingToWantList] = useState<Set<string>>(
    new Set()
  );
  const [addedToWantList, setAddedToWantList] = useState<Set<string>>(
    new Set()
  );

  // Discogs wishlist state - track which albums are in the Discogs wantlist
  const [inDiscogsWishlist, setInDiscogsWishlist] = useState<Set<string>>(
    new Set()
  );

  // Sorting state
  const [albumSort, setAlbumSort] = useState<AlbumSortOption>('plays');
  const [artistSort, setArtistSort] = useState<ArtistSortOption>('plays');

  const api = getApiService(state.serverUrl);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [albums, artists, localWantList, discogsWishlist] =
        await Promise.all([
          api.getMissingAlbums(100),
          api.getMissingArtists(100),
          api.getLocalWantList(),
          api.getWishlist().catch(() => [] as EnrichedWishlistItem[]), // Don't fail if wishlist unavailable
        ]);

      setMissingAlbums(albums);
      setMissingArtists(artists);

      // Pre-populate addedToWantList with existing local want list items
      const existingWantedKeys = new Set(
        localWantList.map(
          (item: LocalWantItem) => `${item.artist}:${item.album}`
        )
      );
      setAddedToWantList(existingWantedKeys);

      // Pre-populate inDiscogsWishlist with Discogs wantlist items
      // Normalize names for matching (case-insensitive, quote-insensitive)
      const normalize = (str: string): string =>
        str
          .toLowerCase()
          .replace(/[""''"`]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      const discogsWishlistKeys = new Set(
        discogsWishlist.map(
          (item: EnrichedWishlistItem) =>
            `${normalize(item.artist)}:${normalize(item.title)}`
        )
      );
      setInDiscogsWishlist(discogsWishlistKeys);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load discovery data'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  // Normalize album/artist names for matching
  // Removes quotes, extra punctuation, and normalizes to lowercase
  const normalizeForMatching = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/[""''"`]/g, '') // Remove various quote characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  };

  // Check if album is in Discogs wishlist (case-insensitive, quote-insensitive)
  const isInDiscogsWishlist = (artist: string, album: string): boolean => {
    return inDiscogsWishlist.has(
      `${normalizeForMatching(artist)}:${normalizeForMatching(album)}`
    );
  };

  // Generate Last.fm URLs
  const getLastFmArtistUrl = (artist: string): string => {
    return `https://www.last.fm/music/${encodeURIComponent(artist)}`;
  };

  const getLastFmAlbumUrl = (artist: string, album: string): string => {
    return `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`;
  };

  // Generate Discogs search URLs
  const getDiscogsArtistUrl = (artist: string): string => {
    return `https://www.discogs.com/search/?q=${encodeURIComponent(artist)}&type=artist`;
  };

  const getDiscogsAlbumUrl = (artist: string, album: string): string => {
    return `https://www.discogs.com/search/?q=${encodeURIComponent(`${artist} ${album}`)}&type=release`;
  };

  // Open external link
  const openLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSyncComplete = () => {
    loadData();
  };

  // Open mapping modal for an album
  const openAlbumMapping = (album: MissingAlbum) => {
    setMappingModal({
      isOpen: true,
      type: 'album',
      historyArtist: album.artist,
      historyAlbum: album.album,
    });
    setSearchQuery(album.artist);
    setSearchResults([]);
  };

  // Open mapping modal for an artist
  const openArtistMapping = (artist: MissingArtist) => {
    setMappingModal({
      isOpen: true,
      type: 'artist',
      historyArtist: artist.artist,
    });
    setSearchQuery(artist.artist);
    setSearchResults([]);
  };

  // Close mapping modal
  const closeMappingModal = () => {
    setMappingModal({
      isOpen: false,
      type: 'album',
      historyArtist: '',
    });
    setSearchQuery('');
    setSearchResults([]);
  };

  // Search collection
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !authStatus.discogs.username) return;

    try {
      setSearchLoading(true);
      const results = await api.searchCollection(
        authStatus.discogs.username,
        searchQuery
      );
      setSearchResults(results.slice(0, 20)); // Limit to 20 results
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [api, searchQuery, authStatus.discogs.username]);

  // Create mapping from selected collection item
  const handleSelectMapping = async (item: CollectionItem) => {
    try {
      setMappingInProgress(true);

      if (mappingModal.type === 'album' && mappingModal.historyAlbum) {
        await api.createDiscoveryAlbumMapping({
          historyArtist: mappingModal.historyArtist,
          historyAlbum: mappingModal.historyAlbum,
          collectionId: item.id,
          collectionArtist: item.release.artist,
          collectionAlbum: item.release.title,
        });
        // Remove from local state
        setMissingAlbums(prev =>
          prev.filter(
            a =>
              !(
                a.artist === mappingModal.historyArtist &&
                a.album === mappingModal.historyAlbum
              )
          )
        );
      } else {
        await api.createDiscoveryArtistMapping({
          historyArtist: mappingModal.historyArtist,
          collectionArtist: item.release.artist,
        });
        // Remove from local state
        setMissingArtists(prev =>
          prev.filter(a => a.artist !== mappingModal.historyArtist)
        );
      }

      closeMappingModal();
    } catch (err) {
      console.error('Failed to create mapping:', err);
    } finally {
      setMappingInProgress(false);
    }
  };

  // Hide an album from discovery (e.g., podcasts)
  const handleHideAlbum = async (album: MissingAlbum) => {
    try {
      await api.hideAlbum(album.artist, album.album);
      // Remove from local state
      setMissingAlbums(prev =>
        prev.filter(
          a => !(a.artist === album.artist && a.album === album.album)
        )
      );
    } catch (err) {
      console.error('Failed to hide album:', err);
    }
  };

  // Add album to local want list (tracks for vinyl availability)
  const handleAddToWantList = async (album: MissingAlbum) => {
    const key = `${album.artist}:${album.album}`;
    if (addingToWantList.has(key) || addedToWantList.has(key)) return;

    try {
      setAddingToWantList(prev => new Set([...prev, key]));
      await api.addToLocalWantList({
        artist: album.artist,
        album: album.album,
        playCount: album.playCount,
        lastPlayed: album.lastPlayed,
      });
      setAddedToWantList(prev => new Set([...prev, key]));
    } catch (err) {
      console.error('Failed to add to want list:', err);
    } finally {
      setAddingToWantList(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // Hide an artist from discovery (e.g., podcasts)
  const handleHideArtist = async (artist: MissingArtist) => {
    try {
      await api.hideArtist(artist.artist);
      // Remove from local state
      setMissingArtists(prev => prev.filter(a => a.artist !== artist.artist));
    } catch (err) {
      console.error('Failed to hide artist:', err);
    }
  };

  // Sort albums based on selected option
  const sortedAlbums = [...missingAlbums].sort((a, b) => {
    switch (albumSort) {
      case 'plays':
        return b.playCount - a.playCount;
      case 'artist':
        return a.artist.localeCompare(b.artist);
      case 'album':
        return a.album.localeCompare(b.album);
      case 'recent':
        return b.lastPlayed - a.lastPlayed;
      default:
        return 0;
    }
  });

  // Sort artists based on selected option
  const sortedArtists = [...missingArtists].sort((a, b) => {
    switch (artistSort) {
      case 'plays':
        return b.playCount - a.playCount;
      case 'artist':
        return a.artist.localeCompare(b.artist);
      case 'albums':
        return b.albumCount - a.albumCount;
      case 'recent':
        return b.lastPlayed - a.lastPlayed;
      default:
        return 0;
    }
  });

  return (
    <div className='discovery-page'>
      <h1>Discovery</h1>
      <p className='page-description'>
        Find albums and artists you listen to frequently but don't have in your
        vinyl collection.
      </p>

      <SyncStatusBar onSyncComplete={handleSyncComplete} />

      <div className='discovery-tabs'>
        <button
          className={`discovery-tab ${activeTab === 'albums' ? 'active' : ''}`}
          onClick={() => setActiveTab('albums')}
        >
          Missing Albums ({missingAlbums.length})
        </button>
        <button
          className={`discovery-tab ${activeTab === 'artists' ? 'active' : ''}`}
          onClick={() => setActiveTab('artists')}
        >
          Missing Artists ({missingArtists.length})
        </button>
      </div>

      {error && (
        <div className='message error'>
          <p>{error}</p>
          <button className='btn btn-small' onClick={loadData}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className='loading-container'>
          <div className='loading-spinner' />
          <p>Analyzing your listening history...</p>
        </div>
      ) : (
        <div className='discovery-content'>
          {activeTab === 'albums' && (
            <div className='discovery-section'>
              <div className='discovery-section-header'>
                <h2>Albums You Listen To But Don't Own</h2>
                <div className='discovery-sort'>
                  <label htmlFor='album-sort'>Sort by:</label>
                  <select
                    id='album-sort'
                    value={albumSort}
                    onChange={e =>
                      setAlbumSort(e.target.value as AlbumSortOption)
                    }
                  >
                    <option value='plays'>Most Plays</option>
                    <option value='artist'>Artist Name</option>
                    <option value='album'>Album Name</option>
                    <option value='recent'>Recently Played</option>
                  </select>
                </div>
              </div>
              {missingAlbums.length === 0 ? (
                <p className='empty-state'>
                  No missing albums found. Either you own everything you listen
                  to, or you need to sync your history first!
                </p>
              ) : (
                <div className='missing-list'>
                  {sortedAlbums.map((album, index) => (
                    <div
                      key={`${album.artist}-${album.album}-${index}`}
                      className='missing-item'
                    >
                      <div className='missing-item-info'>
                        <div className='missing-item-title'>
                          {album.album}
                          {isInDiscogsWishlist(album.artist, album.album) && (
                            <span
                              className='discovery-badge discovery-badge-wishlist'
                              title='In your Discogs wantlist'
                            >
                              In Wantlist
                            </span>
                          )}
                        </div>
                        <div className='missing-item-artist'>
                          {album.artist}
                        </div>
                      </div>
                      <div className='missing-item-stats'>
                        <span className='missing-item-playcount'>
                          {album.playCount} plays
                        </span>
                        <span>Last: {formatDate(album.lastPlayed)}</span>
                      </div>
                      <div className='missing-item-actions'>
                        <button
                          className='btn btn-small btn-icon'
                          onClick={() =>
                            openLink(
                              getLastFmAlbumUrl(album.artist, album.album)
                            )
                          }
                          title='View album on Last.fm'
                        >
                          Last.fm
                        </button>
                        <button
                          className='btn btn-small btn-icon'
                          onClick={() =>
                            openLink(
                              getDiscogsAlbumUrl(album.artist, album.album)
                            )
                          }
                          title='Search album on Discogs'
                        >
                          Discogs
                        </button>
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() => openAlbumMapping(album)}
                          title='Map to collection item'
                        >
                          Map
                        </button>
                        <button
                          className={`btn btn-small ${
                            addedToWantList.has(
                              `${album.artist}:${album.album}`
                            )
                              ? 'btn-success'
                              : 'btn-primary'
                          }`}
                          onClick={() => handleAddToWantList(album)}
                          disabled={
                            addingToWantList.has(
                              `${album.artist}:${album.album}`
                            ) ||
                            addedToWantList.has(
                              `${album.artist}:${album.album}`
                            )
                          }
                          title='Add to want list - tracks vinyl availability'
                        >
                          {addingToWantList.has(
                            `${album.artist}:${album.album}`
                          )
                            ? 'Adding...'
                            : addedToWantList.has(
                                  `${album.artist}:${album.album}`
                                )
                              ? 'Wanted'
                              : 'Want'}
                        </button>
                        <button
                          className='btn btn-small btn-link'
                          onClick={() => handleHideAlbum(album)}
                          title='Hide from discovery (e.g., podcasts)'
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'artists' && (
            <div className='discovery-section'>
              <div className='discovery-section-header'>
                <h2>Artists You Listen To But Don't Own</h2>
                <div className='discovery-sort'>
                  <label htmlFor='artist-sort'>Sort by:</label>
                  <select
                    id='artist-sort'
                    value={artistSort}
                    onChange={e =>
                      setArtistSort(e.target.value as ArtistSortOption)
                    }
                  >
                    <option value='plays'>Most Plays</option>
                    <option value='artist'>Artist Name</option>
                    <option value='albums'>Most Albums</option>
                    <option value='recent'>Recently Played</option>
                  </select>
                </div>
              </div>
              {missingArtists.length === 0 ? (
                <p className='empty-state'>
                  No missing artists found. You have a complete collection!
                </p>
              ) : (
                <div className='missing-list'>
                  {sortedArtists.map((artist, index) => (
                    <div
                      key={`${artist.artist}-${index}`}
                      className='missing-item'
                    >
                      <div className='missing-item-info'>
                        <div className='missing-item-title'>
                          {artist.artist}
                        </div>
                        <div className='missing-item-artist'>
                          {artist.albumCount} album
                          {artist.albumCount > 1 ? 's' : ''} in history
                        </div>
                      </div>
                      <div className='missing-item-stats'>
                        <span className='missing-item-playcount'>
                          {artist.playCount} plays
                        </span>
                        <span>Last: {formatDate(artist.lastPlayed)}</span>
                      </div>
                      <div className='missing-item-actions'>
                        <button
                          className='btn btn-small btn-icon'
                          onClick={() =>
                            openLink(getLastFmArtistUrl(artist.artist))
                          }
                          title='View artist on Last.fm'
                        >
                          Last.fm
                        </button>
                        <button
                          className='btn btn-small btn-icon'
                          onClick={() =>
                            openLink(getDiscogsArtistUrl(artist.artist))
                          }
                          title='Search artist on Discogs'
                        >
                          Discogs
                        </button>
                        <button
                          className='btn btn-small btn-secondary'
                          onClick={() => openArtistMapping(artist)}
                          title='Map to collection artist'
                        >
                          Map
                        </button>
                        <button
                          className='btn btn-small btn-link'
                          onClick={() => handleHideArtist(artist)}
                          title='Hide from discovery (e.g., podcasts)'
                        >
                          Hide
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className='discovery-footer'>
        <p className='discovery-hint'>
          This list is based on your complete Last.fm history. Albums and
          artists appearing here have been listened to but aren't in your
          Discogs vinyl collection.
        </p>
      </div>

      {/* Mapping Modal */}
      {mappingModal.isOpen && (
        <div className='modal-overlay' onClick={closeMappingModal}>
          <div
            className='modal mapping-modal'
            onClick={e => e.stopPropagation()}
          >
            <div className='modal-header'>
              <h2>
                Map {mappingModal.type === 'album' ? 'Album' : 'Artist'} to
                Collection
              </h2>
              <button className='modal-close' onClick={closeMappingModal}>
                &times;
              </button>
            </div>

            <div className='modal-body'>
              <div className='mapping-source'>
                <strong>Last.fm {mappingModal.type}:</strong>
                <div className='mapping-source-info'>
                  {mappingModal.type === 'album' ? (
                    <>
                      <span className='mapping-album'>
                        {mappingModal.historyAlbum}
                      </span>
                      <span className='mapping-artist'>
                        by {mappingModal.historyArtist}
                      </span>
                    </>
                  ) : (
                    <span className='mapping-artist'>
                      {mappingModal.historyArtist}
                    </span>
                  )}
                </div>
              </div>

              <div className='mapping-search'>
                <label>Search your collection:</label>
                <div className='mapping-search-row'>
                  <input
                    type='text'
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    placeholder='Search by artist or album...'
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
                      ? 'No results found. Try a different search.'
                      : 'Enter a search term to find matching collection items.'}
                  </p>
                ) : (
                  <div className='mapping-results-list'>
                    {searchResults.map(item => (
                      <div
                        key={item.id}
                        className='mapping-result-item'
                        onClick={() =>
                          !mappingInProgress && handleSelectMapping(item)
                        }
                      >
                        {item.release.cover_image && (
                          <img
                            src={item.release.cover_image}
                            alt=''
                            className='mapping-result-cover'
                          />
                        )}
                        <div className='mapping-result-info'>
                          <div className='mapping-result-title'>
                            {item.release.title}
                          </div>
                          <div className='mapping-result-artist'>
                            {item.release.artist}
                          </div>
                          {item.release.year && (
                            <div className='mapping-result-year'>
                              {item.release.year}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className='modal-footer'>
              <button className='btn btn-secondary' onClick={closeMappingModal}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscoveryPage;
