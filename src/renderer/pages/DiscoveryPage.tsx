import React, { useEffect, useState, useCallback } from 'react';

import {
  MissingAlbum,
  MissingArtist,
  CollectionItem,
  LocalWantItem,
  EnrichedWishlistItem,
  ForgottenTrack,
} from '../../shared/types';
import {
  MissingAlbumsTab,
  MissingArtistsTab,
  ForgottenFavoritesTab,
} from '../components/discovery';
import SyncStatusBar from '../components/SyncStatusBar';
import { Modal, ModalFooter } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('DiscoveryPage');

type TabType = 'albums' | 'artists' | 'forgotten';
type AlbumSortOption = 'plays' | 'artist' | 'album' | 'recent';
type ArtistSortOption = 'plays' | 'artist' | 'albums' | 'recent';
type ForgottenSortOption = 'plays' | 'artist' | 'track' | 'dormant';

// Normalize album/artist names for matching
// Removes quotes, edition suffixes, and normalizes to lowercase
const normalizeForMatching = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[""''"`]/g, '') // Remove various quote characters
    .replace(/\s*\[explicit\]\s*/gi, '') // Remove [Explicit] tag
    .replace(/\s*\(deluxe\s*(edition)?\)\s*/gi, '') // Remove (Deluxe) or (Deluxe Edition)
    .replace(/\s*\(explicit\)\s*/gi, '') // Remove (Explicit)
    .replace(/\s*\(remaster(ed)?\)\s*/gi, '') // Remove (Remaster) or (Remastered)
    .replace(/\s*\(expanded\s*(edition)?\)\s*/gi, '') // Remove (Expanded) or (Expanded Edition)
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

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

  // Discogs wishlist state - store normalized wishlist items for flexible matching
  const [discogsWishlistItems, setDiscogsWishlistItems] = useState<
    Array<{ artist: string; title: string }>
  >([]);

  // Sorting state
  const [albumSort, setAlbumSort] = useState<AlbumSortOption>('plays');
  const [artistSort, setArtistSort] = useState<ArtistSortOption>('plays');
  const [forgottenSort, setForgottenSort] =
    useState<ForgottenSortOption>('plays');

  // Hide wanted items toggle
  const [hideWantedItems, setHideWantedItems] = useState(false);

  // Forgotten favorites state
  const [forgottenTracks, setForgottenTracks] = useState<ForgottenTrack[]>([]);
  const [forgottenLoading, setForgottenLoading] = useState(false);
  const [forgottenError, setForgottenError] = useState<string | null>(null);
  const [forgottenTotalMatching, setForgottenTotalMatching] = useState(0);
  const [dormantDays, setDormantDays] = useState(90); // Default 3 months (per plan)
  const [minPlays, setMinPlays] = useState(10); // Default 10 plays

  const api = getApiService(state.serverUrl);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch more albums than needed to ensure we have 100 after filtering wanted items
      const [albums, artists, localWantList, discogsWishlist] =
        await Promise.all([
          api.getMissingAlbums(200),
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

      // Pre-populate discogsWishlistItems with normalized Discogs wantlist items
      // Store as array for flexible matching (handles Last.fm quirks like "Artist & Album Title")
      const normalizedWishlist = discogsWishlist.map(
        (item: EnrichedWishlistItem) => ({
          artist: normalizeForMatching(item.artist),
          title: normalizeForMatching(item.title),
        })
      );
      setDiscogsWishlistItems(normalizedWishlist);
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

  // Load forgotten favorites (separate from main load since it can be slow)
  const loadForgottenFavorites = useCallback(async () => {
    try {
      setForgottenLoading(true);
      setForgottenError(null);
      const result = await api.getForgottenFavorites(
        dormantDays,
        minPlays,
        100
      );
      setForgottenTracks(result.tracks);
      setForgottenTotalMatching(result.meta.totalMatching);
    } catch (err) {
      setForgottenError(
        err instanceof Error
          ? err.message
          : 'Failed to load forgotten favorites'
      );
    } finally {
      setForgottenLoading(false);
    }
  }, [api, dormantDays, minPlays]);

  // Load forgotten favorites on mount and when params change
  useEffect(() => {
    loadForgottenFavorites();
  }, [loadForgottenFavorites]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  // Check if album is in Discogs wishlist
  // Handles: case differences, quotes, edition suffixes, and Last.fm quirks
  // where artist name may include album title (e.g., "Andrew Bird & The Mysterious Production Of Eggs")
  const isInDiscogsWishlist = (artist: string, album: string): boolean => {
    const normArtist = normalizeForMatching(artist);
    const normAlbum = normalizeForMatching(album);
    const combined = `${normArtist} ${normAlbum}`;

    return discogsWishlistItems.some(item => {
      // Exact match (artist:title)
      if (normArtist === item.artist && normAlbum === item.title) {
        return true;
      }
      // Handle Last.fm quirk: artist may include album title
      // e.g., Last.fm artist="Andrew Bird & The Mysterious Production Of Eggs"
      //       Discogs artist="Andrew Bird", title="The Mysterious Production Of Eggs"
      if (
        combined.includes(item.artist) &&
        combined.includes(item.title) &&
        item.title.length >= 10 // Avoid false positives with short titles
      ) {
        return true;
      }
      return false;
    });
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
      logger.error('Search failed', err);
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
      logger.error('Failed to create mapping', err);
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
      logger.error('Failed to hide album', err);
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
      logger.error('Failed to add to want list', err);
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
      logger.error('Failed to hide artist', err);
    }
  };

  // Calculate filtered album count for tab display
  const filteredAlbumCount = hideWantedItems
    ? missingAlbums.filter(
        album =>
          !isInDiscogsWishlist(album.artist, album.album) &&
          !addedToWantList.has(`${album.artist}:${album.album}`)
      ).length
    : missingAlbums.length;

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
          Missing Albums (
          {hideWantedItems
            ? `${Math.min(filteredAlbumCount, 100)}/${missingAlbums.length}`
            : missingAlbums.length}
          )
        </button>
        <button
          className={`discovery-tab ${activeTab === 'artists' ? 'active' : ''}`}
          onClick={() => setActiveTab('artists')}
        >
          Missing Artists ({missingArtists.length})
        </button>
        <button
          className={`discovery-tab ${activeTab === 'forgotten' ? 'active' : ''}`}
          onClick={() => setActiveTab('forgotten')}
        >
          Forgotten Favorites ({forgottenTracks.length})
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
            <MissingAlbumsTab
              missingAlbums={missingAlbums}
              albumSort={albumSort}
              setAlbumSort={setAlbumSort}
              hideWantedItems={hideWantedItems}
              setHideWantedItems={setHideWantedItems}
              addingToWantList={addingToWantList}
              addedToWantList={addedToWantList}
              isInDiscogsWishlist={isInDiscogsWishlist}
              formatDate={formatDate}
              openLink={openLink}
              getLastFmAlbumUrl={getLastFmAlbumUrl}
              getDiscogsAlbumUrl={getDiscogsAlbumUrl}
              openAlbumMapping={openAlbumMapping}
              handleAddToWantList={handleAddToWantList}
              handleHideAlbum={handleHideAlbum}
            />
          )}

          {activeTab === 'artists' && (
            <MissingArtistsTab
              missingArtists={missingArtists}
              artistSort={artistSort}
              setArtistSort={setArtistSort}
              formatDate={formatDate}
              openLink={openLink}
              getLastFmArtistUrl={getLastFmArtistUrl}
              getDiscogsArtistUrl={getDiscogsArtistUrl}
              openArtistMapping={openArtistMapping}
              handleHideArtist={handleHideArtist}
            />
          )}

          {activeTab === 'forgotten' && (
            <ForgottenFavoritesTab
              forgottenTracks={forgottenTracks}
              forgottenLoading={forgottenLoading}
              forgottenError={forgottenError}
              forgottenTotalMatching={forgottenTotalMatching}
              dormantDays={dormantDays}
              setDormantDays={setDormantDays}
              minPlays={minPlays}
              setMinPlays={setMinPlays}
              forgottenSort={forgottenSort}
              setForgottenSort={setForgottenSort}
              loadForgottenFavorites={loadForgottenFavorites}
              formatDate={formatDate}
              openLink={openLink}
              api={api}
            />
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
      <Modal
        isOpen={mappingModal.isOpen}
        onClose={closeMappingModal}
        title={`Map ${mappingModal.type === 'album' ? 'Album' : 'Artist'} to Collection`}
        size='medium'
        className='mapping-modal'
      >
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

        <ModalFooter>
          <button className='btn btn-secondary' onClick={closeMappingModal}>
            Cancel
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default DiscoveryPage;
