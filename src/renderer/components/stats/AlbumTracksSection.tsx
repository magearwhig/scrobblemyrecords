import { Merge, X } from 'lucide-react';
import React, { useState } from 'react';

import './AlbumTracksSection.css';

import { AlbumDetailTrack } from '../../../shared/types';
import { useApp } from '../../context/AppContext';
import { useNotifications } from '../../hooks/useNotifications';
import { getApiService } from '../../services/api';
import { formatLocalDateOnly, formatRelativeTime } from '../../utils/dateUtils';
import { createLogger } from '../../utils/logger';
import TrackLink from '../TrackLink';
import { Button } from '../ui/Button';

const logger = createLogger('AlbumTracksSection');

interface AlbumTracksSectionProps {
  tracks: AlbumDetailTrack[];
  /** Artist shown on track links */
  displayArtist: string;
  /** Album shown on track links */
  album: string;
  /** Artist and album that merges are saved under */
  mappingAlbum: { artist: string; album: string };
  /** Called after a merge is saved, to reload the album */
  onMerged: () => void;
}

/**
 * The album detail page's track list, with "Merge tracks": tick the rows
 * that are one song scrobbled under different names (e.g. a typo on the
 * record's tracklist) and pick the name to keep. Saved as track mappings, so
 * every screen that counts tracks counts them as one.
 */
const AlbumTracksSection: React.FC<AlbumTracksSectionProps> = ({
  tracks,
  displayArtist,
  album,
  mappingAlbum,
  onMerged,
}) => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);
  const { addNotification } = useNotifications();
  const [merging, setMerging] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  // Rows are sorted by plays, so the default name is the most-played row's
  const selectedNames = [...selected]
    .sort((a, b) => a - b)
    .map(i => tracks[i].track);
  const chosenName = selectedNames.includes(name) ? name : selectedNames[0];

  const toggle = (index: number) => {
    setSelected(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const stopMerging = () => {
    setMerging(false);
    setSelected([]);
    setName('');
  };

  const merge = async () => {
    if (selected.length < 2 || !chosenName) return;
    const spellings = new Set<string>();
    for (const index of selected) {
      for (const spelling of tracks[index].spellings ?? [tracks[index].track]) {
        spellings.add(spelling);
      }
    }
    setSaving(true);
    try {
      await api.mergeTracks(
        mappingAlbum.artist,
        mappingAlbum.album,
        Array.from(spellings),
        chosenName
      );
      addNotification({
        type: 'success',
        title: 'Tracks merged',
        message: `${selected.length} tracks now count as "${chosenName}".`,
      });
      stopMerging();
      onMerged();
    } catch (err) {
      logger.error('Failed to merge tracks', err);
      addNotification({
        type: 'alert',
        title: 'Merge failed',
        message: err instanceof Error ? err.message : 'Failed to merge tracks',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='detail-page-section'>
      <div className='album-tracks-header'>
        <h3>Tracks</h3>
        {tracks.length > 1 && !merging && (
          <Button
            variant='ghost'
            size='small'
            onClick={() => setMerging(true)}
            iconLeft={<Merge size={16} aria-hidden='true' />}
          >
            Merge tracks
          </Button>
        )}
      </div>

      {merging && (
        <div
          className='album-tracks-merge-bar'
          role='group'
          aria-label='Merge tracks'
        >
          {selected.length < 2 ? (
            <p className='album-tracks-merge-hint'>
              Tick the tracks that are the same song under different names.
            </p>
          ) : (
            <label className='album-tracks-merge-name'>
              <span>Count as one song, named</span>
              <select
                className='form-select'
                value={chosenName}
                onChange={e => setName(e.target.value)}
              >
                {selectedNames.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className='album-tracks-merge-actions'>
            <Button
              size='small'
              onClick={() => void merge()}
              disabled={selected.length < 2}
              loading={saving}
              iconLeft={<Merge size={16} aria-hidden='true' />}
            >
              Merge
            </Button>
            <Button
              variant='ghost'
              size='small'
              onClick={stopMerging}
              iconLeft={<X size={16} aria-hidden='true' />}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {tracks.length === 0 ? (
        <p className='detail-page-meta'>
          No track-level scrobbles for this album yet.
        </p>
      ) : (
        <ul className='album-detail-tracks'>
          {tracks.map((t, index) => (
            <li key={`${t.track}-${index}`} className='album-detail-track-row'>
              {merging ? (
                <input
                  type='checkbox'
                  className='album-tracks-merge-checkbox'
                  checked={selected.includes(index)}
                  onChange={() => toggle(index)}
                  aria-label={`Select ${t.track}`}
                />
              ) : (
                <span className='album-detail-track-rank'>{index + 1}.</span>
              )}
              <span className='album-detail-track-name'>
                <TrackLink
                  artist={displayArtist}
                  track={t.track}
                  album={album}
                />
              </span>
              <span className='album-detail-track-count'>
                {t.playCount.toLocaleString()}{' '}
                {t.playCount === 1 ? 'play' : 'plays'}
              </span>
              <span
                className='album-detail-track-last-played'
                title={formatLocalDateOnly(t.lastPlayed * 1000)}
              >
                {formatRelativeTime(t.lastPlayed)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AlbumTracksSection;
