import React, { useState, useEffect, useCallback, useMemo } from 'react';

import {
  BackfillAlbum,
  BackfillSuggestion,
  ListeningPatterns,
} from '../../../shared/types';
import { useApp } from '../../context/AppContext';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Button } from '../ui/Button';
import { Modal, ModalFooter, ModalSection } from '../ui/Modal';

const log = createLogger('BackfillDialog');

export interface BackfillDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when the dialog should close */
  onClose: () => void;
  /** Initial albums to include */
  initialAlbums?: BackfillAlbum[];
  /** Called after successful scrobble */
  onScrobbleComplete?: () => void;
}

function formatTimestamp(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}

function formatTimeOnly(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export const BackfillDialog: React.FC<BackfillDialogProps> = ({
  isOpen,
  onClose,
  initialAlbums = [],
  onScrobbleComplete,
}) => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  const [albums, setAlbums] = useState<BackfillAlbum[]>(initialAlbums);
  const [suggestions, setSuggestions] = useState<BackfillSuggestion[]>([]);
  const [patterns, setPatterns] = useState<ListeningPatterns | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(0);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [gapMinutes, setGapMinutes] = useState(15);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isScrobbling, setIsScrobbling] = useState(false);
  const [error, setError] = useState('');
  const [scrobbleResult, setScrobbleResult] = useState<{
    success: number;
    failed: number;
  } | null>(null);

  // Sync initialAlbums when dialog opens
  useEffect(() => {
    if (isOpen && initialAlbums.length > 0) {
      setAlbums(initialAlbums);
      setScrobbleResult(null);
      setError('');
    }
  }, [isOpen, initialAlbums]);

  // Load patterns on open
  useEffect(() => {
    if (!isOpen) return;
    const loadPatterns = async () => {
      try {
        const p = await api.getPatterns();
        setPatterns(p);
        if (p) {
          setGapMinutes(p.averageGapBetweenAlbumsMinutes);
        }
      } catch (err) {
        log.warn('Failed to load patterns', err);
      }
    };
    loadPatterns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch suggestions when albums change
  useEffect(() => {
    if (!isOpen || albums.length === 0) {
      setSuggestions([]);
      return;
    }
    const fetchSuggestions = async () => {
      setIsLoadingSuggestions(true);
      try {
        const result = await api.suggestBackfillTimestamps(albums);
        setSuggestions(result);
        setSelectedPreset(0);
      } catch (err) {
        log.error('Failed to fetch suggestions', err);
        setError('Failed to load timestamp suggestions');
      } finally {
        setIsLoadingSuggestions(false);
      }
    };
    fetchSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, albums]);

  const removeAlbum = useCallback((releaseId: number) => {
    setAlbums(prev => prev.filter(a => a.releaseId !== releaseId));
  }, []);

  const customTimestamps = useMemo(() => {
    if (selectedPreset !== 'custom' || !customDate || !customTime) return null;
    const startDate = new Date(`${customDate}T${customTime}`);
    if (isNaN(startDate.getTime())) return null;

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const results: {
      albumIndex: number;
      startTimestamp: number;
      endTimestamp: number;
    }[] = [];
    let currentTime = startTimestamp;

    for (let i = 0; i < albums.length; i++) {
      const album = albums[i];
      const albumStart = currentTime;
      const albumEnd = albumStart + album.durationSeconds;
      results.push({
        albumIndex: i,
        startTimestamp: albumStart,
        endTimestamp: albumEnd,
      });
      currentTime = albumEnd + gapMinutes * 60;
    }
    return results;
  }, [selectedPreset, customDate, customTime, albums, gapMinutes]);

  const activeTimestamps = useMemo(() => {
    if (selectedPreset === 'custom') {
      return customTimestamps;
    }
    if (suggestions.length > 0 && typeof selectedPreset === 'number') {
      return suggestions[selectedPreset]?.calculatedTimestamps ?? null;
    }
    return null;
  }, [selectedPreset, suggestions, customTimestamps]);

  const activeSuggestion = useMemo(() => {
    if (
      selectedPreset !== 'custom' &&
      typeof selectedPreset === 'number' &&
      suggestions[selectedPreset]
    ) {
      return suggestions[selectedPreset];
    }
    return null;
  }, [selectedPreset, suggestions]);

  const totalDuration = useMemo(() => {
    return albums.reduce((sum, a) => sum + a.durationSeconds, 0);
  }, [albums]);

  const handleScrobbleAll = useCallback(async () => {
    if (!activeTimestamps || activeTimestamps.length === 0) return;

    // Warn if outside Last.fm window
    if (activeSuggestion?.isOutsideLastFmWindow) {
      const confirmed = window.confirm(
        "These scrobbles are outside Last.fm's 2-week window and will be rejected. Continue anyway?"
      );
      if (!confirmed) return;
    }

    setIsScrobbling(true);
    setError('');
    setScrobbleResult(null);

    try {
      let totalSuccess = 0;
      let totalFailed = 0;

      for (const ts of activeTimestamps) {
        const album = albums[ts.albumIndex];
        if (!album) continue;

        // Get release details for track list
        const releaseDetails = await api.getReleaseDetails(album.releaseId);
        if (
          !releaseDetails.tracklist ||
          releaseDetails.tracklist.length === 0
        ) {
          log.warn(`No tracks found for ${album.album}`);
          totalFailed++;
          continue;
        }

        const tracks = releaseDetails.tracklist
          .filter(t => t.type_ !== 'heading')
          .map((t, i, arr) => {
            const trackDuration = album.durationSeconds / arr.length;
            return {
              artist: t.artist || releaseDetails.artist,
              track: t.title,
              album: releaseDetails.title,
              timestamp: ts.startTimestamp + Math.floor(trackDuration * i),
              duration: t.duration
                ? parseInt(t.duration.replace(':', ''))
                : undefined,
            };
          });

        const result = await api.scrobbleBatch(tracks, undefined, {
          releaseId: album.releaseId,
          artist: album.artist,
          album: album.album,
        });

        totalSuccess += result.success;
        totalFailed += result.failed;
      }

      setScrobbleResult({ success: totalSuccess, failed: totalFailed });

      if (totalSuccess > 0) {
        log.info(
          `Backfill complete: ${totalSuccess} tracks scrobbled, ${totalFailed} failed`
        );
        onScrobbleComplete?.();
      }
    } catch (err) {
      log.error('Backfill scrobble failed', err);
      setError(err instanceof Error ? err.message : 'Scrobbling failed');
    } finally {
      setIsScrobbling(false);
    }
  }, [activeTimestamps, activeSuggestion, albums, api, onScrobbleComplete]);

  const handleClose = useCallback(() => {
    if (!isScrobbling) {
      onClose();
    }
  }, [isScrobbling, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title='Backfill Listening Session'
      size='large'
      loading={isScrobbling}
      closeOnOverlayClick={!isScrobbling}
    >
      {/* Albums list */}
      <ModalSection title={`Albums to scrobble (${albums.length})`}>
        {albums.length === 0 ? (
          <p className='backfill-empty-message'>No albums selected.</p>
        ) : (
          <div className='backfill-album-list'>
            {albums.map(album => (
              <div key={album.releaseId} className='backfill-album-item'>
                <div className='backfill-album-info'>
                  {album.coverUrl && (
                    <img
                      src={album.coverUrl}
                      alt={`${album.album} cover`}
                      className='backfill-album-cover'
                    />
                  )}
                  <div className='backfill-album-details'>
                    <span className='backfill-album-title'>
                      {album.artist} - {album.album}
                    </span>
                    <span className='backfill-album-meta'>
                      {album.trackCount} tracks &middot;{' '}
                      {formatDuration(album.durationSeconds)}
                    </span>
                  </div>
                </div>
                <button
                  type='button'
                  className='backfill-album-remove'
                  onClick={() => removeAlbum(album.releaseId)}
                  disabled={isScrobbling}
                  aria-label={`Remove ${album.album}`}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
        {albums.length > 0 && (
          <div className='backfill-total-duration'>
            Total: {formatDuration(totalDuration)}
          </div>
        )}
      </ModalSection>

      {/* Time selection */}
      {albums.length > 0 && (
        <ModalSection title='When did you listen?'>
          {isLoadingSuggestions ? (
            <p className='backfill-loading'>Loading suggestions...</p>
          ) : (
            <>
              <div className='backfill-presets'>
                {suggestions.map((suggestion, index) => (
                  <label
                    key={index}
                    className={`backfill-preset-option ${
                      selectedPreset === index
                        ? 'backfill-preset-option--selected'
                        : ''
                    } ${
                      suggestion.isOutsideLastFmWindow
                        ? 'backfill-preset-option--disabled'
                        : ''
                    }`}
                  >
                    <input
                      type='radio'
                      name='backfill-preset'
                      value={index}
                      checked={selectedPreset === index}
                      onChange={() => setSelectedPreset(index)}
                      disabled={isScrobbling}
                    />
                    <div className='backfill-preset-content'>
                      <span className='backfill-preset-label'>
                        {suggestion.presetLabel}
                      </span>
                      <span className='backfill-preset-description'>
                        {suggestion.presetDescription}
                      </span>
                    </div>
                    {suggestion.hasConflicts && (
                      <span className='backfill-conflict-badge'>Conflicts</span>
                    )}
                    {suggestion.isOutsideLastFmWindow && (
                      <span className='backfill-window-badge'>
                        Outside window
                      </span>
                    )}
                  </label>
                ))}
                <label
                  className={`backfill-preset-option ${
                    selectedPreset === 'custom'
                      ? 'backfill-preset-option--selected'
                      : ''
                  }`}
                >
                  <input
                    type='radio'
                    name='backfill-preset'
                    value='custom'
                    checked={selectedPreset === 'custom'}
                    onChange={() => setSelectedPreset('custom')}
                    disabled={isScrobbling}
                  />
                  <span className='backfill-preset-label'>Custom</span>
                </label>
              </div>

              {selectedPreset === 'custom' && (
                <div className='backfill-custom-inputs'>
                  <label className='backfill-input-label'>
                    Date
                    <input
                      type='date'
                      className='form-input backfill-date-input'
                      value={customDate}
                      onChange={e => setCustomDate(e.target.value)}
                      disabled={isScrobbling}
                      aria-label='Custom date'
                    />
                  </label>
                  <label className='backfill-input-label'>
                    Start time
                    <input
                      type='time'
                      className='form-input backfill-time-input'
                      value={customTime}
                      onChange={e => setCustomTime(e.target.value)}
                      disabled={isScrobbling}
                      aria-label='Custom start time'
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </ModalSection>
      )}

      {/* Gap control */}
      {albums.length > 1 && (
        <ModalSection>
          <label className='backfill-gap-control'>
            <span className='backfill-gap-label'>Gap between albums: </span>
            <input
              type='number'
              className='form-input backfill-gap-input'
              value={gapMinutes}
              onChange={e =>
                setGapMinutes(Math.max(0, parseInt(e.target.value) || 0))
              }
              min={0}
              max={120}
              disabled={isScrobbling}
              aria-label='Gap between albums in minutes'
            />
            <span className='backfill-gap-unit'>min</span>
            {patterns && (
              <span className='backfill-gap-hint'>(your typical gap)</span>
            )}
          </label>
        </ModalSection>
      )}

      {/* Timestamp preview */}
      {activeTimestamps && activeTimestamps.length > 0 && (
        <ModalSection title='Preview'>
          <div className='backfill-preview'>
            {activeTimestamps.map(ts => {
              const album = albums[ts.albumIndex];
              if (!album) return null;
              return (
                <div key={ts.albumIndex} className='backfill-preview-item'>
                  <span className='backfill-preview-album'>{album.album}</span>
                  <span className='backfill-preview-time'>
                    {formatTimestamp(ts.startTimestamp)} -{' '}
                    {formatTimeOnly(ts.endTimestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </ModalSection>
      )}

      {/* Warnings */}
      {activeSuggestion?.hasConflicts && activeSuggestion.conflictMessage && (
        <div className='backfill-warning'>
          {activeSuggestion.conflictMessage}
        </div>
      )}

      {activeSuggestion?.isOutsideLastFmWindow &&
        activeSuggestion.lastFmWindowWarning && (
          <div className='backfill-warning backfill-warning--severe'>
            {activeSuggestion.lastFmWindowWarning}
          </div>
        )}

      {/* Error */}
      {error && <div className='backfill-error'>{error}</div>}

      {/* Results */}
      {scrobbleResult && (
        <div className='backfill-results'>
          <span className='backfill-results-success'>
            Successfully scrobbled: {scrobbleResult.success} tracks
          </span>
          {scrobbleResult.failed > 0 && (
            <span className='backfill-results-failed'>
              Failed: {scrobbleResult.failed} tracks
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <ModalFooter>
        <Button
          variant='secondary'
          onClick={handleClose}
          disabled={isScrobbling}
          aria-label='Cancel backfill'
        >
          {scrobbleResult ? 'Close' : 'Cancel'}
        </Button>
        {!scrobbleResult && (
          <Button
            variant='primary'
            onClick={handleScrobbleAll}
            disabled={
              isScrobbling ||
              albums.length === 0 ||
              !activeTimestamps ||
              activeTimestamps.length === 0
            }
            loading={isScrobbling}
            aria-label={`Scrobble ${albums.length} albums`}
          >
            Scrobble All ({albums.length})
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default BackfillDialog;
