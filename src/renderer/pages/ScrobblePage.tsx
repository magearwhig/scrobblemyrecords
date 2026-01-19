import React, { useState, useEffect } from 'react';

import {
  CollectionItem,
  ScrobbleTrack,
  ScrobbleProgress,
} from '../../shared/types';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { formatLocalTimeClean } from '../utils/dateUtils';

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
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string>('');
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
      console.error('Error checking auth status:', error);
    }
  };

  const prepareTracks = async (albums: CollectionItem[]) => {
    if (albums.length === 0) return;

    try {
      setError('');
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
        <div style={{ marginTop: '1rem' }}>
          <a href='#settings?tab=connections' className='btn'>
            Connect Accounts
          </a>
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
        <div style={{ marginTop: '1rem' }}>
          <a href='#collection' className='btn'>
            Browse Collection
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Disambiguation Warning Modal */}
      {showDisambiguationWarning && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowDisambiguationWarning(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-primary)',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--border-color)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3
              style={{
                margin: '0 0 1rem 0',
                color: 'var(--warning-color)',
              }}
            >
              Artist Name Contains Disambiguation
            </h3>
            <p
              style={{
                margin: '0 0 1rem 0',
                color: 'var(--text-secondary)',
                fontSize: '0.95rem',
              }}
            >
              The following artist(s) have Discogs disambiguation suffixes
              (numbers in parentheses) that may not match Last.fm:
            </p>
            <ul
              style={{
                margin: '0 0 1.5rem 0',
                paddingLeft: '1.5rem',
              }}
            >
              {disambiguationArtists.map(artist => (
                <li
                  key={artist}
                  style={{
                    marginBottom: '0.5rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  <strong>{artist}</strong>
                  <a
                    href={`https://www.discogs.com/search/?q=${encodeURIComponent(artist)}&type=artist`}
                    target='_blank'
                    rel='noopener noreferrer'
                    style={{
                      marginLeft: '0.75rem',
                      fontSize: '0.85rem',
                      color: 'var(--accent-color)',
                    }}
                  >
                    View on Discogs
                  </a>
                </li>
              ))}
            </ul>
            <p
              style={{
                margin: '0 0 1rem 0',
                fontSize: '0.9rem',
                color: 'var(--text-muted)',
              }}
            >
              You can create an artist mapping to scrobble with a different name
              on Last.fm.
            </p>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <button
                className='btn btn-outline'
                onClick={() => setShowDisambiguationWarning(false)}
              >
                Cancel
              </button>
              <button
                className='btn btn-secondary'
                onClick={() =>
                  navigateToMappingWithArtist(disambiguationArtists[0])
                }
              >
                Create Mapping
              </button>
              <button className='btn btn-primary' onClick={proceedWithScrobble}>
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <div className='card'>
        <h2>Scrobble Tracks</h2>

        {error && <div className='error-message'>{error}</div>}

        <div style={{ marginBottom: '1.5rem' }}>
          <h3>Selected Albums ({selectedAlbums.length})</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {selectedAlbums.map((album, index) => (
              <div
                key={index}
                style={{
                  background: '#f0f0f0',
                  padding: '0.5rem 1rem',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                }}
              >
                {album.release.artist} - {album.release.title}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <h3>Timestamp Settings</h3>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <input
                type='radio'
                checked={useCurrentTime}
                onChange={() => setUseCurrentTime(true)}
              />
              Use current time
            </label>

            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
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
                className='form-input'
                value={customTimestamp}
                onChange={e => setCustomTimestamp(e.target.value)}
                style={{ maxWidth: '300px' }}
              />
            )}

            <div style={{ fontSize: '0.9rem', color: '#666' }}>
              Scrobble time: {formatTimestamp()}
            </div>
          </div>
        </div>

        {preparedTracks.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3>Tracks ({preparedTracks.length})</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className='btn btn-small'
                  onClick={handleSelectAll}
                  disabled={scrobbling}
                >
                  {selectedTracks.size === preparedTracks.length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
                <span
                  style={{
                    fontSize: '0.9rem',
                    color: '#666',
                    lineHeight: '2rem',
                  }}
                >
                  {selectedTracks.size} selected
                </span>
              </div>
            </div>

            <div
              style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                marginBottom: '1.5rem',
              }}
            >
              {preparedTracks.map((track, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.75rem',
                    borderBottom:
                      index < preparedTracks.length - 1
                        ? '1px solid #f0f0f0'
                        : 'none',
                    backgroundColor: selectedTracks.has(index)
                      ? '#f0fff4'
                      : 'white',
                  }}
                >
                  <input
                    type='checkbox'
                    checked={selectedTracks.has(index)}
                    onChange={() => handleTrackSelection(index)}
                    disabled={scrobbling}
                    style={{ marginRight: '1rem' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                      {track.track}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#666' }}>
                      {track.artist} • {track.album}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {progress && (
          <div
            className='card'
            style={{ backgroundColor: '#f8f9fa', margin: '1rem 0' }}
          >
            <h4>Scrobbling Progress</h4>
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  background: '#e0e0e0',
                  borderRadius: '10px',
                  height: '20px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    background:
                      progress.status === 'error' ? '#dc3545' : '#1db954',
                    height: '100%',
                    width: `${(progress.current / progress.total) * 100}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                {progress.current} of {progress.total} tracks •{' '}
                {progress.status}
              </div>
            </div>
          </div>
        )}

        {results && (
          <div
            className='card'
            style={{ backgroundColor: '#d4edda', marginBottom: '1rem' }}
          >
            <h4>Scrobbling Results</h4>
            <div>
              <div>✅ Successfully scrobbled: {results.success} tracks</div>
              {results.failed > 0 && (
                <div>❌ Failed to scrobble: {results.failed} tracks</div>
              )}
              {results.errors && results.errors.length > 0 && (
                <details style={{ marginTop: '1rem' }}>
                  <summary>View Errors</summary>
                  <ul style={{ marginTop: '0.5rem' }}>
                    {results.errors.map((error: string, index: number) => (
                      <li
                        key={index}
                        style={{ fontSize: '0.85rem', color: '#721c24' }}
                      >
                        {error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            className='btn'
            onClick={handleScrobble}
            disabled={scrobbling || selectedTracks.size === 0}
          >
            {scrobbling
              ? 'Scrobbling...'
              : `Scrobble ${selectedTracks.size} Tracks`}
          </button>

          <button
            className='btn btn-secondary'
            onClick={() => window.history.back()}
            disabled={scrobbling}
          >
            Back to Collection
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScrobblePage;
