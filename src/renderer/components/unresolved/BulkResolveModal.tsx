import { Check, Globe, Square, SquareCheck, X } from 'lucide-react';
import React, {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import {
  UnresolvedAlbumOption,
  UnresolvedArtistAlbumSuggestions,
  UnresolvedHistoryGroup,
  UnresolvedTrackResolution,
} from '../../../shared/types';
import { useToast } from '../../context/ToastContext';
import { getApiService } from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ListItemSkeleton } from '../ui/Skeleton';

import {
  albumChoices,
  AlbumSuggestionsCache,
  describeSuggestion,
} from './albumSuggestionsCache';
import './BulkResolveModal.css';
import { formatCount, pluralize } from './unresolvedFormat';

const logger = createLogger('BulkResolveModal');

/** The resolutions endpoint accepts at most this many rules per request. */
export const RESOLUTIONS_CHUNK_SIZE = 500;

type Source = UnresolvedTrackResolution['source'];

interface RowSuggestion {
  album: string;
  origin: 'history' | 'collection' | 'lastfm';
  trackPlays: number;
}

interface BulkRow {
  /** Position in the loaded list (for stable element ids) */
  index: number;
  key: string;
  track: string;
  playCount: number;
  hidden: boolean;
  album: string;
  checked: boolean;
  /** Auto-filled album (history/collection, or a Last.fm lookup) */
  suggestion: RowSuggestion | null;
  /** History/collection albums that have this track, best first */
  options: UnresolvedAlbumOption[];
  /** Datalist choices: suggestions, alternatives, then known albums */
  choices: string[];
  /** Had no history/collection match when loaded (stable for filtering) */
  initiallyUnmatched: boolean;
  lookup: 'idle' | 'none' | 'error';
}

type LookupProgress =
  | { status: 'idle' }
  | { status: 'running'; current: number; total: number }
  | {
      status: 'done' | 'cancelled';
      checked: number;
      total: number;
      found: number;
      failed: number;
    };

interface LookupRunToken {
  cancelled: boolean;
  superseded: boolean;
}

const supersedeLookup = (
  ref: React.MutableRefObject<LookupRunToken | null>
) => {
  if (ref.current) ref.current.superseded = true;
  ref.current = null;
};

export interface BulkResolveModalProps {
  /** Artist to resolve; null keeps the modal closed */
  group: UnresolvedHistoryGroup | null;
  includeHidden: boolean;
  suggestionsCache: AlbumSuggestionsCache;
  onClose: () => void;
  /** Called after rules were saved, so the caller can refresh. */
  onSaved: () => void;
}

const buildRows = (
  data: UnresolvedArtistAlbumSuggestions,
  knownAlbums: string[]
): BulkRow[] =>
  data.tracks.map((t, index) => ({
    index,
    key: t.key,
    track: t.track,
    playCount: t.playCount,
    hidden: t.hidden,
    album: t.suggestion?.album ?? '',
    checked: Boolean(t.suggestion),
    suggestion: t.suggestion
      ? {
          album: t.suggestion.album,
          origin: t.suggestion.source,
          trackPlays: t.suggestion.trackPlays,
        }
      : null,
    options: [...(t.suggestion ? [t.suggestion] : []), ...t.alternatives],
    choices: albumChoices(t, knownAlbums),
    initiallyUnmatched: !t.suggestion,
    lookup: 'idle',
  }));

/** Provenance tag for a row's current album value. */
const describeRow = (row: BulkRow): { text: string; muted: boolean } => {
  const value = row.album.trim();
  if (!value) {
    if (row.lookup === 'none') return { text: 'not on Last.fm', muted: true };
    if (row.lookup === 'error') {
      return { text: 'Last.fm lookup failed', muted: true };
    }
    return { text: 'no match', muted: true };
  }
  if (row.suggestion?.origin === 'lastfm' && row.suggestion.album === value) {
    return { text: 'from Last.fm', muted: false };
  }
  const option = row.options.find(o => o.album === value);
  if (option) return { text: describeSuggestion(option), muted: false };
  return { text: 'your entry', muted: false };
};

/** Rule source: an unedited Last.fm fill is attributed to Last.fm. */
const rowSource = (row: BulkRow): Source =>
  row.suggestion?.origin === 'lastfm' &&
  row.suggestion.album === row.album.trim()
    ? 'lastfm-track-info'
    : 'user';

const lookupMessage = (progress: LookupProgress): string => {
  switch (progress.status) {
    case 'idle':
      return '';
    case 'running':
      return `Looking up ${formatCount(progress.current)} of ${formatCount(progress.total)}…`;
    default: {
      const prefix =
        progress.status === 'cancelled'
          ? `Stopped after ${formatCount(progress.checked)} of ${formatCount(progress.total)} lookups. `
          : '';
      const failed =
        progress.failed > 0
          ? ` ${pluralize(progress.failed, 'lookup')} failed.`
          : '';
      return `${prefix}Last.fm found albums for ${formatCount(progress.found)} of ${pluralize(progress.checked, 'track')}.${failed}`;
    }
  }
};

interface BulkRowItemProps {
  row: BulkRow;
  listId: string;
  disabled: boolean;
  onToggle: (key: string, checked: boolean) => void;
  onAlbumChange: (key: string, album: string) => void;
}

const BulkRowItem = memo(function BulkRowItem({
  row,
  listId,
  disabled,
  onToggle,
  onAlbumChange,
}: BulkRowItemProps) {
  const tag = describeRow(row);
  const hasAlbum = row.album.trim() !== '';
  return (
    <li
      className={`bulk-resolve-row${row.checked ? ' bulk-resolve-row--checked' : ''}`}
    >
      <input
        type='checkbox'
        className='bulk-resolve-check'
        checked={row.checked}
        disabled={disabled || !hasAlbum}
        onChange={e => onToggle(row.key, e.target.checked)}
        aria-label={`Include ${row.track}`}
      />
      <div className='bulk-resolve-track'>
        <span className='bulk-resolve-track-name'>
          {row.track}
          {row.hidden && (
            <Badge size='small' variant='secondary'>
              Hidden
            </Badge>
          )}
        </span>
        <span className='bulk-resolve-track-plays'>
          {pluralize(row.playCount, 'play')}
        </span>
      </div>
      <div className='bulk-resolve-album'>
        <input
          type='text'
          className='form-input bulk-resolve-album-input'
          value={row.album}
          placeholder='Album title'
          list={row.choices.length > 0 ? listId : undefined}
          disabled={disabled}
          onChange={e => onAlbumChange(row.key, e.target.value)}
          aria-label={`Album for ${row.track}`}
        />
        {row.choices.length > 0 && (
          <datalist id={listId}>
            {row.choices.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}
        <span
          className={`bulk-resolve-tag${tag.muted ? ' bulk-resolve-tag--muted' : ''}`}
        >
          {tag.text}
        </span>
      </div>
    </li>
  );
});

/**
 * Attributes many of an artist's unresolved tracks to albums at once. Each
 * track is pre-filled with the album it was played on most (or one in the
 * collection that has it); the user reviews, edits, and saves the selection.
 */
export const BulkResolveModal: React.FC<BulkResolveModalProps> = ({
  group,
  includeHidden,
  suggestionsCache,
  onClose,
  onSaved,
}) => {
  const api = getApiService();
  const { showToast } = useToast();
  const idPrefix = useId();

  const [rows, setRows] = useState<BulkRow[]>([]);
  const [artistName, setArtistName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [progress, setProgress] = useState<LookupProgress>({
    status: 'idle',
  });
  const [saving, setSaving] = useState(false);

  const loadSeq = useRef(0);
  // The running Last.fm lookup loop, if any. A run stops once it is
  // cancelled (by the user) or superseded (reload, close, unmount).
  const lookupRun = useRef<LookupRunToken | null>(null);
  // Latest rows, for the async lookup loop
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  // The Modal's focus trap keeps the first onClose it sees (Escape), so the
  // close handler must be stable and read the latest saving/onClose.
  const savingRef = useRef(saving);
  savingRef.current = saving;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handleClose = useCallback(() => {
    if (savingRef.current) return;
    supersedeLookup(lookupRun);
    onCloseRef.current();
  }, []);

  const artistKey = group?.artist;
  const knownAlbumsRef = useRef<string[]>([]);
  knownAlbumsRef.current = group?.knownAlbums ?? [];

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    supersedeLookup(lookupRun);
    setRows([]);
    setLoadError(null);
    setOnlyUnmatched(false);
    setProgress({ status: 'idle' });
    setSaving(false);
    if (!artistKey) return;
    setLoading(true);
    try {
      const data = await suggestionsCache.get(artistKey, includeHidden);
      if (seq !== loadSeq.current) return;
      setArtistName(data.artistName);
      setRows(buildRows(data, knownAlbumsRef.current));
    } catch (err) {
      logger.error('Failed to load album suggestions', err);
      if (seq !== loadSeq.current) return;
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load album suggestions'
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [artistKey, includeHidden, suggestionsCache]);

  useEffect(() => {
    void load();
  }, [load]);

  // Stop any lookup loop on unmount
  useEffect(
    () => () => {
      supersedeLookup(lookupRun);
    },
    []
  );

  const toggleRow = useCallback((key: string, checked: boolean) => {
    setRows(prev =>
      prev.map(r =>
        r.key === key ? { ...r, checked: checked && r.album.trim() !== '' } : r
      )
    );
  }, []);

  const changeAlbum = useCallback((key: string, album: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r.key !== key) return r;
        const hasAlbum = album.trim() !== '';
        const hadAlbum = r.album.trim() !== '';
        // Filling an album selects the row; clearing it deselects
        const checked = hasAlbum ? r.checked || !hadAlbum : false;
        return { ...r, album, checked };
      })
    );
  }, []);

  const selectAllWithAlbum = () =>
    setRows(prev => prev.map(r => ({ ...r, checked: r.album.trim() !== '' })));

  const selectNone = () =>
    setRows(prev => prev.map(r => ({ ...r, checked: false })));

  const cancelLookup = () => {
    if (lookupRun.current) lookupRun.current.cancelled = true;
  };

  const runLookup = async () => {
    supersedeLookup(lookupRun);
    const run: LookupRunToken = { cancelled: false, superseded: false };
    lookupRun.current = run;
    const stopped = () => run.cancelled || run.superseded;
    const targets = rowsRef.current
      .filter(r => !r.album.trim() && !r.suggestion && r.lookup !== 'none')
      .map(r => ({ key: r.key, track: r.track }));
    const total = targets.length;
    let found = 0;
    let failed = 0;
    let checked = 0;
    for (const target of targets) {
      if (stopped()) break;
      setProgress({ status: 'running', current: checked + 1, total });
      let album: string | null = null;
      let lookup: BulkRow['lookup'] = 'none';
      try {
        album = (await api.lookupUnresolvedAlbum(artistName, target.track))
          .album;
      } catch (err) {
        logger.warn('Last.fm album lookup failed', err);
        lookup = 'error';
      }
      if (stopped()) break;
      checked += 1;
      if (album) found += 1;
      if (lookup === 'error') failed += 1;
      const result = album;
      setRows(prev =>
        prev.map(r => {
          if (r.key !== target.key) return r;
          if (!result) return { ...r, lookup };
          // Keep anything the user typed while the lookup was running
          if (r.album.trim()) return r;
          return {
            ...r,
            album: result,
            checked: true,
            suggestion: { album: result, origin: 'lastfm', trackPlays: 0 },
            lookup: 'idle',
          };
        })
      );
    }
    // A run superseded by a reload or close leaves the progress alone
    if (run.superseded) return;
    if (lookupRun.current === run) lookupRun.current = null;
    setProgress({
      status: run.cancelled ? 'cancelled' : 'done',
      checked,
      total,
      found,
      failed,
    });
  };

  const selected = rows.filter(r => r.checked && r.album.trim());
  const selectedPlays = selected.reduce((sum, r) => sum + r.playCount, 0);
  const matched = rows.filter(r => r.suggestion).length;
  const unmatchedLeft = rows.filter(
    r => !r.album.trim() && !r.suggestion && r.lookup !== 'none'
  ).length;
  const visibleRows = onlyUnmatched
    ? rows.filter(r => r.initiallyUnmatched)
    : rows;
  const lookingUp = progress.status === 'running';

  const handleSave = async () => {
    if (!group || selected.length === 0) return;
    cancelLookup();
    setSaving(true);
    const resolutions = selected.map(r => ({
      key: r.key,
      plays: r.playCount,
      body: {
        // group.artist is the index key; artistName may be a display alias
        artist: group.artist,
        track: r.track,
        album: r.album.trim(),
        source: rowSource(r),
      },
    }));
    const savedKeys = new Set<string>();
    let savedPlays = 0;
    try {
      for (let i = 0; i < resolutions.length; i += RESOLUTIONS_CHUNK_SIZE) {
        const chunk = resolutions.slice(i, i + RESOLUTIONS_CHUNK_SIZE);
        await api.saveUnresolvedResolutions(chunk.map(c => c.body));
        chunk.forEach(c => {
          savedKeys.add(c.key);
          savedPlays += c.plays;
        });
      }
      showToast(
        'success',
        `Attributed ${pluralize(savedPlays, 'play')} from ${pluralize(savedKeys.size, 'track')} to albums`
      );
      setSaving(false);
      onSaved();
      onCloseRef.current();
    } catch (err) {
      logger.error('Failed to save album resolutions', err);
      const message =
        err instanceof Error ? err.message : 'Failed to save albums';
      if (savedKeys.size > 0) {
        // Earlier chunks were saved: drop them here and refresh the list
        setRows(prev => prev.filter(r => !savedKeys.has(r.key)));
        showToast(
          'error',
          `Saved ${formatCount(savedKeys.size)} of ${pluralize(resolutions.length, 'album')}, then: ${message}`
        );
        onSaved();
      } else {
        showToast('error', message);
      }
      setSaving(false);
    }
  };

  if (!group) return null;

  const title = `Add albums for ${artistName || group.artistName}`;

  const footer = (
    <>
      <span className='bulk-resolve-footer-note'>
        {selected.length > 0
          ? `${pluralize(selectedPlays, 'play')} will count in album stats`
          : 'Select tracks with an album to save'}
      </span>
      <Button variant='secondary' onClick={handleClose} disabled={saving}>
        Cancel
      </Button>
      <Button
        onClick={handleSave}
        disabled={selected.length === 0}
        loading={saving}
        iconLeft={<Check size={16} aria-hidden='true' />}
      >
        Save {pluralize(selected.length, 'album')}
      </Button>
    </>
  );

  const renderBody = () => {
    if (loading) {
      return (
        <div aria-busy='true' aria-label='Loading album suggestions'>
          <p className='bulk-resolve-summary'>Finding albums for each track…</p>
          <ListItemSkeleton count={5} />
        </div>
      );
    }
    if (loadError) {
      return (
        <div className='error-message'>
          {loadError}
          <Button size='small' onClick={() => void load()}>
            Retry
          </Button>
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <p className='bulk-resolve-summary'>
          This artist has no tracks without album info.
        </p>
      );
    }
    return (
      <>
        <p className='bulk-resolve-summary'>
          Suggested albums for {formatCount(matched)} of{' '}
          {pluralize(rows.length, 'track')}
          {rows.length - matched > 0
            ? ` — ${formatCount(rows.length - matched)} without a match`
            : ''}
          . Check the albums, edit any that are wrong, then save.
        </p>

        <div className='bulk-resolve-toolbar'>
          <div className='bulk-resolve-toolbar-group'>
            <Button
              variant='ghost'
              size='small'
              onClick={selectAllWithAlbum}
              disabled={saving}
              iconLeft={<SquareCheck size={16} aria-hidden='true' />}
            >
              Select all with an album
            </Button>
            <Button
              variant='ghost'
              size='small'
              onClick={selectNone}
              disabled={saving}
              iconLeft={<Square size={16} aria-hidden='true' />}
            >
              Select none
            </Button>
          </div>
          <label className='bulk-resolve-filter'>
            <input
              type='checkbox'
              checked={onlyUnmatched}
              onChange={e => setOnlyUnmatched(e.target.checked)}
            />
            Show only tracks without a match
          </label>
        </div>

        <div className='bulk-resolve-lookup'>
          {lookingUp ? (
            <Button
              variant='secondary'
              size='small'
              onClick={cancelLookup}
              iconLeft={<X size={16} aria-hidden='true' />}
            >
              Stop looking up
            </Button>
          ) : (
            <Button
              variant='secondary'
              size='small'
              onClick={() => void runLookup()}
              disabled={saving || unmatchedLeft === 0}
              iconLeft={<Globe size={16} aria-hidden='true' />}
            >
              Look up missing on Last.fm
            </Button>
          )}
          <span
            className='bulk-resolve-lookup-status'
            role='status'
            aria-live='polite'
          >
            {lookupMessage(progress)}
          </span>
        </div>

        {visibleRows.length === 0 ? (
          <p className='bulk-resolve-summary'>
            Every track had a suggested album.
          </p>
        ) : (
          <ul
            className='bulk-resolve-list'
            aria-label={`Tracks by ${artistName || group.artistName}`}
          >
            {visibleRows.map(row => (
              <BulkRowItem
                key={row.key}
                row={row}
                listId={`${idPrefix}-albums-${row.index}`}
                disabled={saving}
                onToggle={toggleRow}
                onAlbumChange={changeAlbum}
              />
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      closeOnEscape={!saving}
      title={title}
      size='large'
      footer={footer}
      className='bulk-resolve-modal'
    >
      <div className='bulk-resolve'>{renderBody()}</div>
    </Modal>
  );
};

export default BulkResolveModal;
