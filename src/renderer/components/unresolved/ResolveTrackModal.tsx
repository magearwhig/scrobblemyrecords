import { Check, Search } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import {
  UnresolvedHistoryGroup,
  UnresolvedHistoryTrack,
  UnresolvedTrackResolution,
} from '../../../shared/types';
import { useToast } from '../../context/ToastContext';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

import './ResolveTrackModal.css';
import { formatCount, pluralize } from './unresolvedFormat';

const logger = createLogger('ResolveTrackModal');

type Scope = 'track' | 'artist';
type Source = UnresolvedTrackResolution['source'];

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; album: string }
  | { status: 'none' }
  | { status: 'error'; message: string };

export interface ResolveTrackModalProps {
  group: UnresolvedHistoryGroup | null;
  track: UnresolvedHistoryTrack | null;
  onClose: () => void;
  /** Called after rules were saved, so the caller can refresh. */
  onSaved: () => void;
}

/**
 * Lets the user attribute an unresolved track (or all of an artist's
 * unresolved tracks) to an album: pick a known album, accept a Last.fm
 * suggestion, or type one.
 */
export const ResolveTrackModal: React.FC<ResolveTrackModalProps> = ({
  group,
  track,
  onClose,
  onSaved,
}) => {
  const api = getApiService();
  const { showToast } = useToast();
  const [album, setAlbum] = useState('');
  const [source, setSource] = useState<Source>('user');
  const [scope, setScope] = useState<Scope>('track');
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  // Ignores lookup responses that arrive after the target track changed
  const lookupSeq = useRef(0);

  // Reset the form whenever a different track is opened
  useEffect(() => {
    setAlbum('');
    setSource('user');
    setScope('track');
    setLookup({ status: 'idle' });
    setSaving(false);
    lookupSeq.current += 1;
  }, [group?.artist, track?.key]);

  const artistTracks = group?.tracks ?? [];
  const artistPlays = artistTracks.reduce((sum, t) => sum + t.playCount, 0);

  if (!group || !track) return null;

  const targets = scope === 'artist' ? artistTracks : [track];
  const playsToAttribute = scope === 'artist' ? artistPlays : track.playCount;
  const trimmedAlbum = album.trim();

  const chooseAlbum = (value: string, valueSource: Source) => {
    setAlbum(value);
    setSource(valueSource);
  };

  const handleLookup = async () => {
    const seq = ++lookupSeq.current;
    setLookup({ status: 'loading' });
    try {
      const result = await api.lookupUnresolvedAlbum(
        group.artistName,
        track.track
      );
      if (seq !== lookupSeq.current) return;
      setLookup(
        result.album
          ? { status: 'found', album: result.album }
          : { status: 'none' }
      );
    } catch (err) {
      logger.warn('Last.fm album lookup failed', err);
      if (seq !== lookupSeq.current) return;
      setLookup({
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not reach Last.fm',
      });
    }
  };

  const handleSave = async () => {
    if (!trimmedAlbum) return;
    setSaving(true);
    try {
      await api.saveUnresolvedResolutions(
        // group.artist is the index key; artistName may be a display alias
        targets.map(t => ({
          artist: group.artist,
          track: t.track,
          album: trimmedAlbum,
          source,
        }))
      );
      showToast(
        'success',
        `Attributed ${pluralize(playsToAttribute, 'play')} to "${trimmedAlbum}"`
      );
      onSaved();
      onClose();
    } catch (err) {
      logger.error('Failed to save resolution', err);
      showToast(
        'error',
        err instanceof Error ? err.message : 'Failed to save album'
      );
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <>
      <Button variant='secondary' onClick={onClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={!trimmedAlbum}
        loading={saving}
        iconLeft={<Check size={16} aria-hidden='true' />}
      >
        Save album
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title='Add album info'
      size='medium'
      footer={footer}
    >
      <div className='resolve-modal'>
        <p className='resolve-modal-subject'>
          <span className='resolve-modal-track'>{track.track}</span>
          <span className='resolve-modal-artist'>by {group.artistName}</span>
        </p>

        {group.knownAlbums.length > 0 && (
          <fieldset className='resolve-modal-fieldset'>
            <legend className='resolve-modal-legend'>
              Albums by {group.artistName} in your history
            </legend>
            <div className='resolve-modal-known-albums'>
              {group.knownAlbums.map(name => (
                <button
                  key={name}
                  type='button'
                  className='resolve-modal-album-option'
                  aria-pressed={trimmedAlbum === name}
                  onClick={() => chooseAlbum(name, 'user')}
                >
                  {name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className='resolve-modal-lookup'>
          <Button
            variant='secondary'
            size='small'
            onClick={handleLookup}
            loading={lookup.status === 'loading'}
            iconLeft={<Search size={16} aria-hidden='true' />}
          >
            Suggest from Last.fm
          </Button>
          <div className='resolve-modal-lookup-result' aria-live='polite'>
            {lookup.status === 'found' && (
              <div className='resolve-modal-suggestion'>
                <span>
                  Last.fm suggests{' '}
                  <strong className='resolve-modal-suggestion-album'>
                    {lookup.album}
                  </strong>
                </span>
                <Button
                  size='small'
                  variant='outline'
                  onClick={() => chooseAlbum(lookup.album, 'lastfm-track-info')}
                  disabled={
                    trimmedAlbum === lookup.album &&
                    source === 'lastfm-track-info'
                  }
                >
                  Use this album
                </Button>
              </div>
            )}
            {lookup.status === 'none' && (
              <span className='resolve-modal-hint'>
                Last.fm has no album for this track.
              </span>
            )}
            {lookup.status === 'error' && (
              <span className='resolve-modal-error'>{lookup.message}</span>
            )}
          </div>
        </div>

        <div className='form-group'>
          <label className='form-label' htmlFor='resolve-modal-album-input'>
            Album
          </label>
          <input
            id='resolve-modal-album-input'
            type='text'
            className='form-input'
            value={album}
            placeholder='Album title'
            onChange={e => chooseAlbum(e.target.value, 'user')}
          />
        </div>

        {artistTracks.length > 1 && (
          <fieldset className='resolve-modal-fieldset'>
            <legend className='resolve-modal-legend'>Apply to</legend>
            <label className='resolve-modal-scope-option'>
              <input
                type='radio'
                name='resolve-scope'
                value='track'
                checked={scope === 'track'}
                onChange={() => setScope('track')}
              />
              This track ({pluralize(track.playCount, 'play')})
            </label>
            <label className='resolve-modal-scope-option'>
              <input
                type='radio'
                name='resolve-scope'
                value='artist'
                checked={scope === 'artist'}
                onChange={() => setScope('artist')}
              />
              {/* The list may be filtered (search, hidden), so this covers
                  the tracks shown, not necessarily every unresolved track */}
              All {formatCount(artistTracks.length)} listed tracks by{' '}
              {group.artistName} ({pluralize(artistPlays, 'play')})
            </label>
          </fieldset>
        )}

        <p className='resolve-modal-preview' aria-live='polite'>
          {trimmedAlbum
            ? `${pluralize(playsToAttribute, 'play')} will be attributed to "${trimmedAlbum}".`
            : `Choose an album to attribute ${pluralize(playsToAttribute, 'play')}.`}{' '}
          They will then count in album stats. You can undo this from Manage
          rules.
        </p>
      </div>
    </Modal>
  );
};

export default ResolveTrackModal;
