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
  const [connectionTest, setConnectionTest] = useState<any>(null);
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
            className='btn btn-small'
            onClick={() => (window.location.hash = '#collection')}
            style={{ marginLeft: '1rem' }}
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
            className='btn btn-small'
            onClick={() => (window.location.hash = '#collection')}
            style={{ marginLeft: '1rem' }}
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h2>Release Details</h2>
          <button
            className='btn btn-small btn-secondary'
            onClick={() => (window.location.hash = '#collection')}
          >
            Back to Collection
          </button>
        </div>

        <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
          <div style={{ flexShrink: 0 }}>
            <img
              src={release.cover_image}
              alt={release.title}
              style={{
                width: '200px',
                height: '200px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            />
          </div>

          <div style={{ flex: 1 }}>
            <h3
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.5rem',
                color: 'var(--text-primary)',
              }}
            >
              {release.title}
            </h3>
            <p
              style={{
                margin: '0 0 0.5rem 0',
                fontSize: '1.1rem',
                color: 'var(--text-secondary)',
              }}
            >
              {release.artist}
              {artistMapping && artistMapping.hasMapping && (
                <span
                  style={{
                    marginLeft: '0.75rem',
                    fontSize: '0.9rem',
                    padding: '0.2rem 0.5rem',
                    backgroundColor: 'var(--accent-color)',
                    color: 'white',
                    borderRadius: '12px',
                    fontWeight: '500',
                  }}
                  title={`This artist will be scrobbled as "${artistMapping.lastfmName}" on Last.fm`}
                >
                  → {artistMapping.lastfmName}
                </span>
              )}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)' }}>
              {release.year} • {release.format.join(', ')}
            </p>
            {release.label && release.label.length > 0 && (
              <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)' }}>
                {release.label.join(', ')}
              </p>
            )}
            {release.catalog_number && (
              <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-muted)' }}>
                Catalog: {release.catalog_number}
              </p>
            )}

            {/* Play on Spotify button */}
            <div style={{ marginTop: '1rem' }}>
              <button
                className='btn btn-small btn-icon'
                onClick={() =>
                  playAlbumOnSpotify(release.artist, release.title)
                }
                title='Play on Spotify'
                style={{ marginRight: '0.5rem' }}
              >
                ▶️ Play on Spotify
              </button>
            </div>

            {/* Discard pile button */}
            {collectionItemId && (
              <div style={{ marginTop: '1rem' }}>
                {isInDiscardPile ? (
                  <span
                    className='discard-pile-indicator'
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.9rem',
                      color: 'var(--accent-warning, #f59e0b)',
                      padding: '0.4rem 0.75rem',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: '6px',
                    }}
                  >
                    📦 In Discard Pile
                  </span>
                ) : (
                  <button
                    className='btn btn-small btn-outline-warning'
                    onClick={handleOpenDiscardModal}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
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
          <div className='message success' style={{ marginBottom: '1rem' }}>
            {discardSuccess}
          </div>
        )}

        {/* Scrobble History Section */}
        <AlbumScrobbleHistory artist={release.artist} album={release.title} />

        {scrobbleProgress && (
          <div className='message info' style={{ marginBottom: '1rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <strong>Scrobbling Progress:</strong>
              <span>
                {scrobbleProgress.current} / {scrobbleProgress.total}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: 'var(--border-color)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '0.5rem',
              }}
            >
              <div
                style={{
                  width: `${(scrobbleProgress.current / scrobbleProgress.total) * 100}%`,
                  height: '100%',
                  backgroundColor: 'var(--accent-color)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              ✅ {scrobbleProgress.success} successful • ⚠️{' '}
              {scrobbleProgress.ignored} ignored • ❌ {scrobbleProgress.failed}{' '}
              failed
            </div>
          </div>
        )}

        {scrobbleResult && (
          <div
            className={`message ${scrobbleResult.failed === 0 && scrobbleResult.ignored === 0 ? 'success' : scrobbleResult.failed > 0 ? 'error' : 'warning'}`}
            style={{ marginBottom: '1rem' }}
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
              <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                <strong>Details:</strong>
                <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem' }}>
                  {scrobbleResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {scrobbleResult.ignored > 0 && (
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.9rem',
                  color: 'var(--warning-color)',
                }}
              >
                <strong>Note:</strong> Ignored scrobbles usually mean the track
                was scrobbled too recently or is a duplicate.
              </div>
            )}

            {getLastfmProfileUrl() && (
              <div style={{ marginTop: '0.5rem' }}>
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

        <div style={{ marginBottom: '1rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>
              Tracks ({selectedTracks.size} selected)
            </h4>
            <div
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
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
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '1rem',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <h5
                    style={{
                      margin: '0 0 0.75rem 0',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Select by Side
                  </h5>

                  {/* Disc-level buttons for multi-disc albums */}
                  {Object.keys(discs).length > 1 && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: 'var(--text-secondary)',
                          marginBottom: '0.5rem',
                        }}
                      >
                        By Disc:
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
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
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '0.5rem',
                      }}
                    >
                      By Side:
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
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
            <div
              style={{
                marginBottom: '1rem',
                padding: '1rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
              }}
            >
              <h5
                style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}
              >
                Scrobble Timing
              </h5>
              <p
                style={{
                  margin: '0 0 0.5rem 0',
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                }}
              >
                Set when you started listening to the first track, or leave
                empty to use realistic timing.
              </p>
              <div
                style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}
              >
                <div className='form-group' style={{ margin: 0, flex: 1 }}>
                  <label
                    htmlFor='start-time-input'
                    className='form-label'
                    style={{ fontSize: '0.9rem' }}
                  >
                    Start Time:
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      id='start-time-input'
                      type='datetime-local'
                      className='form-input'
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      style={{ fontSize: '0.9rem', flex: 1 }}
                    />
                    {startTime && (
                      <>
                        <button
                          className='btn btn-small btn-outline'
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
                          style={{ padding: '0.5rem 0.75rem' }}
                        >
                          ← 5m
                        </button>
                        <button
                          className='btn btn-small btn-outline'
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
                          style={{ padding: '0.5rem 0.75rem' }}
                        >
                          5m →
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    marginTop: '1.5rem',
                  }}
                >
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
                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Tracks will be scrobbled starting from:{' '}
                  {formatLocalTimeClean(new Date(startTime))}
                </div>
              )}
              {!startTime && selectedTracks.size > 0 && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  Tracks will be scrobbled with realistic timing (as if you just
                  finished listening)
                </div>
              )}
              {startTime && selectedTracks.size > 0 && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    fontSize: '0.8rem',
                    color: 'var(--success-color)',
                  }}
                >
                  Auto timing: Tracks will end at current time (as if you just
                  finished listening)
                </div>
              )}
            </div>
          )}

          {!authStatus.lastfm.authenticated && (
            <div className='warning-message' style={{ marginBottom: '1rem' }}>
              Please authenticate with Last.fm to scrobble tracks.
              <button
                className='btn btn-small'
                onClick={() =>
                  (window.location.hash = '#settings?tab=connections')
                }
                style={{ marginLeft: '1rem' }}
              >
                Connect Last.fm
              </button>
            </div>
          )}

          {authStatus.lastfm.authenticated && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                className='btn btn-small btn-secondary'
                onClick={testLastfmConnection}
                style={{ marginRight: '0.5rem' }}
              >
                Test Last.fm Connection
              </button>
              <button
                className='btn btn-small btn-secondary'
                onClick={getSessionKey}
                style={{ marginRight: '0.5rem' }}
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
                <div
                  className='message info'
                  style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}
                >
                  <strong>Session Key:</strong> {sessionKey}
                  <br />
                  <small>Use this in the debug script to test scrobbling</small>
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
          }}
        >
          {release.tracklist?.map((track, index) => {
            const isSectionHeader =
              !track.position || track.position.trim() === '';

            if (isSectionHeader) {
              // Render section header as non-selectable informational item
              return (
                <div
                  key={index}
                  style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    borderLeft: '4px solid var(--accent-color)',
                  }}
                >
                  <div
                    style={{
                      fontWeight: '600',
                      color: 'var(--accent-color)',
                      fontSize: '0.9rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.75rem',
                  borderBottom:
                    index < (release.tracklist?.length || 0) - 1
                      ? '1px solid var(--border-color)'
                      : 'none',
                  backgroundColor: selectedTracks.has(index)
                    ? 'var(--bg-tertiary)'
                    : 'var(--bg-secondary)',
                  cursor: 'pointer',
                }}
                onClick={() => handleTrackToggle(index)}
              >
                <input
                  type='checkbox'
                  checked={selectedTracks.has(index)}
                  onChange={() => handleTrackToggle(index)}
                  style={{ marginRight: '1rem' }}
                />

                <div style={{ flex: 1 }}>
                  <div
                    style={{ fontWeight: '500', color: 'var(--text-primary)' }}
                  >
                    {track.position} {track.title}
                  </div>
                  {track.artist && track.artist !== release.artist && (
                    <div
                      style={{
                        fontSize: '0.9rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {track.artist}
                    </div>
                  )}
                  {track.duration && (
                    <div
                      style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}
                    >
                      {track.duration}
                    </div>
                  )}
                </div>

                {/* Spotify play button */}
                <button
                  className='btn btn-small btn-icon'
                  onClick={e => {
                    e.stopPropagation();
                    playTrackOnSpotify(
                      track.artist || release.artist,
                      track.title,
                      release.title
                    );
                  }}
                  title='Play on Spotify'
                  style={{ marginLeft: '0.5rem' }}
                >
                  ▶️
                </button>

                {/* Track scrobble stats */}
                {trackStats && trackStats.count > 0 && (
                  <div
                    className='track-scrobble-stats'
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      marginLeft: '1rem',
                      minWidth: '80px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        color: 'var(--accent-color)',
                      }}
                    >
                      {trackStats.count}{' '}
                      {trackStats.count === 1 ? 'play' : 'plays'}
                    </span>
                    {trackStats.lastPlayed && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}
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
