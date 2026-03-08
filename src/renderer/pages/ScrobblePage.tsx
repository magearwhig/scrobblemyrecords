import { Check, XCircle } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import './ScrobblePage.page.css';

import {
  CollectionItem,
  ScrobbleTrack,
  ScrobbleProgress,
} from '../../shared/types';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ListItemSkeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { formatLocalTimeClean } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('ScrobblePage');

const ScrobblePage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state } = useApp();
  const [selectedAlbums, setSelectedAlbums] = useState<CollectionItem[]>([]);
  const [preparedTracks, setPreparedTracks] = useState<ScrobbleTrack[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [customTimestamp, setCustomTimestamp] = useState<string>('');
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [scrobbling, setScrobbling] = useState(false);
  const [progress, setProgress] = useState<ScrobbleProgress | null>(null);
  const [results, setResults] = useState<{
    success: number;
    failed: number;
    errors?: string[];
  } | null>(null);
  const [error, setError] = useState<string>('');
  const [preparingTracks, setPreparingTracks] = useState(false);
  const [showDisambiguationWarning, setShowDisambiguationWarning] =
    useState(false);
  const [disambiguationArtists, setDisambiguationArtists] = useState<string[]>(
    []
  );

  const api = getApiService(state.serverUrl);

  useEffect(() => {
    // Check authentication status if not already authenticated
    if (!authStatus.discogs.authenticated || !authStatus.lastfm.authenticated) {
      checkAuthStatus();
    }
  }, []);

  useEffect(() => {
    // Load selected albums from localStorage
    const stored = localStorage.getItem('selectedAlbums');
    if (stored) {
      try {
        const albums = JSON.parse(stored);
        setSelectedAlbums(albums);
        prepareTracks(albums);
      } catch {
        setError('Failed to load selected albums');
      }
    }
  }, []);

  const checkAuthStatus = async () => {
    try {
      const status = await api.getAuthStatus();
      setAuthStatus(status);
    } catch (error) {
      logger.error('Error checking auth status', error);
    }
  };

  const prepareTracks = async (albums: CollectionItem[]) => {
    if (albums.length === 0) return;

    try {
      setError('');
      setPreparingTracks(true);
      const allTracks: ScrobbleTrack[] = [];

      for (const album of albums) {
        const releaseDetails = await api.getReleaseDetails(album.release.id);
        if (releaseDetails.tracklist) {
          const trackTimestamp = useCurrentTime
            ? undefined
            : customTimestamp
              ? new Date(customTimestamp).getTime() / 1000
              : undefined;

          const albumTracks = releaseDetails.tracklist.map((track, _index) => ({
            artist: track.artist || releaseDetails.artist,
            track: track.title,
            album: releaseDetails.title,
            albumCover: album.release.cover_image || releaseDetails.cover_image,
            timestamp: trackTimestamp,
            duration: track.duration
              ? parseInt(track.duration.replace(':', ''))
              : undefined,
          }));

          allTracks.push(...albumTracks);
        }
      }

      setPreparedTracks(allTracks);
      // Select all tracks by default
      setSelectedTracks(new Set(allTracks.map((_, index) => index)));
    } catch (_error) {
      setError(
        _error instanceof Error ? _error.message : 'Failed to prepare tracks'
      );
    } finally {
      setPreparingTracks(false);
    }
  };

  const handleTrackSelection = (index: number) => {
    const newSelected = new Set(selectedTracks);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTracks(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTracks.size === preparedTracks.length) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(preparedTracks.map((_, index) => index)));
    }
  };

  // Pattern to detect Discogs disambiguation suffix like (2), (11), etc.
  const DISAMBIGUATION_PATTERN = /\s*\(\d+\)\s*$/;

  // Get unique artists from selected tracks
  const getUniqueArtistsFromSelectedTracks = (): string[] => {
    if (selectedTracks.size === 0) return [];

    const artists = new Set<string>();
    const selectedIndices = Array.from(selectedTracks);

    selectedIndices.forEach(index => {
      const track = preparedTracks[index];
      if (track?.artist) {
        artists.add(track.artist);
      }
    });

    return Array.from(artists);
  };

  // Check for disambiguation warning before scrobbling
  const checkDisambiguationWarning = async () => {
    if (selectedTracks.size === 0) return;

    // Find artists with (number) suffix
    const allArtists = getUniqueArtistsFromSelectedTracks();
    const artistsWithSuffix = allArtists.filter(artist =>
      DISAMBIGUATION_PATTERN.test(artist)
    );

    if (artistsWithSuffix.length === 0) {
      // No disambiguation needed, proceed directly
      return proceedWithScrobble();
    }

    // Check which ones already have mappings
    const unmappedArtists: string[] = [];
    for (const artist of artistsWithSuffix) {
      try {
        const mapping = await api.lookupArtistMapping(artist);
        // If no mapping exists or mapping is same as original, it's unmapped
        if (!mapping.hasMapping || mapping.lastfmName === artist) {
          unmappedArtists.push(artist);
        }
      } catch {
        // If lookup fails, assume unmapped
        unmappedArtists.push(artist);
      }
    }

    if (unmappedArtists.length === 0) {
      // All have mappings, proceed directly
      return proceedWithScrobble();
    }

    // Show warning for unmapped artists
    setDisambiguationArtists(unmappedArtists);
    setShowDisambiguationWarning(true);
  };

  // Navigate to settings with artist pre-filled for mapping
  const navigateToMappingWithArtist = (artist: string) => {
    setShowDisambiguationWarning(false);
    window.location.hash = `#settings?prefillArtist=${encodeURIComponent(artist)}`;
  };

  // The actual scrobble logic (called after disambiguation check passes)
  const proceedWithScrobble = async () => {
    setShowDisambiguationWarning(false);
    await handleScrobbleInternal();
  };

  const handleScrobble = async () => {
    if (selectedTracks.size === 0) {
      setError('Please select at least one track to scrobble');
      return;
    }
    // Check for disambiguation warning before proceeding
    await checkDisambiguationWarning();
  };

  const handleScrobbleInternal = async () => {
    setScrobbling(true);
    setError('');
    setResults(null);

    try {
      const tracksToScrobble = preparedTracks.filter((_, index) =>
        selectedTracks.has(index)
      );

      setProgress({
        current: 0,
        total: tracksToScrobble.length,
        status: 'preparing',
      });

      const baseTimestamp = useCurrentTime
        ? Math.floor(Date.now() / 1000)
        : customTimestamp
          ? Math.floor(new Date(customTimestamp).getTime() / 1000)
          : undefined;

      setProgress(prev => (prev ? { ...prev, status: 'scrobbling' } : null));

      const result = await api.scrobbleBatch(tracksToScrobble, baseTimestamp);

      setProgress(prev =>
        prev ? { ...prev, status: 'completed', current: prev.total } : null
      );
      setResults(result);

      if (result.success > 0) {
        // Clear selected albums from localStorage
        localStorage.removeItem('selectedAlbums');
      }
    } catch (error) {
      setProgress(prev => (prev ? { ...prev, status: 'error' } : null));
      setError(error instanceof Error ? error.message : 'Scrobbling failed');
    } finally {
      setScrobbling(false);
    }
  };

  const formatTimestamp = () => {
    if (useCurrentTime) {
      return formatLocalTimeClean(new Date());
    } else if (customTimestamp) {
      return formatLocalTimeClean(new Date(customTimestamp));
    }
    return 'Not set';
  };

  if (!authStatus.discogs.authenticated || !authStatus.lastfm.authenticated) {
    return (
      <div className='card'>
        <h2>Scrobble Tracks</h2>
        <p>
          Please authenticate with both Discogs and Last.fm to scrobble tracks.
        </p>
        <div className='scrobble-margin-top'>
          <Button
            onClick={() => {
              window.location.hash = 'settings?tab=connections';
            }}
          >
            Connect Accounts
          </Button>
        </div>
      </div>
    );
  }

  if (selectedAlbums.length === 0) {
    return (
      <div className='card'>
        <h2>Scrobble Tracks</h2>
        <p>
          No albums selected for scrobbling. Please go to the collection page
          and select some albums first.
        </p>
        <div className='scrobble-margin-top'>
          <Button
            onClick={() => {
              window.location.hash = 'collection';
            }}
          >
            Browse Collection
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Disambiguation Warning Modal */}
      <Modal
        isOpen={showDisambiguationWarning}
        onClose={() => setShowDisambiguationWarning(false)}
        title='Artist Name Contains Disambiguation'
        size='small'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => setShowDisambiguationWarning(false)}
            >
              Cancel
            </Button>
            <Button
              variant='secondary'
              onClick={() =>
                navigateToMappingWithArtist(disambiguationArtists[0])
              }
            >
              Create Mapping
            </Button>
            <Button onClick={proceedWithScrobble}>Continue Anyway</Button>
          </>
        }
      >
        <p className='scrobble-modal-description'>
          The following artist(s) have Discogs disambiguation suffixes (numbers
          in parentheses) that may not match Last.fm:
        </p>
        <ul className='scrobble-modal-list'>
          {disambiguationArtists.map(artist => (
            <li key={artist} className='scrobble-modal-list-item'>
              <strong>{artist}</strong>
              <a
                href={`https://www.discogs.com/search/?q=${encodeURIComponent(artist)}&type=artist`}
                target='_blank'
                rel='noopener noreferrer'
                className='scrobble-modal-link'
              >
                View on Discogs
              </a>
            </li>
          ))}
        </ul>
        <p className='scrobble-modal-note'>
          You can create an artist mapping to scrobble with a different name on
          Last.fm.
        </p>
      </Modal>

      <div className='card'>
        <h2>Scrobble Tracks</h2>

        {error && <div className='error-message'>{error}</div>}

        <div className='scrobble-section'>
          <h3>Selected Albums ({selectedAlbums.length})</h3>
          <div className='scrobble-album-badges'>
            {selectedAlbums.map((album, index) => (
              <div key={index} className='scrobble-album-badge'>
                {album.release.artist} - {album.release.title}
              </div>
            ))}
          </div>
        </div>

        <div className='scrobble-section'>
          <h3>Timestamp Settings</h3>
          <div className='scrobble-timestamp-settings'>
            <label className='scrobble-radio-label'>
              <input
                type='radio'
                checked={useCurrentTime}
                onChange={() => setUseCurrentTime(true)}
              />
              Use current time
            </label>

            <label className='scrobble-radio-label'>
              <input
                type='radio'
                checked={!useCurrentTime}
                onChange={() => setUseCurrentTime(false)}
              />
              Use custom time
            </label>

            {!useCurrentTime && (
              <input
                type='datetime-local'
                className='form-input scrobble-datetime-input'
                value={customTimestamp}
                onChange={e => setCustomTimestamp(e.target.value)}
              />
            )}

            <div className='scrobble-timestamp-display'>
              Scrobble time: {formatTimestamp()}
            </div>
          </div>
        </div>

        {preparingTracks && (
          <div className='card'>
            <h3>Preparing tracks...</h3>
            <ListItemSkeleton count={8} />
          </div>
        )}

        {!preparingTracks && preparedTracks.length > 0 && (
          <div>
            <div className='scrobble-tracks-header'>
              <h3>Tracks ({preparedTracks.length})</h3>
              <div className='scrobble-tracks-controls'>
                <Button
                  size='small'
                  onClick={handleSelectAll}
                  disabled={scrobbling}
                >
                  {selectedTracks.size === preparedTracks.length
                    ? 'Deselect All'
                    : 'Select All'}
                </Button>
                <span className='scrobble-selected-count'>
                  {selectedTracks.size} selected
                </span>
              </div>
            </div>

            <div className='scrobble-track-list'>
              {preparedTracks.map((track, index) => (
                <div
                  key={index}
                  className={`scrobble-track-item${selectedTracks.has(index) ? ' scrobble-track-item--selected' : ''}`}
                >
                  <input
                    type='checkbox'
                    checked={selectedTracks.has(index)}
                    onChange={() => handleTrackSelection(index)}
                    disabled={scrobbling}
                    className='scrobble-track-checkbox'
                  />
                  <div className='scrobble-track-info'>
                    <div className='scrobble-track-title'>{track.track}</div>
                    <div className='scrobble-track-details'>
                      {track.artist} • {track.album}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {progress && (
          <div className='card scrobble-progress-card'>
            <h4>Scrobbling Progress</h4>
            <div className='scrobble-progress-section'>
              <ProgressBar
                value={progress.current}
                max={progress.total}
                variant={progress.status === 'error' ? 'danger' : 'primary'}
                size='small'
                animated
              />
              <div className='scrobble-progress-text'>
                {progress.current} of {progress.total} tracks •{' '}
                {progress.status}
              </div>
            </div>
          </div>
        )}

        {results && (
          <div className='card scrobble-results-card'>
            <h4>Scrobbling Results</h4>
            <div>
              <div className='scrobble-result-success'>
                <Check size={14} aria-hidden='true' /> Successfully scrobbled:{' '}
                {results.success} tracks
              </div>
              {results.failed > 0 && (
                <div className='scrobble-result-failed'>
                  <XCircle size={14} aria-hidden='true' /> Failed to scrobble:{' '}
                  {results.failed} tracks
                </div>
              )}
              {results.errors && results.errors.length > 0 && (
                <details className='scrobble-error-details'>
                  <summary>View Errors</summary>
                  <ul className='scrobble-error-list'>
                    {results.errors.map((error: string, index: number) => (
                      <li key={index} className='scrobble-error-item'>
                        {error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}

        <div className='scrobble-actions'>
          <Button
            onClick={handleScrobble}
            disabled={scrobbling || selectedTracks.size === 0}
          >
            {scrobbling
              ? 'Scrobbling...'
              : `Scrobble ${selectedTracks.size} Tracks`}
          </Button>

          <Button
            variant='secondary'
            onClick={() => window.history.back()}
            disabled={scrobbling}
          >
            Back to Collection
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ScrobblePage;
