import React, { useState, useEffect, useMemo, useCallback } from 'react';

import {
  DiscogsRelease,
  DiscardReason,
  AddDiscardPileItemRequest,
  MarketplaceStats,
} from '../../shared/types';
import { normalizeForMatching } from '../../shared/utils/trackNormalization';
import AlbumScrobbleHistory from '../components/AlbumScrobbleHistory';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { formatLocalTimeClean, formatRelativeTime } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';
import { playAlbumOnSpotify, playTrackOnSpotify } from '../utils/spotifyUtils';

const logger = createLogger('ReleaseDetailsPage');

interface TrackScrobbleStats {
  count: number;
  lastPlayed: number | null;
}

interface AlbumHistoryData {
  found: boolean;
  artist: string;
  album: string;
  lastPlayed: number | null;
  playCount: number;
  plays: Array<{ timestamp: number; track?: string }>;
}

const ReleaseDetailsPage: React.FC = () => {
  const { authStatus } = useAuth();
  const { state } = useApp();
  const [release, setRelease] = useState<DiscogsRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrobbling, setScrobbling] = useState(false);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>('');
  const [scrobbleResult, setScrobbleResult] = useState<{
    success: number;
    failed: number;
    ignored: number;
    errors: string[];
  } | null>(null);
  const [connectionTest, setConnectionTest] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [sessionKey, setSessionKey] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [scrobbleProgress, setScrobbleProgress] = useState<{
    current: number;
    total: number;
    success: number;
    failed: number;
    ignored: number;
  } | null>(null);
  const [artistMapping, setArtistMapping] = useState<{
    lastfmName: string;
    hasMapping: boolean;
    isOriginal: boolean;
  } | null>(null);
  const [showDisambiguationWarning, setShowDisambiguationWarning] =
    useState(false);
  const [disambiguationArtists, setDisambiguationArtists] = useState<string[]>(
    []
  );

  // Discard pile state
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState<DiscardReason>('selling');
  const [discardReasonNote, setDiscardReasonNote] = useState('');
  const [discardEstimatedValue, setDiscardEstimatedValue] = useState('');
  const [discardNotes, setDiscardNotes] = useState('');
  const [addingToDiscard, setAddingToDiscard] = useState(false);
  const [discardSuccess, setDiscardSuccess] = useState<string | null>(null);
  const [isInDiscardPile, setIsInDiscardPile] = useState(false);
  const [marketplaceStats, setMarketplaceStats] =
    useState<MarketplaceStats | null>(null);
  const [loadingMarketplaceStats, setLoadingMarketplaceStats] = useState(false);
  const [collectionItemId, setCollectionItemId] = useState<number | null>(null);

  // Track scrobble stats state
  const [albumHistory, setAlbumHistory] = useState<AlbumHistoryData | null>(
    null
  );

  const api = getApiService(state.serverUrl);

  // Pattern to detect Discogs disambiguation suffix like (2), (11), etc.
  const DISAMBIGUATION_PATTERN = /\s*\(\d+\)\s*$/;

  // Load release details on mount - the key prop from MainContent ensures
  // this component remounts when navigating to a different release
  useEffect(() => {
    // Small delay to ensure localStorage is fully written before reading
    // This handles potential race conditions during rapid navigation
    const timeoutId = setTimeout(() => {
      loadReleaseDetails();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (release?.artist) {
      loadArtistMapping(release.artist);
    }
  }, [release?.artist]);

  // Load album history function (must be defined before useEffect that uses it)
  const loadAlbumHistory = useCallback(
    async (artist: string, album: string) => {
      try {
        const data = await api.getAlbumHistory(artist, album);
        setAlbumHistory(data);
      } catch (err) {
        logger.warn('Failed to load album history for track stats', err);
        setAlbumHistory(null);
      }
    },
    [api]
  );

  // Fetch album history when release is loaded
  useEffect(() => {
    if (release?.artist && release?.title) {
      loadAlbumHistory(release.artist, release.title);
    }
  }, [release?.artist, release?.title, loadAlbumHistory]);

  // Calculate per-track scrobble stats from album history
  const trackScrobbleStats = useMemo((): Map<string, TrackScrobbleStats> => {
    const stats = new Map<string, TrackScrobbleStats>();

    if (!albumHistory?.plays) {
      return stats;
    }

    for (const play of albumHistory.plays) {
      if (!play.track) continue;

      const normalizedTrack = normalizeForMatching(play.track);
      const existing = stats.get(normalizedTrack);

      if (existing) {
        existing.count++;
        // Keep the most recent play timestamp
        if (play.timestamp > (existing.lastPlayed || 0)) {
          existing.lastPlayed = play.timestamp;
        }
      } else {
        stats.set(normalizedTrack, {
          count: 1,
          lastPlayed: play.timestamp,
        });
      }
    }

    return stats;
  }, [albumHistory?.plays]);

  // Helper to get scrobble stats for a track
  const getTrackStats = (trackTitle: string): TrackScrobbleStats | null => {
    const normalizedTitle = normalizeForMatching(trackTitle);
    return trackScrobbleStats.get(normalizedTitle) || null;
  };

  const loadReleaseDetails = async () => {
    try {
      setLoading(true);
      setError('');

      // Get release from localStorage (set by AlbumCard)
      const releaseData = localStorage.getItem('selectedRelease');
      const storedCollectionItemId = localStorage.getItem(
        'selectedCollectionItemId'
      );
      logger.info('loadReleaseDetails called');
      logger.info(
        `releaseData from localStorage: ${releaseData ? 'exists' : 'null'}`
      );

      if (!releaseData) {
        setError('No release data found. Please go back and select an album.');
        return;
      }

      const releaseInfo = JSON.parse(releaseData);
      logger.info('Parsed releaseInfo', {
        id: releaseInfo.id,
        title: releaseInfo.title,
        artist: releaseInfo.artist,
      });

      // Store collection item ID if available
      if (storedCollectionItemId) {
        setCollectionItemId(parseInt(storedCollectionItemId, 10));
      }

      // Fetch full release details from API
      const fullRelease = await api.getReleaseDetails(releaseInfo.id);
      logger.info('API returned fullRelease', {
        id: fullRelease.id,
        title: fullRelease.title,
      });
      setRelease(fullRelease);

      // Select all actual tracks by default (filter out section headers)
      const actualTrackIndices =
        fullRelease.tracklist
          ?.map((track, index) => ({ track, index }))
          .filter(({ track }) => track.position && track.position.trim() !== '')
          .map(({ index }) => index) || [];
      setSelectedTracks(new Set(actualTrackIndices));

      // Check if this release is in the discard pile
      try {
        const discardPileIds = await api.getDiscardPileCollectionIds();
        if (storedCollectionItemId) {
          setIsInDiscardPile(
            discardPileIds.includes(parseInt(storedCollectionItemId, 10))
          );
        }
      } catch (err) {
        logger.warn('Failed to check discard pile status', err);
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to load release details'
      );
    } finally {
      setLoading(false);
    }
  };

  const loadArtistMapping = async (artistName: string) => {
    try {
      const mapping = await api.lookupArtistMapping(artistName);
      setArtistMapping(mapping);
    } catch (error) {
      logger.warn('Failed to load artist mapping', error);
      setArtistMapping(null);
    }
  };

  // Discard pile handlers
  const handleOpenDiscardModal = async () => {
    if (!release) return;
    setDiscardModalOpen(true);
    setDiscardReason('selling');
    setDiscardReasonNote('');
    setDiscardEstimatedValue('');
    setDiscardNotes('');
    setMarketplaceStats(null);

    // Fetch marketplace stats in background
    setLoadingMarketplaceStats(true);
    try {
      const stats = await api.getMarketplaceStats(release.id);
      setMarketplaceStats(stats);
      // Auto-populate estimated value from marketplace data
      if (stats) {
        const autoValue =
          stats.priceSuggestions?.veryGoodPlus?.value ??
          stats.medianPrice ??
          stats.lowestPrice;
        if (autoValue != null) {
          setDiscardEstimatedValue(autoValue.toFixed(2));
        }
      }
    } catch (err) {
      logger.error('Failed to fetch marketplace stats', err);
    } finally {
      setLoadingMarketplaceStats(false);
    }
  };

  const handleCloseDiscardModal = () => {
    setDiscardModalOpen(false);
    setMarketplaceStats(null);
  };

  const handleAddToDiscardPile = async () => {
    if (!release || !collectionItemId) return;

    setAddingToDiscard(true);
    try {
      const request: AddDiscardPileItemRequest = {
        collectionItemId,
        releaseId: release.id,
        masterId: release.master_id,
        artist: release.artist,
        title: release.title,
        coverImage: release.cover_image,
        format: release.format,
        year: release.year,
        reason: discardReason,
        reasonNote: discardReasonNote || undefined,
        estimatedValue: discardEstimatedValue
          ? parseFloat(discardEstimatedValue)
          : undefined,
        notes: discardNotes || undefined,
      };

      await api.addToDiscardPile(request);
      setIsInDiscardPile(true);
      setDiscardSuccess('Added to discard pile');
      setTimeout(() => setDiscardSuccess(null), 5000);
      handleCloseDiscardModal();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to add to discard pile'
      );
    } finally {
      setAddingToDiscard(false);
    }
  };

  const handleTrackToggle = (trackIndex: number) => {
    const newSelected = new Set(selectedTracks);
    if (newSelected.has(trackIndex)) {
      newSelected.delete(trackIndex);
    } else {
      newSelected.add(trackIndex);
    }
    setSelectedTracks(newSelected);
  };

  const handleSelectAllTracks = () => {
    const actualTrackIndices =
      release?.tracklist
        ?.map((track, index) => ({ track, index }))
        .filter(({ track }) => track.position && track.position.trim() !== '')
        .map(({ index }) => index) || [];

    if (selectedTracks.size === actualTrackIndices.length) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(actualTrackIndices));
    }
  };

  // Parse track positions to determine sides and groups
  const parseSides = () => {
    if (!release?.tracklist) return { sides: [], discs: [] };

    const sides: string[] = [];
    const discs: { [key: string]: string[] } = {};

    release.tracklist.forEach((track, _index) => {
      const position = track.position.trim();

      // Check for letter-number format (A1, B1, C1, etc.) OR just a single letter (C, D, etc.)
      // Single letter means the entire side is one track
      const letterMatch = position.match(/^([A-Z])(\d*)$/);
      if (letterMatch) {
        const side = letterMatch[1];
        if (!sides.includes(side)) {
          sides.push(side);
        }

        // Group sides into discs (A&B = Disc 1, C&D = Disc 2, etc.)
        const discNumber = Math.floor((side.charCodeAt(0) - 65) / 2) + 1;
        const discKey = `Disc ${discNumber}`;
        if (!discs[discKey]) {
          discs[discKey] = [];
        }
        if (!discs[discKey].includes(side)) {
          discs[discKey].push(side);
        }
      }
    });

    // Sort sides alphabetically
    sides.sort();

    // Sort disc sides
    Object.keys(discs).forEach(disc => {
      discs[disc].sort();
    });

    return { sides, discs };
  };

  const getSideTrackIndices = (side: string): number[] => {
    if (!release?.tracklist) return [];

    return release.tracklist
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.position.startsWith(side))
      .map(({ index }) => index);
  };

  const getDiscTrackIndices = (sides: string[]): number[] => {
    const allIndices: number[] = [];
    sides.forEach(side => {
      allIndices.push(...getSideTrackIndices(side));
    });
    return allIndices;
  };

  const handleSideToggle = (side: string) => {
    const sideIndices = getSideTrackIndices(side);
    const allSelected = sideIndices.every(index => selectedTracks.has(index));

    const newSelected = new Set(selectedTracks);

    if (allSelected) {
      // Deselect all tracks from this side
      sideIndices.forEach(index => newSelected.delete(index));
    } else {
      // Select all tracks from this side
      sideIndices.forEach(index => newSelected.add(index));
    }

    setSelectedTracks(newSelected);
  };

  const handleDiscToggle = (discSides: string[]) => {
    const discIndices = getDiscTrackIndices(discSides);
    const allSelected = discIndices.every(index => selectedTracks.has(index));

    const newSelected = new Set(selectedTracks);

    if (allSelected) {
      // Deselect all tracks from this disc
      discIndices.forEach(index => newSelected.delete(index));
    } else {
      // Select all tracks from this disc
      discIndices.forEach(index => newSelected.add(index));
    }

    setSelectedTracks(newSelected);
  };

  const isSideSelected = (side: string): boolean => {
    const sideIndices = getSideTrackIndices(side);
    return (
      sideIndices.length > 0 &&
      sideIndices.every(index => selectedTracks.has(index))
    );
  };

  const isDiscSelected = (sides: string[]): boolean => {
    const discIndices = getDiscTrackIndices(sides);
    return (
      discIndices.length > 0 &&
      discIndices.every(index => selectedTracks.has(index))
    );
  };

  // Get unique artists from selected tracks
  const getUniqueArtistsFromSelectedTracks = (): string[] => {
    if (!release || selectedTracks.size === 0) return [];

    const artists = new Set<string>();
    const selectedIndices = Array.from(selectedTracks);

    selectedIndices.forEach(index => {
      const track = release.tracklist?.[index];
      if (track) {
        // Use track artist if available, otherwise release artist
        const artist = track.artist || release.artist;
        if (artist) {
          artists.add(artist);
        }
      }
    });

    return Array.from(artists);
  };

  // Check for disambiguation warning before scrobbling
  const checkDisambiguationWarning = async () => {
    if (!release || selectedTracks.size === 0) return;

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
    if (!release || selectedTracks.size === 0) return;
    // Check for disambiguation warning before proceeding
    await checkDisambiguationWarning();
  };

  const handleScrobbleInternal = async () => {
    if (!release || selectedTracks.size === 0) return;

    try {
      setScrobbling(true);
      setScrobbleResult(null);
      setScrobbleProgress(null);

      // Parse start time
      let startTimestamp: number;
      if (startTime) {
        // If user provided a specific time, use it
        const date = new Date(startTime);
        startTimestamp = Math.floor(date.getTime() / 1000);
      } else {
        // Default to current time minus total duration of selected tracks
        const selectedTrackIndices = Array.from(selectedTracks);
        const selectedTracksList = selectedTrackIndices
          .map(i => release.tracklist?.[i])
          .filter(Boolean);
        const totalDuration = selectedTracksList.reduce((total, track) => {
          const duration = track?.duration
            ? parseTrackDuration(track.duration)
            : 180;
          return total + duration + 1; // +1 for gap between tracks
        }, 0);
        startTimestamp = Math.floor(Date.now() / 1000) - totalDuration;
      }

      // Prepare tracks for scrobbling with proper timing
      const selectedTrackIndices = Array.from(selectedTracks);
      const result = await api.prepareTracksFromRelease(
        release,
        selectedTrackIndices,
        startTimestamp
      );

      logger.info(
        'Prepared tracks with timing',
        result.tracks.map(t => ({
          track: t.track,
          timestamp: t.timestamp
            ? formatLocalTimeClean(t.timestamp * 1000)
            : 'No timestamp',
          duration: t.duration,
        }))
      );

      // Start scrobbling and get session ID
      // Pass collection release info for auto-mapping (handles Various Artists, etc.)
      const scrobbleResult = await api.scrobbleBatch(result.tracks, undefined, {
        releaseId: release.id,
        artist: release.artist,
        album: release.title,
      });

      // Start polling for progress
      const pollProgress = async () => {
        try {
          const progress = await api.getScrobbleProgress(
            scrobbleResult.sessionId
          );
          if (progress.progress) {
            setScrobbleProgress(progress.progress);
          }

          if (progress.status === 'completed' || progress.status === 'failed') {
            setScrobbleResult({
              success: progress.progress?.success || 0,
              failed: progress.progress?.failed || 0,
              ignored: progress.progress?.ignored || 0,
              errors: progress.error ? [progress.error] : [],
            });
            setScrobbling(false);
            setScrobbleProgress(null);
            return;
          }

          // Continue polling
          setTimeout(pollProgress, 1000);
        } catch (error) {
          logger.error('Error polling progress', error);
          setScrobbling(false);
        }
      };

      // Start polling after a short delay
      setTimeout(pollProgress, 500);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to scrobble tracks'
      );
      setScrobbling(false);
    }
  };

  // Helper function to parse track duration
  const parseTrackDuration = (duration: string): number => {
    if (typeof duration === 'number') {
      return duration;
    }

    if (typeof duration === 'string') {
      const parts = duration.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0]);
        const seconds = parseInt(parts[1]);
        return minutes * 60 + seconds;
      }
    }

    return 180; // Default 3 minutes
  };

  // Handle auto timing button - calculates timing so tracks end at current time
  const handleAutoTiming = () => {
    if (selectedTracks.size === 0) {
      setStartTime('');
      return;
    }

    // Calculate total duration of selected tracks
    const selectedTrackIndices = Array.from(selectedTracks);
    const selectedTracksList = selectedTrackIndices
      .map(i => release?.tracklist?.[i])
      .filter(Boolean);
    const totalDuration = selectedTracksList.reduce((total, track) => {
      const duration = track?.duration
        ? parseTrackDuration(track.duration)
        : 180;
      return total + duration + 1; // +1 for gap between tracks
    }, 0);

    // Calculate start time so that scrobbles end at current time
    const now = new Date();
    const startDate = new Date(now.getTime() - totalDuration * 1000);

    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    const hours = String(startDate.getHours()).padStart(2, '0');
    const minutes = String(startDate.getMinutes()).padStart(2, '0');

    const formattedTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    setStartTime(formattedTime);
  };

  const getLastfmProfileUrl = () => {
    if (authStatus.lastfm.username) {
      return `https://www.last.fm/user/${authStatus.lastfm.username}`;
    }
    return undefined;
  };

  const testLastfmConnection = async () => {
    try {
      const result = await api.testLastfmConnection();
      setConnectionTest(result);
    } catch (error) {
      setConnectionTest({
        success: false,
        message:
          error instanceof Error ? error.message : 'Connection test failed',
      });
    }
  };

  const getSessionKey = async () => {
    try {
      const result = await api.getLastfmSessionKey();
      setSessionKey(result.sessionKey);
    } catch (error) {
      setSessionKey(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  if (loading) {
    return (
      <div className='card'>
        <div className='loading'>
          <div className='spinner'></div>
          Loading release details...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='card'>
        <div className='error-message'>
          {error}
          <button
            className='btn btn-small release-details-button-margin-left'
            onClick={() => (window.location.hash = '#collection')}
          >
            Back to Collection
          </button>
        </div>
      </div>
    );
  }

  if (!release) {
    return (
      <div className='card'>
        <div className='error-message'>
          No release data available
          <button
            className='btn btn-small release-details-button-margin-left'
            onClick={() => (window.location.hash = '#collection')}
          >
            Back to Collection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Disambiguation Warning Modal */}
      {showDisambiguationWarning && (
        <div
          className='release-details-modal-overlay'
          onClick={() => setShowDisambiguationWarning(false)}
        >
          <div
            className='release-details-modal-container'
            onClick={e => e.stopPropagation()}
          >
            <h3 className='release-details-warning-heading'>
              Artist Name Contains Disambiguation
            </h3>
            <p className='release-details-modal-description'>
              The following artist(s) have Discogs disambiguation suffixes
              (numbers in parentheses) that may not match Last.fm:
            </p>
            <ul className='release-details-modal-list'>
              {disambiguationArtists.map(artist => (
                <li key={artist} className='release-details-modal-list-item'>
                  <strong>{artist}</strong>
                  <a
                    href={`https://www.discogs.com/search/?q=${encodeURIComponent(artist)}&type=artist`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='release-details-modal-link'
                  >
                    View on Discogs
                  </a>
                </li>
              ))}
            </ul>
            <p className='release-details-modal-muted-text'>
              You can create an artist mapping to scrobble with a different name
              on Last.fm.
            </p>
            <div className='release-details-modal-button-container'>
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
        <div className='release-details-header-container'>
          <h2>Release Details</h2>
          <button
            className='btn btn-small btn-secondary'
            onClick={() => (window.location.hash = '#collection')}
          >
            Back to Collection
          </button>
        </div>

        <div className='release-details-main-content'>
          <div className='release-details-image-container'>
            <img
              src={release.cover_image}
              alt={release.title}
              className='release-details-cover-image'
            />
          </div>

          <div className='release-details-content'>
            <h3 className='release-details-title'>{release.title}</h3>
            <p className='release-details-artist'>
              {release.artist}
              {artistMapping && artistMapping.hasMapping && (
                <span
                  className='release-details-artist-mapping-badge'
                  title={`This artist will be scrobbled as "${artistMapping.lastfmName}" on Last.fm`}
                >
                  → {artistMapping.lastfmName}
                </span>
              )}
            </p>
            <p className='release-details-metadata'>
              {release.year} • {release.format.join(', ')}
            </p>
            {release.label && release.label.length > 0 && (
              <p className='release-details-metadata'>
                {release.label.join(', ')}
              </p>
            )}
            {release.catalog_number && (
              <p className='release-details-metadata'>
                Catalog: {release.catalog_number}
              </p>
            )}

            {/* Play on Spotify button */}
            <div className='release-details-button-container'>
              <button
                className='btn btn-small btn-icon release-details-button-margin-right'
                onClick={() =>
                  playAlbumOnSpotify(release.artist, release.title)
                }
                title='Play on Spotify'
              >
                ▶️ Play on Spotify
              </button>
            </div>

            {/* Discard pile button */}
            {collectionItemId && (
              <div className='release-details-button-container'>
                {isInDiscardPile ? (
                  <span className='release-details-discard-indicator'>
                    📦 In Discard Pile
                  </span>
                ) : (
                  <button
                    className='btn btn-small btn-outline-warning release-details-discard-button'
                    onClick={handleOpenDiscardModal}
                  >
                    📦 Add to Discard Pile
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Discard success message */}
        {discardSuccess && (
          <div className='message success release-details-message-margin'>
            {discardSuccess}
          </div>
        )}

        {/* Scrobble History Section */}
        <AlbumScrobbleHistory artist={release.artist} album={release.title} />

        {scrobbleProgress && (
          <div className='message info release-details-message-margin'>
            <div className='release-details-progress-header'>
              <strong>Scrobbling Progress:</strong>
              <span>
                {scrobbleProgress.current} / {scrobbleProgress.total}
              </span>
            </div>
            <div className='release-details-progress-bar-container'>
              <div
                className='release-details-progress-bar-fill'
                style={{
                  width: `${(scrobbleProgress.current / scrobbleProgress.total) * 100}%`,
                }}
              />
            </div>
            <div className='release-details-progress-stats'>
              ✅ {scrobbleProgress.success} successful • ⚠️{' '}
              {scrobbleProgress.ignored} ignored • ❌ {scrobbleProgress.failed}{' '}
              failed
            </div>
          </div>
        )}

        {scrobbleResult && (
          <div
            className={`message ${scrobbleResult.failed === 0 && scrobbleResult.ignored === 0 ? 'success' : scrobbleResult.failed > 0 ? 'error' : 'warning'} release-details-message-margin`}
          >
            <strong>Scrobble Results:</strong>
            {scrobbleResult.success > 0 && (
              <span style={{ color: 'var(--success-color)' }}>
                {' '}
                {scrobbleResult.success} successful
              </span>
            )}
            {scrobbleResult.ignored > 0 && (
              <span style={{ color: 'var(--warning-color)' }}>
                {' '}
                {scrobbleResult.ignored} ignored
              </span>
            )}
            {scrobbleResult.failed > 0 && (
              <span style={{ color: 'var(--error-color)' }}>
                {' '}
                {scrobbleResult.failed} failed
              </span>
            )}

            {scrobbleResult.errors.length > 0 && (
              <div className='release-details-error-details'>
                <strong>Details:</strong>
                <ul className='release-details-error-list'>
                  {scrobbleResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {scrobbleResult.ignored > 0 && (
              <div className='release-details-ignored-note'>
                <strong>Note:</strong> Ignored scrobbles usually mean the track
                was scrobbled too recently or is a duplicate.
              </div>
            )}

            {getLastfmProfileUrl() && (
              <div className='release-details-profile-link'>
                <a
                  href={getLastfmProfileUrl()}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='btn btn-small'
                >
                  View on Last.fm
                </a>
              </div>
            )}
          </div>
        )}

        <div className='release-details-tracks-section'>
          <div className='release-details-tracks-header'>
            <h4 className='release-details-tracks-heading'>
              Tracks ({selectedTracks.size} selected)
            </h4>
            <div className='release-details-tracks-buttons'>
              <button
                className='btn btn-small'
                onClick={handleSelectAllTracks}
                disabled={!release.tracklist?.length}
              >
                {selectedTracks.size === (release.tracklist?.length || 0)
                  ? 'Deselect All'
                  : 'Select All'}
              </button>

              <button
                className='btn btn-primary'
                onClick={handleScrobble}
                disabled={
                  selectedTracks.size === 0 ||
                  scrobbling ||
                  !authStatus.lastfm.authenticated
                }
              >
                {scrobbling
                  ? 'Scrobbling...'
                  : `Scrobble ${selectedTracks.size} Track${selectedTracks.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          {/* Side Selection Buttons */}
          {(() => {
            const { sides, discs } = parseSides();
            if (sides.length > 1) {
              return (
                <div className='release-details-side-selection'>
                  <h5 className='release-details-side-heading'>
                    Select by Side
                  </h5>

                  {/* Disc-level buttons for multi-disc albums */}
                  {Object.keys(discs).length > 1 && (
                    <div className='release-details-disc-group'>
                      <div className='release-details-selection-label'>
                        By Disc:
                      </div>
                      <div className='release-details-selection-buttons'>
                        {Object.entries(discs).map(([discName, discSides]) => (
                          <button
                            key={discName}
                            className={`btn btn-small btn-filter ${isDiscSelected(discSides) ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => handleDiscToggle(discSides)}
                            style={{ fontSize: '0.85rem' }}
                            aria-pressed={isDiscSelected(discSides)}
                            aria-label={`${isDiscSelected(discSides) ? 'Deselect' : 'Select'} ${discName} with sides ${discSides.join(' and ')}`}
                          >
                            {discName} ({discSides.join('/')})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Individual side buttons */}
                  <div>
                    <div className='release-details-selection-label'>
                      By Side:
                    </div>
                    <div className='release-details-selection-buttons'>
                      {sides.map(side => {
                        const sideTrackCount = getSideTrackIndices(side).length;
                        return (
                          <button
                            key={side}
                            className={`btn btn-small btn-filter ${isSideSelected(side) ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => handleSideToggle(side)}
                            style={{ fontSize: '0.85rem' }}
                            aria-pressed={isSideSelected(side)}
                            aria-label={`${isSideSelected(side) ? 'Deselect' : 'Select'} side ${side} with ${sideTrackCount} track${sideTrackCount === 1 ? '' : 's'}`}
                          >
                            Side {side} ({sideTrackCount})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {selectedTracks.size > 0 && (
            <div className='release-details-timing-container'>
              <h5 className='release-details-timing-heading'>
                Scrobble Timing
              </h5>
              <p className='release-details-timing-description'>
                Set when you started listening to the first track, or leave
                empty to use realistic timing.
              </p>
              <div className='release-details-timing-inputs'>
                <div className='form-group release-details-form-group'>
                  <label
                    htmlFor='start-time-input'
                    className='form-label release-details-label-small'
                  >
                    Start Time:
                  </label>
                  <div className='release-details-input-container'>
                    <input
                      id='start-time-input'
                      type='datetime-local'
                      className='form-input release-details-input-small'
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                    />
                    {startTime && (
                      <>
                        <button
                          className='btn btn-small btn-outline release-details-time-adjust-button'
                          onClick={() => {
                            // Parse the datetime-local value and adjust in local time
                            const [datePart, timePart] = startTime.split('T');
                            const [year, month, day] = datePart
                              .split('-')
                              .map(Number);
                            const [hours, minutes] = timePart
                              .split(':')
                              .map(Number);

                            const date = new Date(
                              year,
                              month - 1,
                              day,
                              hours,
                              minutes
                            );
                            date.setMinutes(date.getMinutes() - 5);

                            const newValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                            setStartTime(newValue);
                          }}
                          title='Move back 5 minutes'
                        >
                          ← 5m
                        </button>
                        <button
                          className='btn btn-small btn-outline release-details-time-adjust-button'
                          onClick={() => {
                            // Parse the datetime-local value and adjust in local time
                            const [datePart, timePart] = startTime.split('T');
                            const [year, month, day] = datePart
                              .split('-')
                              .map(Number);
                            const [hours, minutes] = timePart
                              .split(':')
                              .map(Number);

                            const date = new Date(
                              year,
                              month - 1,
                              day,
                              hours,
                              minutes
                            );
                            date.setMinutes(date.getMinutes() + 5);

                            const newValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                            setStartTime(newValue);
                          }}
                          title='Move forward 5 minutes'
                        >
                          5m →
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className='release-details-auto-timing-buttons'>
                  <button
                    className='btn btn-small btn-secondary'
                    onClick={handleAutoTiming}
                    disabled={selectedTracks.size === 0}
                    title={
                      selectedTracks.size === 0
                        ? 'Select tracks first'
                        : 'Set timing so tracks end at current time'
                    }
                  >
                    Auto Timing (Just Finished)
                  </button>
                  {startTime && (
                    <button
                      className='btn btn-small btn-outline'
                      onClick={() => setStartTime('')}
                      title='Clear custom timing'
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {startTime && (
                <div className='release-details-timing-display'>
                  Tracks will be scrobbled starting from:{' '}
                  {formatLocalTimeClean(new Date(startTime))}
                </div>
              )}
              {!startTime && selectedTracks.size > 0 && (
                <div className='release-details-timing-display'>
                  Tracks will be scrobbled with realistic timing (as if you just
                  finished listening)
                </div>
              )}
              {startTime && selectedTracks.size > 0 && (
                <div className='release-details-timing-success'>
                  Auto timing: Tracks will end at current time (as if you just
                  finished listening)
                </div>
              )}
            </div>
          )}

          {!authStatus.lastfm.authenticated && (
            <div className='warning-message release-details-message-margin'>
              Please authenticate with Last.fm to scrobble tracks.
              <button
                className='btn btn-small release-details-button-margin-left'
                onClick={() =>
                  (window.location.hash = '#settings?tab=connections')
                }
              >
                Connect Last.fm
              </button>
            </div>
          )}

          {authStatus.lastfm.authenticated && (
            <div className='release-details-tracks-section'>
              <button
                className='btn btn-small btn-secondary release-details-button-margin-right'
                onClick={testLastfmConnection}
              >
                Test Last.fm Connection
              </button>
              <button
                className='btn btn-small btn-secondary release-details-button-margin-right'
                onClick={getSessionKey}
              >
                Get Session Key
              </button>
              {connectionTest && (
                <div
                  className={`message ${connectionTest.success ? 'success' : 'warning'}`}
                >
                  {connectionTest.message}
                </div>
              )}
              {sessionKey && (
                <div className='message info release-details-session-key'>
                  <strong>Session Key:</strong> {sessionKey}
                  <br />
                  <small>Use this in the debug script to test scrobbling</small>
                </div>
              )}
            </div>
          )}
        </div>

        <div className='release-details-tracklist'>
          {release.tracklist?.map((track, index) => {
            const isSectionHeader =
              !track.position || track.position.trim() === '';

            if (isSectionHeader) {
              // Render section header as non-selectable informational item
              return (
                <div key={index} className='release-details-section-header'>
                  <div className='release-details-section-header-text'>
                    {track.title}
                  </div>
                </div>
              );
            }

            // Render actual track as selectable item
            const trackStats = getTrackStats(track.title);

            return (
              <div
                key={index}
                className='release-details-track-item'
                style={{
                  borderBottom:
                    index < (release.tracklist?.length || 0) - 1
                      ? '1px solid var(--border-color)'
                      : 'none',
                  backgroundColor: selectedTracks.has(index)
                    ? 'var(--bg-tertiary)'
                    : 'var(--bg-secondary)',
                }}
                onClick={() => handleTrackToggle(index)}
              >
                <input
                  type='checkbox'
                  checked={selectedTracks.has(index)}
                  onChange={() => handleTrackToggle(index)}
                  className='release-details-track-checkbox'
                />

                <div className='release-details-track-content'>
                  <div className='release-details-track-title'>
                    {track.position} {track.title}
                  </div>
                  {track.artist && track.artist !== release.artist && (
                    <div className='release-details-track-artist'>
                      {track.artist}
                    </div>
                  )}
                  {track.duration && (
                    <div className='release-details-track-duration'>
                      {track.duration}
                    </div>
                  )}
                </div>

                {/* Spotify play button */}
                <button
                  className='btn btn-small btn-icon release-details-spotify-button-margin'
                  onClick={e => {
                    e.stopPropagation();
                    playTrackOnSpotify(
                      track.artist || release.artist,
                      track.title,
                      release.title
                    );
                  }}
                  title='Play on Spotify'
                >
                  ▶️
                </button>

                {/* Track scrobble stats */}
                {trackStats && trackStats.count > 0 && (
                  <div className='release-details-track-stats'>
                    <span className='release-details-play-count'>
                      {trackStats.count}{' '}
                      {trackStats.count === 1 ? 'play' : 'plays'}
                    </span>
                    {trackStats.lastPlayed && (
                      <span
                        className='release-details-last-played'
                        title={formatLocalTimeClean(
                          trackStats.lastPlayed * 1000
                        )}
                      >
                        {formatRelativeTime(trackStats.lastPlayed)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add to Discard Pile Modal */}
      {discardModalOpen && release && (
        <div className='modal-overlay' onClick={handleCloseDiscardModal}>
          <div className='modal' onClick={e => e.stopPropagation()}>
            <div className='modal-header'>
              <h3>Add to Discard Pile</h3>
              <button
                className='modal-close'
                onClick={handleCloseDiscardModal}
                aria-label='Close'
              >
                ×
              </button>
            </div>
            <div className='modal-body'>
              <div className='discard-modal-item-info'>
                <strong>{release.artist}</strong>
                <span> - </span>
                <span>{release.title}</span>
                {release.year && (
                  <span className='text-muted'> ({release.year})</span>
                )}
              </div>

              {/* Marketplace Price Stats */}
              <div className='marketplace-stats-info'>
                {loadingMarketplaceStats ? (
                  <div className='marketplace-stats-loading'>
                    Loading marketplace prices...
                  </div>
                ) : marketplaceStats ? (
                  <div className='marketplace-stats-content'>
                    <div className='marketplace-stats-prices'>
                      <span className='marketplace-stats-label'>
                        Discogs Marketplace:
                      </span>
                      {marketplaceStats.lowestPrice !== undefined ? (
                        <>
                          <span className='marketplace-stats-range'>
                            {marketplaceStats.highestPrice !== undefined &&
                            marketplaceStats.highestPrice !==
                              marketplaceStats.lowestPrice ? (
                              <>
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: marketplaceStats.currency || 'USD',
                                }).format(marketplaceStats.lowestPrice)}
                                {' - '}
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: marketplaceStats.currency || 'USD',
                                }).format(marketplaceStats.highestPrice)}
                              </>
                            ) : (
                              <>
                                from{' '}
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: marketplaceStats.currency || 'USD',
                                }).format(marketplaceStats.lowestPrice)}
                              </>
                            )}
                          </span>
                          <span className='marketplace-stats-count'>
                            ({marketplaceStats.numForSale} for sale)
                          </span>
                        </>
                      ) : (
                        <span className='marketplace-stats-none'>
                          No listings
                        </span>
                      )}
                    </div>
                    {marketplaceStats.priceSuggestions ? (
                      <div className='marketplace-stats-suggestions'>
                        <span className='marketplace-stats-suggestion-label'>
                          Suggested prices by condition:
                        </span>
                        <div className='marketplace-stats-condition-list'>
                          {marketplaceStats.priceSuggestions.nearMint && (
                            <span className='condition-price'>
                              NM:{' '}
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency:
                                  marketplaceStats.priceSuggestions.nearMint
                                    .currency || 'USD',
                              }).format(
                                marketplaceStats.priceSuggestions.nearMint.value
                              )}
                            </span>
                          )}
                          {marketplaceStats.priceSuggestions.veryGoodPlus && (
                            <span className='condition-price'>
                              VG+:{' '}
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency:
                                  marketplaceStats.priceSuggestions.veryGoodPlus
                                    .currency || 'USD',
                              }).format(
                                marketplaceStats.priceSuggestions.veryGoodPlus
                                  .value
                              )}
                            </span>
                          )}
                          {marketplaceStats.priceSuggestions.veryGood && (
                            <span className='condition-price'>
                              VG:{' '}
                              {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency:
                                  marketplaceStats.priceSuggestions.veryGood
                                    .currency || 'USD',
                              }).format(
                                marketplaceStats.priceSuggestions.veryGood.value
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      marketplaceStats.lowestPrice !== undefined && (
                        <div className='marketplace-stats-suggestions'>
                          <span className='marketplace-stats-no-suggestions'>
                            Seller profile required for price suggestions
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className='marketplace-stats-unavailable'>
                    Marketplace data unavailable
                  </div>
                )}
              </div>

              <div className='form-group'>
                <label htmlFor='discard-reason'>Reason for discarding</label>
                <select
                  id='discard-reason'
                  className='form-select'
                  value={discardReason}
                  onChange={e =>
                    setDiscardReason(e.target.value as DiscardReason)
                  }
                >
                  <option value='selling'>Selling</option>
                  <option value='duplicate'>Duplicate</option>
                  <option value='damaged'>Damaged</option>
                  <option value='upgrade'>Upgrading to better pressing</option>
                  <option value='not_listening'>Not listening anymore</option>
                  <option value='gift'>Gifting to someone</option>
                  <option value='other'>Other</option>
                </select>
              </div>

              {discardReason === 'other' && (
                <div className='form-group'>
                  <label htmlFor='discard-reason-note'>Specify reason</label>
                  <input
                    type='text'
                    id='discard-reason-note'
                    className='form-input'
                    value={discardReasonNote}
                    onChange={e => setDiscardReasonNote(e.target.value)}
                    placeholder='Enter your reason...'
                  />
                </div>
              )}

              <div className='form-group'>
                <label htmlFor='discard-value'>Estimated value (USD)</label>
                <input
                  type='number'
                  id='discard-value'
                  className='form-input'
                  value={discardEstimatedValue}
                  onChange={e => setDiscardEstimatedValue(e.target.value)}
                  placeholder='0.00'
                  min='0'
                  step='0.01'
                />
              </div>

              <div className='form-group'>
                <label htmlFor='discard-notes'>Notes (optional)</label>
                <textarea
                  id='discard-notes'
                  className='form-textarea'
                  value={discardNotes}
                  onChange={e => setDiscardNotes(e.target.value)}
                  placeholder='Condition, pressing details, etc.'
                  rows={3}
                />
              </div>
            </div>
            <div className='modal-footer'>
              <button
                className='btn btn-secondary'
                onClick={handleCloseDiscardModal}
                disabled={addingToDiscard}
              >
                Cancel
              </button>
              <button
                className='btn btn-primary'
                onClick={handleAddToDiscardPile}
                disabled={addingToDiscard}
              >
                {addingToDiscard ? 'Adding...' : 'Add to Discard Pile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReleaseDetailsPage;
