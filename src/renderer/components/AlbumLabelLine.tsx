import { Tag } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import './AlbumLabelLine.css';

import { AlbumLabelInfo } from '../../shared/types';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';

import LabelLink from './LabelLink';
import { Button } from './ui/Button';

const SOURCE_NAMES: Record<AlbumLabelInfo['source'], string> = {
  musicbrainz: 'MusicBrainz',
  discogs: 'Discogs',
  override: 'you',
};

interface AlbumLabelLineProps {
  artist: string;
  album: string;
}

/**
 * The label of an album you don't own, as the label pages count it: looked
 * up in the background, or set by you. Lets you confirm an unsure match,
 * reject a wrong one, or type the labels yourself.
 */
const AlbumLabelLine: React.FC<AlbumLabelLineProps> = ({ artist, album }) => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);
  const [info, setInfo] = useState<AlbumLabelInfo | null | undefined>(
    undefined
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await api.getAlbumLabel(artist, album));
    } catch {
      setInfo(null);
    }
  }, [api, artist, album]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setEditing(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const startEditing = () => {
    setDraft(info?.labels.join(', ') ?? '');
    setEditing(true);
  };

  const save = () =>
    act(() =>
      api.setAlbumLabel(
        artist,
        album,
        draft
          .split(',')
          .map(label => label.trim())
          .filter(Boolean)
      )
    );

  if (info === undefined) return null;

  const labelLinks = (labels: string[]) =>
    labels.map((name, i) => (
      <React.Fragment key={name}>
        {i > 0 && ', '}
        <LabelLink label={name} />
      </React.Fragment>
    ));

  let summary: React.ReactNode;
  let actions: React.ReactNode;
  if (!info) {
    summary = 'Label not looked up yet';
    actions = (
      <Button size='small' variant='ghost' onClick={startEditing}>
        Set label
      </Button>
    );
  } else if (info.status === 'override') {
    summary =
      info.labels.length > 0 ? (
        <>
          {labelLinks(info.labels)}
          <span className='album-label-line-source'> · set by you</span>
        </>
      ) : (
        'Not counted on any label · set by you'
      );
    actions = (
      <>
        <Button size='small' variant='ghost' onClick={startEditing}>
          Change
        </Button>
        <Button
          size='small'
          variant='ghost'
          disabled={busy}
          onClick={() => act(() => api.clearAlbumLabel(artist, album))}
        >
          Use looked-up label
        </Button>
      </>
    );
  } else if (info.status === 'unsure') {
    summary = (
      <>
        {labelLinks(info.labels)}?{' '}
        <span className='album-label-line-source'>
          Possible match: &quot;{info.matchedTitle}&quot;
          {info.matchedArtist ? ` by ${info.matchedArtist}` : ''} on{' '}
          {SOURCE_NAMES[info.source]}
        </span>
      </>
    );
    actions = (
      <>
        <Button
          size='small'
          variant='secondary'
          disabled={busy}
          onClick={() => act(() => api.confirmAlbumLabel(artist, album))}
        >
          Yes, that&apos;s right
        </Button>
        <Button
          size='small'
          variant='ghost'
          disabled={busy}
          onClick={() => act(() => api.rejectAlbumLabel(artist, album))}
        >
          No
        </Button>
      </>
    );
  } else if (info.status === 'none' || info.labels.length === 0) {
    summary = 'No label found';
    actions = (
      <Button size='small' variant='ghost' onClick={startEditing}>
        Set label
      </Button>
    );
  } else {
    summary = (
      <>
        {labelLinks(info.labels)}
        <span className='album-label-line-source'>
          {' '}
          · from {SOURCE_NAMES[info.source]}
        </span>
      </>
    );
    actions = (
      <>
        <Button size='small' variant='ghost' onClick={startEditing}>
          Change
        </Button>
        <Button
          size='small'
          variant='ghost'
          disabled={busy}
          onClick={() => act(() => api.rejectAlbumLabel(artist, album))}
        >
          Not right
        </Button>
      </>
    );
  }

  return (
    <div className='album-label-line'>
      <Tag size={16} aria-hidden='true' />
      {editing ? (
        <form
          className='album-label-line-form'
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            className='album-label-line-input'
            aria-label='Labels, separated by commas'
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder='e.g. Merge Records'
            autoFocus
          />
          <Button size='small' type='submit' disabled={busy}>
            Save
          </Button>
          <Button
            size='small'
            variant='ghost'
            type='button'
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <span className='album-label-line-summary'>{summary}</span>
          <span className='album-label-line-actions'>{actions}</span>
        </>
      )}
    </div>
  );
};

export default AlbumLabelLine;
