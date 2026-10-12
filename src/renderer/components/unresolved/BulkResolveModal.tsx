import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Disc3,
  ExternalLink,
  Globe,
  Info,
  Square,
  SquareCheck,
  Undo2,
  X,
} from 'lucide-react';
import React, {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import {
  AlbumTrackMatch,
  AlbumTrackMatchQuality,
  AlbumTracklistMatch,
  UnresolvedAlbumOption,
  UnresolvedAlbumVerification,
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
  AlbumVerificationTone,
  describeSuggestion,
  describeVerification,
} from './albumSuggestionsCache';
import './BulkResolveModal.css';
import { formatCount, pluralize } from './unresolvedFormat';

const logger = createLogger('BulkResolveModal');

/** The resolutions endpoint accepts at most this many rules per request. */
export const RESOLUTIONS_CHUNK_SIZE = 500;

type Source = UnresolvedTrackResolution['source'];

/** Where a Discogs-matched row sits on the album the user pointed at */
interface DiscogsFill {
  /** The match run that filled the row (for undo) */
  applyId: number;
  albumTrack: string;
  position: number;
  positionLabel?: string;
  trackCount: number;
  quality: AlbumTrackMatchQuality;
  liveMismatch: boolean;
}

interface RowSuggestion {
  album: string;
  origin: 'history' | 'collection' | 'lastfm' | 'discogs';
  trackPlays: number;
  /** Last.fm fills: check of the album's tracklist for this track */
  verification?: UnresolvedAlbumVerification;
  /** Discogs fills: the matching track on the album */
  discogs?: DiscogsFill;
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

/** The parts of a row a Discogs match changes (and its undo restores) */
type RowFillState = Pick<
  BulkRow,
  'album' | 'checked' | 'suggestion' | 'lookup'
>;

/** One Discogs album applied to the rows */
interface DiscogsApply {
  id: number;
  match: AlbumTracklistMatch;
  /** Rows filled with the album */
  filled: number;
  /** Filled rows left unselected (close or live-mismatched matches) */
  unselected: number;
  /** Matched rows kept because the user had typed an album */
  skippedEdited: number;
  /** Each filled row's state before the fill */
  previous: Record<string, RowFillState>;
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
      /** Fills Last.fm confirmed are on the album's tracklist */
      confirmed: number;
      /** Fills whose album was found but the track isn't on it */
      notOnTracklist: number;
      /** Fills whose tracklist couldn't be checked */
      unverified: number;
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

/** True when the user typed or picked an album other than the suggestion. */
const isUserEdited = (row: BulkRow): boolean => {
  const value = row.album.trim();
  return value !== '' && value !== (row.suggestion?.album ?? '');
};

/** True while a row still holds its unedited Discogs fill. */
const isDiscogsFill = (row: BulkRow): boolean =>
  row.suggestion?.origin === 'discogs' &&
  row.suggestion.album === row.album.trim();

const rowFillState = (row: BulkRow): RowFillState => ({
  album: row.album,
  checked: row.checked,
  suggestion: row.suggestion,
  lookup: row.lookup,
});

/** Close or live-mismatched matches are left for the user to tick. */
const isConfidentMatch = (m: AlbumTrackMatch): boolean =>
  (m.quality === 'exact' || m.quality === 'tags') && !m.liveMismatch;

const discogsFillState = (
  match: AlbumTracklistMatch,
  m: AlbumTrackMatch,
  applyId: number
): RowFillState => ({
  album: match.album,
  checked: isConfidentMatch(m),
  suggestion: {
    album: match.album,
    origin: 'discogs',
    trackPlays: 0,
    discogs: {
      applyId,
      albumTrack: m.albumTrack,
      position: m.position,
      positionLabel: m.positionLabel,
      trackCount: match.trackCount,
      quality: m.quality,
      liveMismatch: m.liveMismatch,
    },
  },
  lookup: 'idle',
});

/**
 * A Discogs match only replaces an album the user typed when it is the same
 * album; suggestions (history, collection, Last.fm, Discogs) are replaced.
 */
const keepsUserEdit = (row: BulkRow, album: string): boolean =>
  isUserEdited(row) && row.album.trim() !== album;

/** Work out which rows a Discogs match fills, and what they held before. */
const planDiscogsFill = (
  rows: BulkRow[],
  match: AlbumTracklistMatch,
  applyId: number
): {
  fills: Map<string, RowFillState>;
  previous: Record<string, RowFillState>;
  unselected: number;
  skippedEdited: number;
} => {
  const byKey = new Map(rows.map(r => [r.key, r]));
  const fills = new Map<string, RowFillState>();
  const previous: Record<string, RowFillState> = {};
  let unselected = 0;
  let skippedEdited = 0;
  for (const m of match.matches) {
    const row = byKey.get(m.key);
    if (!row || fills.has(m.key)) continue;
    if (keepsUserEdit(row, match.album)) {
      skippedEdited += 1;
      continue;
    }
    const fill = discogsFillState(match, m, applyId);
    if (!fill.checked) unselected += 1;
    fills.set(m.key, fill);
    previous[m.key] = rowFillState(row);
  }
  return { fills, previous, unselected, skippedEdited };
};

const describeDiscogsApply = (apply: DiscogsApply): string => {
  const { match } = apply;
  const parts = [
    `Matched ${formatCount(match.matches.length)} of the artist's unresolved tracks (${formatCount(match.unmatchedCount)} not on this album).`,
  ];
  if (apply.unselected > 0) {
    parts.push(`${formatCount(apply.unselected)} left unselected to check.`);
  }
  if (apply.skippedEdited > 0) {
    parts.push(
      `Skipped ${pluralize(apply.skippedEdited, 'track')} you edited.`
    );
  }
  return parts.join(' ');
};

/** Position and any caveats of a Discogs fill, for the row. */
const describeDiscogsFill = (
  fill: DiscogsFill
): Array<{ tone: AlbumVerificationTone; text: string }> => {
  const clean =
    (fill.quality === 'exact' || fill.quality === 'tags') && !fill.liveMismatch;
  const lines: Array<{ tone: AlbumVerificationTone; text: string }> = [
    {
      tone: clean ? 'confirmed' : 'unknown',
      text: `Track ${fill.positionLabel || fill.position} of ${fill.trackCount}: ${fill.albumTrack}`,
    },
  ];
  if (fill.quality === 'near') {
    lines.push({
      tone: 'warning',
      text: `Close match: \u201C${fill.albumTrack}\u201D`,
    });
  }
  if (fill.liveMismatch) {
    lines.push({
      tone: 'warning',
      text: "Album is live but this play isn't tagged live (or vice versa) \u2014 may be a different version",
    });
  }
  return lines;
};

/** Prefer the server's error message over axios' generic status text */
const getErrorMessage = (err: unknown, fallback: string): string => {
  const apiError = (err as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  if (typeof apiError === 'string' && apiError) return apiError;
  return err instanceof Error && err.message ? err.message : fallback;
};

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
  if (isLastfmFill(row)) {
    return { text: 'from Last.fm', muted: false };
  }
  if (isDiscogsFill(row)) {
    return { text: 'from Discogs', muted: false };
  }
  const option = row.options.find(o => o.album === value);
  if (option) return { text: describeSuggestion(option), muted: false };
  return { text: 'your entry', muted: false };
};

/** True while a row still holds its unedited Last.fm fill. */
const isLastfmFill = (row: BulkRow): boolean =>
  row.suggestion?.origin === 'lastfm' &&
  row.suggestion.album === row.album.trim();

/** Rule source: an unedited Last.fm fill is attributed to Last.fm. */
const rowSource = (row: BulkRow): Source =>
  isLastfmFill(row) ? 'lastfm-track-info' : 'user';

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
      const checks = [
        progress.confirmed > 0
          ? `${formatCount(progress.confirmed)} confirmed on the tracklist`
          : '',
        progress.notOnTracklist > 0
          ? `${formatCount(progress.notOnTracklist)} not on the tracklist (left unselected)`
          : '',
        progress.unverified > 0
          ? `${formatCount(progress.unverified)} couldn't be checked`
          : '',
      ].filter(Boolean);
      const verified = checks.length > 0 ? ` — ${checks.join(', ')}` : '';
      return `${prefix}Last.fm found albums for ${formatCount(progress.found)} of ${pluralize(progress.checked, 'track')}${verified}.${failed}`;
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

const VerificationIcon: React.FC<{ tone: AlbumVerificationTone }> = ({
  tone,
}) => {
  if (tone === 'confirmed')
    return <CheckCircle2 size={16} aria-hidden='true' />;
  if (tone === 'warning') return <AlertTriangle size={16} aria-hidden='true' />;
  return <Info size={16} aria-hidden='true' />;
};

const BulkRowItem = memo(function BulkRowItem({
  row,
  listId,
  disabled,
  onToggle,
  onAlbumChange,
}: BulkRowItemProps) {
  const tag = describeRow(row);
  const hasAlbum = row.album.trim() !== '';
  // Only an unedited Last.fm fill carries a tracklist check
  const verification = isLastfmFill(row)
    ? row.suggestion?.verification
    : undefined;
  const check = row.suggestion
    ? describeVerification(row.suggestion.album, verification)
    : null;
  const discogs = isDiscogsFill(row) ? row.suggestion?.discogs : undefined;
  const discogsLines = discogs ? describeDiscogsFill(discogs) : [];
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
        <div className='bulk-resolve-meta'>
          {verification?.imageUrl && (
            // Decorative: the album name is in the input and the check text
            <img
              className='bulk-resolve-cover'
              src={verification.imageUrl}
              alt=''
              loading='lazy'
            />
          )}
          <span
            className={`bulk-resolve-tag${tag.muted ? ' bulk-resolve-tag--muted' : ''}`}
          >
            {tag.text}
          </span>
          {verification?.albumUrl && (
            <a
              className='bulk-resolve-lastfm-link'
              href={verification.albumUrl}
              target='_blank'
              rel='noopener noreferrer'
            >
              View on Last.fm
              <ExternalLink size={16} aria-hidden='true' />
            </a>
          )}
        </div>
        {check && (
          <span
            className={`bulk-resolve-verification bulk-resolve-verification--${check.tone}`}
          >
            <VerificationIcon tone={check.tone} />
            {check.text}
          </span>
        )}
        {discogsLines.map(line => (
          <span
            key={line.text}
            className={`bulk-resolve-verification bulk-resolve-verification--${line.tone}`}
          >
            <VerificationIcon tone={line.tone} />
            {line.text}
          </span>
        ))}
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
  const [discogsUrl, setDiscogsUrl] = useState('');
  const [discogsBusy, setDiscogsBusy] = useState(false);
  const [discogsError, setDiscogsError] = useState<string | null>(null);
  const [discogsMessage, setDiscogsMessage] = useState('');
  const [discogsApplies, setDiscogsApplies] = useState<DiscogsApply[]>([]);
  const discogsApplySeq = useRef(0);

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
    setDiscogsUrl('');
    setDiscogsBusy(false);
    setDiscogsError(null);
    setDiscogsMessage('');
    setDiscogsApplies([]);
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
    let confirmed = 0;
    let notOnTracklist = 0;
    let unverified = 0;
    for (const target of targets) {
      if (stopped()) break;
      setProgress({ status: 'running', current: checked + 1, total });
      let album: string | null = null;
      let verification: UnresolvedAlbumVerification | undefined;
      let lookup: BulkRow['lookup'] = 'none';
      try {
        const result = await api.lookupUnresolvedAlbum(
          artistName,
          target.track
        );
        album = result.album;
        verification = result.album ? result.verification : undefined;
      } catch (err) {
        logger.warn('Last.fm album lookup failed', err);
        lookup = 'error';
      }
      if (stopped()) break;
      checked += 1;
      if (album) found += 1;
      if (lookup === 'error') failed += 1;
      if (verification?.onTracklist === true) confirmed += 1;
      else if (verification?.onTracklist === false) notOnTracklist += 1;
      else if (verification) unverified += 1;
      const result = album;
      const resultVerification = verification;
      setRows(prev =>
        prev.map(r => {
          if (r.key !== target.key) return r;
          if (!result) return { ...r, lookup };
          // Keep anything the user typed while the lookup was running
          if (r.album.trim()) return r;
          return {
            ...r,
            album: result,
            // Leave fills Last.fm can't find on the album for the user to tick
            checked: resultVerification?.onTracklist !== false,
            suggestion: {
              album: result,
              origin: 'lastfm',
              trackPlays: 0,
              verification: resultVerification,
            },
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
      confirmed,
      notOnTracklist,
      unverified,
    });
  };

  const matchDiscogsAlbum = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = discogsUrl.trim();
    if (!artistKey || !url || discogsBusy || savingRef.current) return;
    const seq = loadSeq.current;
    setDiscogsBusy(true);
    setDiscogsError(null);
    setDiscogsMessage('');
    try {
      const match = await api.matchUnresolvedFromDiscogsAlbum(artistKey, url, {
        includeHidden,
      });
      // A reload or close since the request started discards the result
      if (seq !== loadSeq.current) return;
      const id = ++discogsApplySeq.current;
      const plan = planDiscogsFill(rowsRef.current, match, id);
      setRows(prev =>
        prev.map(r => {
          const fill = plan.fills.get(r.key);
          // Re-check: the user may have typed since the plan was made
          if (!fill || keepsUserEdit(r, match.album)) return r;
          return { ...r, ...fill };
        })
      );
      const apply: DiscogsApply = {
        id,
        match,
        filled: plan.fills.size,
        unselected: plan.unselected,
        skippedEdited: plan.skippedEdited,
        previous: plan.previous,
      };
      if (plan.fills.size > 0 || plan.skippedEdited > 0) {
        setDiscogsApplies(prev => [...prev, apply]);
      }
      setDiscogsUrl('');
      setDiscogsMessage(`${match.album}: ${describeDiscogsApply(apply)}`);
    } catch (err) {
      logger.warn('Discogs album match failed', err);
      if (seq !== loadSeq.current) return;
      setDiscogsError(
        getErrorMessage(err, 'Could not match tracks from that album')
      );
    } finally {
      if (seq === loadSeq.current) setDiscogsBusy(false);
    }
  };

  const undoDiscogsAlbum = (id: number) => {
    const apply = discogsApplies.find(a => a.id === id);
    if (!apply) return;
    // Only rows still holding this album's fill go back; later edits and
    // later albums stay
    setRows(prev =>
      prev.map(r => {
        const before = apply.previous[r.key];
        if (
          !before ||
          !isDiscogsFill(r) ||
          r.suggestion?.discogs?.applyId !== id
        ) {
          return r;
        }
        return { ...r, ...before };
      })
    );
    // Later albums that replaced this one's fills now undo to what was
    // there before this album
    setDiscogsApplies(prev =>
      prev
        .filter(a => a.id !== id)
        .map(a => {
          let changed = false;
          const previous = { ...a.previous };
          for (const [key, state] of Object.entries(a.previous)) {
            if (
              state.suggestion?.discogs?.applyId === id &&
              apply.previous[key]
            ) {
              previous[key] = apply.previous[key];
              changed = true;
            }
          }
          return changed ? { ...a, previous } : a;
        })
    );
    setDiscogsError(null);
    setDiscogsMessage(`Undid the matches from ${apply.match.album}.`);
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
        disabled={selected.length === 0 || discogsBusy}
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

        <div className='bulk-resolve-discogs'>
          <form
            className='bulk-resolve-discogs-form'
            onSubmit={e => void matchDiscogsAlbum(e)}
          >
            <span className='bulk-resolve-discogs-label' aria-hidden='true'>
              Match from a Discogs album
            </span>
            <div className='bulk-resolve-discogs-controls'>
              <input
                type='text'
                inputMode='url'
                className='form-input bulk-resolve-discogs-input'
                value={discogsUrl}
                placeholder='Paste a Discogs album link'
                aria-label='Discogs album link'
                disabled={saving || discogsBusy}
                onChange={e => {
                  setDiscogsUrl(e.target.value);
                  setDiscogsError(null);
                }}
              />
              <Button
                type='submit'
                variant='secondary'
                size='small'
                loading={discogsBusy}
                disabled={saving || !discogsUrl.trim()}
                iconLeft={<Disc3 size={16} aria-hidden='true' />}
              >
                Match
              </Button>
            </div>
          </form>
          <div className='bulk-resolve-discogs-live' aria-live='polite'>
            {discogsError ? (
              <span className='bulk-resolve-discogs-error'>
                <AlertTriangle size={16} aria-hidden='true' />
                {discogsError}
              </span>
            ) : (
              discogsMessage && (
                <span className='bulk-resolve-discogs-message'>
                  {discogsMessage}
                </span>
              )
            )}
          </div>
          {discogsApplies.length > 0 && (
            <ul
              className='bulk-resolve-discogs-results'
              aria-label='Albums matched from Discogs'
            >
              {discogsApplies.map(apply => (
                <li key={apply.id} className='bulk-resolve-discogs-card'>
                  {apply.match.imageUrl ? (
                    // Decorative: the title is next to it
                    <img
                      className='bulk-resolve-discogs-cover'
                      src={apply.match.imageUrl}
                      alt=''
                      loading='lazy'
                    />
                  ) : (
                    <span
                      className='bulk-resolve-discogs-cover bulk-resolve-discogs-cover--empty'
                      aria-hidden='true'
                    >
                      <Disc3 size={20} aria-hidden='true' />
                    </span>
                  )}
                  <div className='bulk-resolve-discogs-info'>
                    <span className='bulk-resolve-discogs-title'>
                      {apply.match.album}
                    </span>
                    <span className='bulk-resolve-discogs-artist'>
                      {apply.match.albumArtist}
                    </span>
                    <span className='bulk-resolve-discogs-counts'>
                      {describeDiscogsApply(apply)}
                    </span>
                  </div>
                  <div className='bulk-resolve-discogs-actions'>
                    {apply.match.albumUrl && (
                      <a
                        className='bulk-resolve-lastfm-link'
                        href={apply.match.albumUrl}
                        target='_blank'
                        rel='noopener noreferrer'
                      >
                        View on Discogs
                        <ExternalLink size={16} aria-hidden='true' />
                      </a>
                    )}
                    <Button
                      variant='ghost'
                      size='small'
                      onClick={() => undoDiscogsAlbum(apply.id)}
                      disabled={saving}
                      aria-label={`Undo matches from ${apply.match.album}`}
                      iconLeft={<Undo2 size={16} aria-hidden='true' />}
                    >
                      Undo
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

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
