import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import './MemoryScrobblePage.page.css';

import {
  MemoryScrobbleTrack,
  SavedCollectionTrack,
  ScrobbleTrack,
  TrackSearchResult,
} from '../../shared/types';
import { SavedCollectionManager } from '../components/memory-scrobble/SavedCollectionManager';
import { SessionTimelineBar } from '../components/memory-scrobble/SessionTimelineBar';
import { TrackTypeahead } from '../components/memory-scrobble/TrackTypeahead';
import { Button, IconButton } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const log = createLogger('MemoryScrobblePage');

function formatTrackTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')}${ampm}`;
}

function formatDurationDisplay(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toDatetimeLocalValue(ms: number): string {
  const date = new Date(ms);
  const offset = date.getTimezoneOffset();
  const local = new Date(ms - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDatetimeLocalValue(value: string): number {
  return new Date(value).getTime();
}

const MemoryScrobblePage: React.FC = () => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  // Session time state
  const [sessionStart, setSessionStart] = useState<number>(
    () => Date.now() - 3600000
  );
  const [sessionEnd, setSessionEnd] = useState<number>(() => Date.now());

  // Track list state
  const [tracks, setTracks] = useState<MemoryScrobbleTrack[]>([]);
  const [pendingDurations, setPendingDurations] = useState<Set<number>>(
    new Set()
  );

  // Collection manager state
  const [showCollectionManager, setShowCollectionManager] = useState(false);
  const [collectionManagerMode, setCollectionManagerMode] = useState<
    'manage' | 'picker'
  >('manage');

  // Review/scrobble state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [preparedTracks, setPreparedTracks] = useState<ScrobbleTrack[] | null>(
    null
  );
  const [overflows, setOverflows] = useState(false);
  const [scrobbleResult, setScrobbleResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);
  const [isScrobbling, setIsScrobbling] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionDurationSeconds = useMemo(
    () => Math.max(0, Math.floor((sessionEnd - sessionStart) / 1000)),
    [sessionStart, sessionEnd]
  );

  const totalTrackDuration = useMemo(
    () => tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0),
    [tracks]
  );

  const sessionValid = sessionEnd > sessionStart;

  // Calculate timestamps for each track sequentially from sessionStart
  const trackTimestamps = useMemo(() => {
    const timestamps: number[] = [];
    let currentMs = sessionStart;
    for (const track of tracks) {
      timestamps.push(currentMs);
      currentMs += (track.duration ?? 0) * 1000 + 1000; // duration + 1s gap
    }
    return timestamps;
  }, [tracks, sessionStart]);

  const getNextOrder = useCallback(() => {
    if (tracks.length === 0) return 1;
    return Math.max(...tracks.map(t => t.order)) + 1;
  }, [tracks]);

  const lookupDuration = useCallback(
    async (order: number, artist: string, track: string, album?: string) => {
      setPendingDurations(prev => new Set(prev).add(order));
      try {
        const response = await api.lookupMemoryScrobbleDuration(
          artist,
          track,
          album
        );
        if (response.success && response.data?.duration) {
          setTracks(prev =>
            prev.map(t =>
              t.order === order
                ? { ...t, duration: response.data!.duration! }
                : t
            )
          );
        }
      } catch (err) {
        log.error('Duration lookup failed', err);
      } finally {
        setPendingDurations(prev => {
          const next = new Set(prev);
          next.delete(order);
          return next;
        });
      }
    },
    [api]
  );

  const handleSearchFn = useCallback(
    async (query: string): Promise<TrackSearchResult[]> => {
      const response = await api.searchMemoryScrobbleTracks(query);
      return response.success && response.data ? response.data : [];
    },
    [api]
  );

  const handleTrackSelect = useCallback(
    (result: TrackSearchResult) => {
      const order = getNextOrder();
      const newTrack: MemoryScrobbleTrack = {
        artist: result.artist,
        track: result.track,
        album: result.album,
        duration: result.duration ?? 0,
        source: result.source === 'history' ? 'history' : 'collection',
        sourceCollectionId: result.sourceCollectionId,
        order,
      };
      setTracks(prev => [...prev, newTrack]);
      setScrobbleResult(null);
      setError(null);

      if (!result.duration) {
        lookupDuration(order, result.artist, result.track, result.album);
      }
    },
    [getNextOrder, lookupDuration]
  );

  const handleFreeformSubmit = useCallback(
    (artist: string, track: string, album?: string) => {
      const order = getNextOrder();
      const newTrack: MemoryScrobbleTrack = {
        artist,
        track,
        album,
        duration: 0,
        source: 'freeform',
        order,
      };
      setTracks(prev => [...prev, newTrack]);
      setScrobbleResult(null);
      setError(null);
      lookupDuration(order, artist, track, album);
    },
    [getNextOrder, lookupDuration]
  );

  const handleLoadFromCollection = useCallback(
    (collectionTracks: SavedCollectionTrack[]) => {
      let nextOrder = getNextOrder();
      const newTracks: MemoryScrobbleTrack[] = collectionTracks.map(ct => ({
        artist: ct.artist,
        track: ct.track,
        album: ct.album,
        duration: ct.duration,
        source: 'collection' as const,
        order: nextOrder++,
      }));
      setTracks(prev => [...prev, ...newTracks]);
      setScrobbleResult(null);
      setError(null);

      // Lookup durations for tracks missing them
      for (const t of newTracks) {
        if (!t.duration) {
          lookupDuration(t.order, t.artist, t.track, t.album);
        }
      }
    },
    [getNextOrder, lookupDuration]
  );

  const handleRemoveTrack = useCallback((order: number) => {
    setTracks(prev => prev.filter(t => t.order !== order));
  }, []);

  const handleMoveTrack = useCallback(
    (index: number, direction: 'up' | 'down') => {
      setTracks(prev => {
        const next = [...prev];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= next.length) return prev;
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        return next;
      });
    },
    []
  );

  // Inline clear confirmation
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleClearAll = useCallback(() => {
    if (tracks.length === 0) return;
    setShowClearConfirm(true);
  }, [tracks.length]);

  const confirmClearAll = useCallback(() => {
    setTracks([]);
    setPreparedTracks(null);
    setScrobbleResult(null);
    setError(null);
    setShowClearConfirm(false);
  }, []);

  const cancelClearAll = useCallback(() => {
    setShowClearConfirm(false);
  }, []);

  const handleReviewScrobble = useCallback(async () => {
    if (tracks.length === 0) return;
    if (!sessionValid) {
      setError('Session start must be before session end.');
      return;
    }

    setIsPreparing(true);
    setError(null);
    try {
      const response = await api.prepareMemoryScrobble(
        sessionStart,
        sessionEnd,
        tracks.map(t => ({
          artist: t.artist,
          track: t.track,
          album: t.album,
          duration: t.duration,
          source: t.source,
        }))
      );
      if (response.success && response.data) {
        setPreparedTracks(response.data.tracks);
        setOverflows(response.data.overflows);
        setShowReviewModal(true);
      } else {
        setError(response.error ?? 'Failed to prepare scrobble.');
      }
    } catch (err) {
      log.error('Prepare failed', err);
      setError('Failed to prepare scrobble. Please try again.');
    } finally {
      setIsPreparing(false);
    }
  }, [tracks, sessionStart, sessionEnd, sessionValid, api]);

  const handleConfirmScrobble = useCallback(async () => {
    if (!preparedTracks || preparedTracks.length === 0) return;

    setIsScrobbling(true);
    setError(null);
    try {
      const result = await api.scrobbleBatch(preparedTracks);
      setScrobbleResult({
        success: result.success,
        failed: result.failed,
      });
      setShowReviewModal(false);

      if (result.failed > 0 && result.failedTracks?.length > 0) {
        // Keep only the failed tracks in the list for retry
        let nextOrder = 1;
        const failedAsMemoryTracks: MemoryScrobbleTrack[] =
          result.failedTracks.map(ft => ({
            artist: ft.artist,
            track: ft.track,
            album: ft.album,
            duration: ft.duration ?? 0,
            timestamp: ft.timestamp,
            source: 'history' as const,
            order: nextOrder++,
          }));
        setTracks(failedAsMemoryTracks);
        setPreparedTracks(null);
      } else if (result.success > 0) {
        setTracks([]);
        setPreparedTracks(null);
        setSessionStart(Date.now() - 3600000);
        setSessionEnd(Date.now());
      }
    } catch (err) {
      log.error('Scrobble failed', err);
      setError('Scrobbling failed. Please try again.');
    } finally {
      setIsScrobbling(false);
    }
  }, [preparedTracks, api]);

  // Collection manager API callbacks
  const fetchCollections = useCallback(async () => {
    const resp = await api.getMemoryScrobbleCollections();
    return resp.success && resp.data ? resp.data : [];
  }, [api]);

  const createCollection = useCallback(
    async (name: string, description?: string) => {
      const resp = await api.createMemoryScrobbleCollection(name, description);
      if (!resp.success || !resp.data)
        throw new Error(resp.error ?? 'Failed to create');
      return resp.data;
    },
    [api]
  );

  const updateCollection = useCallback(
    async (id: string, name: string, description?: string) => {
      const resp = await api.updateMemoryScrobbleCollection(
        id,
        name,
        description
      );
      if (!resp.success) throw new Error(resp.error ?? 'Failed to update');
    },
    [api]
  );

  const deleteCollection = useCallback(
    async (id: string) => {
      const resp = await api.deleteMemoryScrobbleCollection(id);
      if (!resp.success) throw new Error(resp.error ?? 'Failed to delete');
    },
    [api]
  );

  const importCsv = useCallback(
    async (id: string, csvContent: string) => {
      const resp = await api.importMemoryScrobbleCollectionCsv(id, csvContent);
      if (!resp.success || !resp.data)
        throw new Error(resp.error ?? 'Import failed');
      return resp.data;
    },
    [api]
  );

  const addTrack = useCallback(
    async (
      id: string,
      track: {
        artist: string;
        track: string;
        album?: string;
        duration?: number;
      }
    ) => {
      const resp = await api.addMemoryScrobbleCollectionTrack(id, track);
      if (!resp.success) throw new Error(resp.error ?? 'Failed to add track');
    },
    [api]
  );

  const removeCollectionTrack = useCallback(
    async (id: string, position: number) => {
      const resp = await api.removeMemoryScrobbleCollectionTrack(id, position);
      if (!resp.success)
        throw new Error(resp.error ?? 'Failed to remove track');
    },
    [api]
  );

  const replaceCollectionTrack = useCallback(
    async (
      id: string,
      position: number,
      track: {
        artist: string;
        track: string;
        album?: string;
        duration?: number;
        lastfmMatch?: boolean;
      }
    ) => {
      const resp = await api.replaceMemoryScrobbleCollectionTrack(
        id,
        position,
        track
      );
      if (!resp.success)
        throw new Error(resp.error ?? 'Failed to replace track');
    },
    [api]
  );

  return (
    <div className='memory-scrobble-page'>
      {/* Header */}
      <div className='memory-scrobble-header'>
        <h2>Memory Scrobble</h2>
        <p className='memory-scrobble-description'>
          Scrobble tracks from offline listening sessions. Load tracks from a
          saved collection or search your history, set the time window, and
          scrobble them with accurate timestamps.
        </p>
        <Button
          variant='outline'
          size='small'
          iconLeft={<FolderOpen size={16} aria-hidden='true' />}
          onClick={() => {
            setCollectionManagerMode('manage');
            setShowCollectionManager(true);
          }}
        >
          Manage Collections
        </Button>
      </div>

      {/* Session time inputs */}
      <div className='card'>
        <div className='memory-scrobble-session'>
          <label>
            Start
            <input
              type='datetime-local'
              value={toDatetimeLocalValue(sessionStart)}
              onChange={e =>
                setSessionStart(fromDatetimeLocalValue(e.target.value))
              }
              aria-label='Session start time'
            />
          </label>
          <label>
            End
            <input
              type='datetime-local'
              value={toDatetimeLocalValue(sessionEnd)}
              onChange={e =>
                setSessionEnd(fromDatetimeLocalValue(e.target.value))
              }
              aria-label='Session end time'
            />
          </label>
          {!sessionValid && (
            <span className='memory-scrobble-session-error'>
              Start must be before end
            </span>
          )}
        </div>
      </div>

      {/* Timeline bar */}
      <SessionTimelineBar
        totalDuration={totalTrackDuration}
        sessionDuration={sessionDurationSeconds}
      />

      {/* Track input */}
      <div className='card'>
        <div className='memory-scrobble-add-section'>
          <TrackTypeahead
            onSelect={handleTrackSelect}
            onFreeformSubmit={handleFreeformSubmit}
            searchFn={handleSearchFn}
          />
          <Button
            variant='outline'
            size='small'
            iconLeft={<FolderOpen size={16} aria-hidden='true' />}
            onClick={() => {
              setCollectionManagerMode('picker');
              setShowCollectionManager(true);
            }}
            aria-label='Load tracks from a saved collection'
          >
            Load Collection
          </Button>
        </div>
      </div>

      {/* Track list */}
      {tracks.length > 0 ? (
        <div className='card'>
          <div className='memory-scrobble-track-count'>
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </div>
          <div className='memory-scrobble-track-header'>
            <span>#</span>
            <span>Time</span>
            <span>Artist</span>
            <span>Track</span>
            <span>Duration</span>
            <span />
          </div>
          <div className='memory-scrobble-track-list'>
            {tracks.map((track, idx) => (
              <div key={track.order} className='memory-scrobble-track-row'>
                <span className='memory-scrobble-track-num'>{idx + 1}</span>
                <span className='memory-scrobble-track-time'>
                  {formatTrackTime(trackTimestamps[idx])}
                </span>
                <span className='memory-scrobble-track-artist'>
                  {track.artist}
                </span>
                <span className='memory-scrobble-track-name'>
                  {track.track}
                </span>
                <span className='memory-scrobble-track-duration'>
                  {pendingDurations.has(track.order) ? (
                    <span
                      className='spinner'
                      aria-label='Loading duration...'
                    />
                  ) : track.duration ? (
                    formatDurationDisplay(track.duration)
                  ) : (
                    '\u2014'
                  )}
                </span>
                <span className='memory-scrobble-track-actions-cell'>
                  <IconButton
                    icon={<ChevronUp size={14} aria-hidden='true' />}
                    variant='ghost'
                    size='small'
                    aria-label={`Move ${track.artist} - ${track.track} up`}
                    onClick={() => handleMoveTrack(idx, 'up')}
                    disabled={idx === 0}
                  />
                  <IconButton
                    icon={<ChevronDown size={14} aria-hidden='true' />}
                    variant='ghost'
                    size='small'
                    aria-label={`Move ${track.artist} - ${track.track} down`}
                    onClick={() => handleMoveTrack(idx, 'down')}
                    disabled={idx === tracks.length - 1}
                  />
                  <IconButton
                    icon={<Trash2 size={14} aria-hidden='true' />}
                    variant='ghost'
                    size='small'
                    aria-label={`Remove ${track.artist} - ${track.track}`}
                    onClick={() => handleRemoveTrack(track.order)}
                  />
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className='memory-scrobble-actions'>
            {showClearConfirm ? (
              <div className='memory-scrobble-clear-confirm'>
                <span>Clear all tracks?</span>
                <Button variant='danger' size='small' onClick={confirmClearAll}>
                  Clear
                </Button>
                <Button variant='ghost' size='small' onClick={cancelClearAll}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant='ghost'
                size='small'
                onClick={handleClearAll}
                disabled={isScrobbling}
              >
                Clear All
              </Button>
            )}
            <div className='memory-scrobble-actions-right'>
              <Button
                variant='primary'
                iconLeft={<Send size={16} aria-hidden='true' />}
                onClick={handleReviewScrobble}
                disabled={
                  tracks.length === 0 ||
                  !sessionValid ||
                  isScrobbling ||
                  isPreparing
                }
                loading={isPreparing}
              >
                Review & Scrobble
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className='memory-scrobble-empty'>
          {scrobbleResult
            ? null
            : 'Search for tracks above to start building your scrobble list.'}
        </div>
      )}

      {/* Error display */}
      {error && <div className='error-message'>{error}</div>}

      {/* Scrobble result */}
      {scrobbleResult && (
        <div className='card memory-scrobble-result'>
          <div className='memory-scrobble-result-success'>
            <Check size={16} aria-hidden='true' />
            Successfully scrobbled: {scrobbleResult.success} tracks
          </div>
          {scrobbleResult.failed > 0 && (
            <div className='memory-scrobble-result-failed'>
              <XCircle size={16} aria-hidden='true' />
              Failed: {scrobbleResult.failed} tracks — they remain in the list
              below so you can retry.
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      <Modal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title='Review & Confirm Scrobble'
        size='large'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => setShowReviewModal(false)}
              disabled={isScrobbling}
            >
              Cancel
            </Button>
            <Button
              variant='primary'
              onClick={handleConfirmScrobble}
              disabled={isScrobbling}
              loading={isScrobbling}
            >
              {isScrobbling
                ? 'Scrobbling...'
                : `Scrobble ${preparedTracks?.length ?? 0} Tracks`}
            </Button>
          </>
        }
      >
        {error && (
          <div className='memory-scrobble-overflow-warning'>
            <AlertTriangle size={16} aria-hidden='true' />
            {error}
          </div>
        )}
        {overflows && (
          <div className='memory-scrobble-overflow-warning'>
            <AlertTriangle size={16} aria-hidden='true' />
            Total track duration exceeds the session window. Tracks may overlap
            or extend beyond the end time.
          </div>
        )}
        {preparedTracks && (
          <div className='memory-scrobble-review-list'>
            {preparedTracks.map((track, idx) => (
              <div key={idx} className='memory-scrobble-review-row'>
                <span className='memory-scrobble-review-num'>{idx + 1}</span>
                <span className='memory-scrobble-review-time'>
                  {track.timestamp
                    ? formatTrackTime(track.timestamp * 1000)
                    : '--'}
                </span>
                <span className='memory-scrobble-review-artist'>
                  {track.artist}
                </span>
                <span className='memory-scrobble-review-track'>
                  {track.track}
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Collection Manager */}
      <SavedCollectionManager
        isOpen={showCollectionManager}
        onClose={() => setShowCollectionManager(false)}
        mode={collectionManagerMode}
        onPickCollection={handleLoadFromCollection}
        fetchCollections={fetchCollections}
        createCollection={createCollection}
        updateCollection={updateCollection}
        deleteCollection={deleteCollection}
        importCsv={importCsv}
        addTrack={addTrack}
        removeTrack={removeCollectionTrack}
        searchFn={handleSearchFn}
        replaceTrack={replaceCollectionTrack}
      />
    </div>
  );
};

export default MemoryScrobblePage;
