/* global navigator */
import React, { useState, useEffect } from 'react';

import { ForgottenTrack, TrackMapping } from '../../../shared/types';
import ApiService from '../../services/api';
import { createLogger } from '../../utils/logger';
import { playTrackOnSpotify } from '../../utils/spotifyUtils';
import { Modal, ModalSection } from '../ui/Modal';

const logger = createLogger('ForgottenFavoritesTab');

type ForgottenSortOption = 'plays' | 'artist' | 'track' | 'dormant';

interface ForgottenFavoritesTabProps {
  forgottenTracks: ForgottenTrack[];
  forgottenLoading: boolean;
  forgottenError: string | null;
  forgottenTotalMatching: number;
  dormantDays: number;
  setDormantDays: (days: number) => void;
  minPlays: number;
  setMinPlays: (plays: number) => void;
  forgottenSort: ForgottenSortOption;
  setForgottenSort: (sort: ForgottenSortOption) => void;
  loadForgottenFavorites: () => void;
  formatDate: (timestamp: number) => string;
  openLink: (url: string) => void;
  api: ApiService;
}

const ForgottenFavoritesTab: React.FC<ForgottenFavoritesTabProps> = ({
  forgottenTracks,
  forgottenLoading,
  forgottenError,
  forgottenTotalMatching,
  dormantDays,
  setDormantDays,
  minPlays,
  setMinPlays,
  forgottenSort,
  setForgottenSort,
  loadForgottenFavorites,
  formatDate,
  openLink,
  api,
}) => {
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<ForgottenTrack | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{
      artist: string;
      album: string;
      track: string;
      playCount: number;
    }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mappingSuccess, setMappingSuccess] = useState<string | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [existingMappings, setExistingMappings] = useState<TrackMapping[]>([]);

  // Load existing track mappings on mount
  useEffect(() => {
    const loadExistingMappings = async () => {
      try {
        const mappings = await api.getTrackMappings();
        setExistingMappings(mappings);
      } catch (error) {
        logger.warn('Failed to load existing track mappings', error);
      }
    };
    loadExistingMappings();
  }, [api]);

  // Check if a track is already mapped
  const isTrackAlreadyMapped = (
    artist: string,
    album: string,
    track: string
  ): boolean => {
    return existingMappings.some(
      m =>
        m.cacheArtist.toLowerCase() === artist.toLowerCase() &&
        m.cacheAlbum.toLowerCase() === album.toLowerCase() &&
        m.cacheTrack.toLowerCase() === track.toLowerCase()
    );
  };

  // Sort forgotten tracks based on selected option
  const sortedForgottenTracks = [...forgottenTracks].sort((a, b) => {
    switch (forgottenSort) {
      case 'plays':
        return b.allTimePlayCount - a.allTimePlayCount;
      case 'artist':
        return a.artist.localeCompare(b.artist);
      case 'track':
        return a.track.localeCompare(b.track);
      case 'dormant':
        return b.daysSincePlay - a.daysSincePlay;
      default:
        return 0;
    }
  });

  // Format days as human-readable duration
  const formatDormancy = (days: number): string => {
    if (days >= 365) {
      const years = Math.floor(days / 365);
      return `${years} year${years > 1 ? 's' : ''} ago`;
    } else if (days >= 30) {
      const months = Math.floor(days / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    return `${days} days ago`;
  };

  // Copy track to clipboard
  const copyTrackToClipboard = (track: ForgottenTrack) => {
    const text = `${track.artist} - ${track.track}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(text);
      setTimeout(() => setCopySuccess(null), 2000);
    });
  };

  // Copy all tracks to clipboard
  const copyAllTracksToClipboard = () => {
    const text = sortedForgottenTracks
      .map(t => `${t.artist} - ${t.track}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(`Copied ${sortedForgottenTracks.length} tracks`);
      setTimeout(() => setCopySuccess(null), 2000);
    });
  };

  // Open track mapping modal
  const openTrackMappingModal = (track: ForgottenTrack) => {
    setSelectedTrack(track);
    setSearchQuery(track.track); // Pre-fill with just the track title
    setMappingModalOpen(true);
    setMappingSuccess(null);
    setMappingError(null);
    // Trigger initial search
    searchLocalTracks(track.track);
  };

  // Search for tracks in local cache
  const searchLocalTracks = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setSearchLoading(true);
      const result = await api.getTrackHistoryPaginated(
        1,
        20, // Fetch more to account for filtered results
        'playCount',
        'desc',
        query
      );

      // Filter out tracks that are already mapped
      const filteredResults = result.items.filter(
        item => !isTrackAlreadyMapped(item.artist, item.album, item.track)
      );

      setSearchResults(filteredResults.slice(0, 10)); // Limit to 10 after filtering
    } catch (error) {
      logger.error('Failed to search tracks', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Create track mapping
  const createTrackMapping = async (cacheTrack: {
    artist: string;
    album: string;
    track: string;
  }) => {
    if (!selectedTrack) return;

    try {
      await api.createTrackMapping({
        historyArtist: selectedTrack.artist,
        historyAlbum: selectedTrack.album,
        historyTrack: selectedTrack.track,
        cacheArtist: cacheTrack.artist,
        cacheAlbum: cacheTrack.album,
        cacheTrack: cacheTrack.track,
      });

      // Reload mappings to update the filter
      const mappings = await api.getTrackMappings();
      setExistingMappings(mappings);

      // Reload forgotten favorites to reflect the new mapping
      loadForgottenFavorites();

      setMappingSuccess(
        `Mapped "${selectedTrack.track}" to "${cacheTrack.track}"`
      );
      setTimeout(() => {
        setMappingModalOpen(false);
        setMappingSuccess(null);
        setSelectedTrack(null);
      }, 1500);
    } catch (error) {
      setMappingError(
        error instanceof Error ? error.message : 'Failed to create mapping'
      );
    }
  };

  // Close mapping modal
  const closeMappingModal = () => {
    setMappingModalOpen(false);
    setSelectedTrack(null);
    setSearchQuery('');
    setSearchResults([]);
    setMappingError(null);
  };

  // Export tracks to CSV
  const exportTracksToCSV = () => {
    const headers = [
      'Artist',
      'Album',
      'Track',
      'Play Count',
      'Last Played',
      'Days Since Play',
    ];
    const rows = sortedForgottenTracks.map(t => [
      t.artist,
      t.album || '(Single)',
      t.track,
      t.allTimePlayCount.toString(),
      formatDate(t.lastPlayed),
      t.daysSincePlay.toString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row =>
        row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `forgotten-favorites-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className='discovery-section'>
      <div className='discovery-section-header'>
        <h2>Forgotten Favorites</h2>
        <div className='discovery-controls'>
          <div className='discovery-filter'>
            <label htmlFor='dormant-days'>Dormant for:</label>
            <select
              id='dormant-days'
              value={dormantDays}
              onChange={e => setDormantDays(parseInt(e.target.value))}
            >
              <option value='90'>3 months</option>
              <option value='180'>6 months</option>
              <option value='365'>1 year</option>
              <option value='730'>2 years</option>
              <option value='1095'>3 years</option>
            </select>
          </div>
          <div className='discovery-filter'>
            <label htmlFor='min-plays'>Min plays:</label>
            <select
              id='min-plays'
              value={minPlays}
              onChange={e => setMinPlays(parseInt(e.target.value))}
            >
              <option value='5'>5+</option>
              <option value='10'>10+</option>
              <option value='20'>20+</option>
              <option value='50'>50+</option>
              <option value='100'>100+</option>
            </select>
          </div>
          <div className='discovery-sort'>
            <label htmlFor='forgotten-sort'>Sort by:</label>
            <select
              id='forgotten-sort'
              value={forgottenSort}
              onChange={e =>
                setForgottenSort(e.target.value as ForgottenSortOption)
              }
            >
              <option value='plays'>Most Plays</option>
              <option value='artist'>Artist Name</option>
              <option value='track'>Track Name</option>
              <option value='dormant'>Most Dormant</option>
            </select>
          </div>
        </div>
      </div>

      {forgottenError && (
        <div className='message error'>
          <p>{forgottenError}</p>
          <button className='btn btn-small' onClick={loadForgottenFavorites}>
            Retry
          </button>
        </div>
      )}

      {forgottenLoading ? (
        <div className='loading-container'>
          <div className='loading-spinner' />
          <p>Finding your forgotten favorites...</p>
        </div>
      ) : sortedForgottenTracks.length === 0 ? (
        <p className='empty-state'>
          No forgotten favorites found. Try lowering the minimum play count or
          shortening the dormant period.
        </p>
      ) : (
        <>
          <div className='forgotten-actions'>
            <div className='forgotten-summary'>
              Showing {sortedForgottenTracks.length} of {forgottenTotalMatching}{' '}
              tracks
            </div>
            <div className='forgotten-export-buttons'>
              <button
                className='btn btn-small'
                onClick={copyAllTracksToClipboard}
                title='Copy all tracks to clipboard'
              >
                Copy All
              </button>
              <button
                className='btn btn-small'
                onClick={exportTracksToCSV}
                title='Export to CSV file'
              >
                Export CSV
              </button>
            </div>
          </div>

          {copySuccess && (
            <div className='copy-success-toast'>{copySuccess}</div>
          )}

          <div className='missing-list'>
            {sortedForgottenTracks.map((track, index) => (
              <div
                key={`${track.artist}-${track.album}-${track.track}-${index}`}
                className='missing-item'
              >
                <div className='missing-item-info'>
                  <div className='missing-item-title'>{track.track}</div>
                  <div className='missing-item-artist'>
                    {track.artist}
                    <span className='missing-item-album'>
                      {' '}
                      &middot; {track.album || '(Single)'}
                    </span>
                  </div>
                </div>
                <div className='missing-item-stats'>
                  <span className='missing-item-playcount'>
                    {track.allTimePlayCount} plays
                  </span>
                  <span className='forgotten-dormancy'>
                    {formatDormancy(track.daysSincePlay)}
                  </span>
                </div>
                <div className='missing-item-actions'>
                  <button
                    className='btn btn-small btn-icon'
                    onClick={() =>
                      playTrackOnSpotify(track.artist, track.track, track.album)
                    }
                    title='Play on Spotify'
                  >
                    ▶️
                  </button>
                  <button
                    className='btn btn-small btn-icon'
                    onClick={() =>
                      openLink(
                        `https://www.last.fm/music/${encodeURIComponent(track.artist)}/_/${encodeURIComponent(track.track)}`
                      )
                    }
                    title='View track on Last.fm'
                  >
                    Last.fm
                  </button>
                  <button
                    className='btn btn-small'
                    onClick={() => copyTrackToClipboard(track)}
                    title='Copy to clipboard'
                  >
                    Copy
                  </button>
                  <button
                    className='btn btn-small btn-secondary'
                    onClick={() => openTrackMappingModal(track)}
                    title='Map this track to local cache'
                  >
                    Map
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Track Mapping Modal */}
      <Modal
        isOpen={mappingModalOpen && selectedTrack !== null}
        onClose={closeMappingModal}
        title='Map Track to Local Cache'
        size='medium'
      >
        {selectedTrack && (
          <>
            <ModalSection>
              <div className='mapping-modal-source'>
                <h4>Forgotten Favorite Track:</h4>
                <div className='mapping-modal-track-info'>
                  <div className='mapping-modal-track-title'>
                    {selectedTrack.track}
                  </div>
                  <div className='mapping-modal-track-artist'>
                    {selectedTrack.artist} — {selectedTrack.album || '(Single)'}
                  </div>
                  <div className='mapping-modal-track-plays'>
                    {selectedTrack.allTimePlayCount} plays
                  </div>
                </div>
              </div>

              <div className='mapping-modal-arrow'>↓</div>

              <div className='mapping-modal-search'>
                <h4>Search Local Cache:</h4>
                <input
                  type='text'
                  className='form-input'
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    searchLocalTracks(e.target.value);
                  }}
                  placeholder='Search for matching track...'
                  autoFocus
                />

                {mappingError && (
                  <div className='message error'>{mappingError}</div>
                )}

                {mappingSuccess && (
                  <div className='message success'>{mappingSuccess}</div>
                )}

                {searchLoading ? (
                  <div className='mapping-modal-loading'>
                    <div className='spinner'></div>
                    Searching...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className='mapping-modal-empty'>
                    No tracks found. Try a different search.
                  </div>
                ) : (
                  <div className='mapping-modal-results'>
                    {searchResults.map((result, index) => (
                      <div
                        key={`${result.artist}-${result.album}-${result.track}-${index}`}
                        className='mapping-modal-result-item'
                      >
                        <div className='mapping-modal-result-info'>
                          <div className='mapping-modal-result-title'>
                            {result.track}
                          </div>
                          <div className='mapping-modal-result-artist'>
                            {result.artist} — {result.album}
                          </div>
                          <div className='mapping-modal-result-plays'>
                            {result.playCount} plays
                          </div>
                        </div>
                        <button
                          className='btn btn-small'
                          onClick={() => createTrackMapping(result)}
                        >
                          Map to This
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ModalSection>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ForgottenFavoritesTab;
