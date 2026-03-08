import React, { useEffect, useState, useCallback } from 'react';

// Discovery styles are needed for MissingAlbumsTab (originally part of DiscoveryPage)
import '../../pages/DiscoveryPage.page.css';

import {
  MissingAlbum,
  CollectionItem,
  LocalWantItem,
  EnrichedWishlistItem,
} from '../../../shared/types';
import { normalizeForMatching } from '../../../shared/utils/trackNormalization';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import MissingAlbumsTab from '../discovery/MissingAlbumsTab';
import { EmptyState, ListItemSkeleton, Modal, ModalFooter } from '../ui';
import { Button } from '../ui/Button';

const logger = createLogger('MissingAlbumsContainer');

type AlbumSortOption = 'plays' | 'artist' | 'album' | 'recent';

interface MappingModalState {
  isOpen: boolean;
  historyArtist: string;
  historyAlbum?: string;
}

const MissingAlbumsContainer: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const [missingAlbums, setMissingAlbums] = useState<MissingAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mappingModal, setMappingModal] = useState<MappingModalState>({
    isOpen: false,
    historyArtist: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CollectionItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mappingInProgress, setMappingInProgress] = useState(false);

  const [addingToMonitored, setAddingToMonitored] = useState<Set<string>>(
    new Set()
  );
  const [monitoredAlbums, setMonitoredAlbums] = useState<Set<string>>(
    new Set()
  );
  const [discogsWishlistItems, setDiscogsWishlistItems] = useState<
    Array<{ artist: string; title: string }>
  >([]);
  const [albumSort, setAlbumSort] = useState<AlbumSortOption>('plays');
  const [hideWishlistedAndMonitored, setHideWishlistedAndMonitored] =
    useState(false);

  const api = getApiService(state.serverUrl);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [albums, localWantList, discogsWishlist] = await Promise.all([
        api.getMissingAlbums(200),
        api.getLocalWantList(),
        api.getWishlist().catch(() => [] as EnrichedWishlistItem[]),
      ]);

      setMissingAlbums(albums);

      const existingWantedKeys = new Set(
        localWantList.map(
          (item: LocalWantItem) => `${item.artist}:${item.album}`
        )
      );
      setMonitoredAlbums(existingWantedKeys);

      const normalizedWishlist = discogsWishlist.map(
        (item: EnrichedWishlistItem) => ({
          artist: normalizeForMatching(item.artist),
          title: normalizeForMatching(item.title),
        })
      );
      setDiscogsWishlistItems(normalizedWishlist);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load missing albums'
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  const isInDiscogsWishlist = (artist: string, album: string): boolean => {
    const normArtist = normalizeForMatching(artist);
    const normAlbum = normalizeForMatching(album);
    const combined = `${normArtist} ${normAlbum}`;

    return discogsWishlistItems.some(item => {
      if (normArtist === item.artist && normAlbum === item.title) return true;
      if (
        combined.includes(item.artist) &&
        combined.includes(item.title) &&
        item.title.length >= 10
      )
        return true;
      return false;
    });
  };

  const getLastFmAlbumUrl = (artist: string, album: string): string => {
    return `https://www.last.fm/music/${encodeURIComponent(artist)}/${encodeURIComponent(album)}`;
  };

  const getDiscogsAlbumUrl = (artist: string, album: string): string => {
    return `https://www.discogs.com/search/?q=${encodeURIComponent(`${artist} ${album}`)}&type=release`;
  };

  const openLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openAlbumMapping = (album: MissingAlbum) => {
    setMappingModal({
      isOpen: true,
      historyArtist: album.artist,
      historyAlbum: album.album,
    });
    setSearchQuery(album.artist);
    setSearchResults([]);
  };

  const closeMappingModal = () => {
    setMappingModal({ isOpen: false, historyArtist: '' });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !authStatus.discogs.username) return;
    try {
      setSearchLoading(true);
      const results = await api.searchCollection(
        authStatus.discogs.username,
        searchQuery
      );
      setSearchResults(results.slice(0, 20));
    } catch (err) {
      logger.error('Search failed', err);
    } finally {
      setSearchLoading(false);
    }
  }, [api, searchQuery, authStatus.discogs.username]);

  const handleSelectMapping = async (item: CollectionItem) => {
    try {
      setMappingInProgress(true);
      if (mappingModal.historyAlbum) {
        await api.createDiscoveryAlbumMapping({
          historyArtist: mappingModal.historyArtist,
          historyAlbum: mappingModal.historyAlbum,
          collectionId: item.id,
          collectionArtist: item.release.artist,
          collectionAlbum: item.release.title,
        });
        setMissingAlbums(prev =>
          prev.filter(
            a =>
              !(
                a.artist === mappingModal.historyArtist &&
                a.album === mappingModal.historyAlbum
              )
          )
        );
      }
      closeMappingModal();
    } catch (err) {
      logger.error('Failed to create mapping', err);
    } finally {
      setMappingInProgress(false);
    }
  };

  const handleHideAlbum = async (album: MissingAlbum) => {
    try {
      await api.hideAlbum(album.artist, album.album);
      setMissingAlbums(prev =>
        prev.filter(
          a => !(a.artist === album.artist && a.album === album.album)
        )
      );
    } catch (err) {
      logger.error('Failed to hide album', err);
    }
  };

  const handleMonitorAlbum = async (album: MissingAlbum) => {
    const key = `${album.artist}:${album.album}`;
    if (addingToMonitored.has(key) || monitoredAlbums.has(key)) return;

    try {
      setAddingToMonitored(prev => new Set([...prev, key]));
      await api.addToLocalWantList({
        artist: album.artist,
        album: album.album,
        playCount: album.playCount,
        lastPlayed: album.lastPlayed,
      });
      setMonitoredAlbums(prev => new Set([...prev, key]));
    } catch (err) {
      logger.error('Failed to add to want list', err);
    } finally {
      setAddingToMonitored(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className='loading-container'>
        <ListItemSkeleton count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title='Failed to Load Missing Albums'
        description={error}
        actions={[{ label: 'Retry', onClick: loadData }]}
        size='small'
      />
    );
  }

  return (
    <>
      <MissingAlbumsTab
        missingAlbums={missingAlbums}
        albumSort={albumSort}
        setAlbumSort={setAlbumSort}
        hideWishlistedAndMonitored={hideWishlistedAndMonitored}
        setHideWishlistedAndMonitored={setHideWishlistedAndMonitored}
        addingToMonitored={addingToMonitored}
        monitoredAlbums={monitoredAlbums}
        isInDiscogsWishlist={isInDiscogsWishlist}
        formatDate={formatDate}
        openLink={openLink}
        getLastFmAlbumUrl={getLastFmAlbumUrl}
        getDiscogsAlbumUrl={getDiscogsAlbumUrl}
        openAlbumMapping={openAlbumMapping}
        handleMonitorAlbum={handleMonitorAlbum}
        handleHideAlbum={handleHideAlbum}
      />

      {/* Mapping Modal */}
      <Modal
        isOpen={mappingModal.isOpen}
        onClose={closeMappingModal}
        title='Map Album to Collection'
        size='medium'
        className='mapping-modal'
      >
        <div className='mapping-source'>
          <strong>Last.fm album:</strong>
          <div className='mapping-source-info'>
            <span className='mapping-album'>{mappingModal.historyAlbum}</span>
            <span className='mapping-artist'>
              by {mappingModal.historyArtist}
            </span>
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
            <Button
              onClick={handleSearch}
              disabled={searchLoading || !searchQuery.trim()}
            >
              {searchLoading ? 'Searching...' : 'Search'}
            </Button>
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
                  role='button'
                  tabIndex={0}
                  aria-label={`Select ${item.release.title} by ${item.release.artist}`}
                  onClick={() =>
                    !mappingInProgress && handleSelectMapping(item)
                  }
                  onKeyDown={e => {
                    if (
                      (e.key === 'Enter' || e.key === ' ') &&
                      !mappingInProgress
                    ) {
                      e.preventDefault();
                      handleSelectMapping(item);
                    }
                  }}
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
          <Button variant='secondary' onClick={closeMappingModal}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default MissingAlbumsContainer;
