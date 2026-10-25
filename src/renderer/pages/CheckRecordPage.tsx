import { AlertTriangle, Disc3, ScanSearch, Search } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import {
  DiscardStatus,
  RecordCheckGroup,
  RecordCheckResult,
  RecordCheckWant,
} from '../../shared/types';
import { Badge, BadgeVariant } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import { navigate, ROUTES } from '../routes';
import { getApiService } from '../services/api';
import { formatLocalDateOnly } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';
import { getHashParam } from '../utils/tabUtils';

import './CheckRecordPage.page.css';

const logger = createLogger('CheckRecordPage');

/** Wait this long after typing stops before searching */
const SEARCH_DELAY_MS = 250;

/** Past this age the cached collection may no longer match Discogs */
export const STALE_COLLECTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const DISCARD_STATUS_LABELS: Record<DiscardStatus, string> = {
  marked: 'On your discard pile',
  listed: 'Listed for sale',
  sold: 'Sold',
  gifted: 'Gifted',
  removed: 'Removed',
  traded_in: 'Traded in',
};

const GONE_STATUSES: DiscardStatus[] = [
  'sold',
  'gifted',
  'removed',
  'traded_in',
];

/**
 * What a want's owned match says, worded by how sure it is: a search-guess
 * master or a name match is only "possibly"
 */
export function ownedNote(
  want: Pick<RecordCheckWant, 'ownedMatch' | 'ownedMatchConfidence'>
): { text: string; certain: boolean } | null {
  switch (want.ownedMatch) {
    case 'owned-same-release':
      return { text: 'You own this pressing', certain: true };
    case 'owned-other-version':
      return want.ownedMatchConfidence === 'likely'
        ? { text: 'Possibly own another version', certain: false }
        : { text: 'You own another version', certain: true };
    case 'owned-name-match':
      return { text: 'Possibly owned (same name)', certain: false };
    default:
      return null;
  }
}

/** The one-line answer at the top of a result card */
export function groupHeadline(
  group: RecordCheckGroup,
  releaseQuery: boolean
): { label: string; variant: BadgeVariant } {
  if (group.owned.some(c => c.isQueriedRelease)) {
    return { label: 'You own this pressing', variant: 'success' };
  }
  if (group.owned.length > 0) {
    // Only cards tied to the queried release by Discogs ids are its versions
    const versionOfQuery =
      releaseQuery &&
      (group.matchedBy === 'release-id' || group.matchedBy === 'master-id');
    if (versionOfQuery) {
      return { label: 'You own another pressing', variant: 'success' };
    }
    return {
      label:
        group.owned.length > 1
          ? `In your collection (${group.owned.length} copies)`
          : 'In your collection',
      variant: 'success',
    };
  }
  const gone = group.discards.find(d => GONE_STATUSES.includes(d.status));
  if (gone) {
    return {
      label: `${DISCARD_STATUS_LABELS[gone.status]} ${formatLocalDateOnly(gone.statusChangedAt)}`,
      variant: 'warning',
    };
  }
  const notes = [...group.wants, ...group.monitored]
    .map(ownedNote)
    .filter((n): n is NonNullable<typeof n> => n !== null);
  const note = notes.find(n => n.certain) ?? notes[0];
  if (note) {
    return { label: note.text, variant: note.certain ? 'success' : 'warning' };
  }
  if (group.wants.length > 0) {
    return { label: 'On your wishlist', variant: 'info' };
  }
  if (group.monitored.length > 0) {
    return { label: 'On your monitored wants', variant: 'info' };
  }
  return { label: 'Not owned', variant: 'default' };
}

const details = (...parts: Array<string | number | null | undefined>) =>
  parts.filter(p => p !== null && p !== undefined && p !== '').join(' · ');

const formatPrice = (price: number | null, currency: string | null) =>
  price === null
    ? null
    : `from ${new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'USD',
      }).format(price)}`;

const openRelease = (releaseId: number, owned: boolean) => {
  if (owned) {
    // CollectionItem.id is the release id; the release page uses it for
    // the crate and discard controls
    localStorage.setItem('selectedCollectionItemId', String(releaseId));
  }
  navigate(ROUTES.RELEASE_DETAILS, {
    id: String(releaseId),
    from: ROUTES.CHECK_RECORD,
  });
};

const WantLine: React.FC<{ want: RecordCheckWant }> = ({ want }) => {
  const note = ownedNote(want);
  return (
    <li className='check-record-line'>
      <span className='check-record-line-main'>
        {details(
          want.year,
          want.formats.slice(0, 3).join(', '),
          formatPrice(want.lowestVinylPrice, want.priceCurrency)
        ) || want.title}
      </span>
      {note && <span className='check-record-line-note'>{note.text}</span>}
    </li>
  );
};

const ResultCard: React.FC<{
  group: RecordCheckGroup;
  releaseQuery: boolean;
}> = ({ group, releaseQuery }) => {
  const headline = groupHeadline(group, releaseQuery);
  return (
    <li className='check-record-card'>
      <div className='check-record-card-header'>
        {group.coverImageUrl ? (
          <img
            className='check-record-cover'
            src={group.coverImageUrl}
            alt=''
            loading='lazy'
          />
        ) : (
          <div className='check-record-cover check-record-cover--empty'>
            <Disc3 size={20} aria-hidden='true' />
          </div>
        )}
        <div className='check-record-card-title'>
          <h2>{group.title}</h2>
          <p>{details(group.artist, group.year)}</p>
          <Badge variant={headline.variant}>{headline.label}</Badge>
          {group.matchedBy === 'linked' && (
            <p className='check-record-linked'>Related to a match above</p>
          )}
        </div>
      </div>

      {group.owned.length > 0 && (
        <section aria-label='In your collection'>
          <h3>In your collection</h3>
          <ul>
            {group.owned.map(copy => (
              <li key={copy.rowId} className='check-record-line'>
                <span className='check-record-line-main'>
                  {copy.isQueriedRelease && (
                    <Badge variant='success' size='small'>
                      This pressing
                    </Badge>
                  )}
                  {details(
                    copy.year,
                    copy.labels[0],
                    copy.formats.slice(0, 3).join(', ')
                  )}
                </span>
                <Button
                  variant='ghost'
                  size='small'
                  onClick={() => openRelease(copy.releaseId, true)}
                  aria-label={`Open ${copy.title}${copy.year ? ` (${copy.year})` : ''}`}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {group.wants.length > 0 && (
        <section aria-label='On your wishlist'>
          <h3>On your wishlist</h3>
          <ul>
            {group.wants.map(want => (
              <WantLine key={want.rowId} want={want} />
            ))}
          </ul>
        </section>
      )}

      {group.monitored.length > 0 && (
        <section aria-label='Monitored wants'>
          <h3>Monitored wants</h3>
          <ul>
            {group.monitored.map(want => (
              <WantLine key={want.rowId} want={want} />
            ))}
          </ul>
        </section>
      )}

      {group.discards.length > 0 && (
        <section aria-label='Discard pile'>
          <h3>Discard pile</h3>
          <ul>
            {group.discards.map(item => (
              <li key={item.id} className='check-record-line'>
                <span className='check-record-line-main'>
                  {DISCARD_STATUS_LABELS[item.status]}{' '}
                  {formatLocalDateOnly(
                    GONE_STATUSES.includes(item.status)
                      ? item.statusChangedAt
                      : item.addedAt
                  )}
                </span>
                {item.year ? (
                  <span className='check-record-line-note'>{item.year}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </li>
  );
};

const CheckRecordPage: React.FC = () => {
  const { state } = useApp();
  const [query, setQuery] = useState(() => getHashParam('q') ?? '');
  // Each answer keeps the query it was for, so nothing from an earlier
  // search shows under a newer one
  const [answer, setAnswer] = useState<{
    q: string;
    result: RecordCheckResult | null;
    error: string | null;
  } | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    // Keep the search in the URL (replaceState: no hashchange, no history spam)
    window.history.replaceState(
      null,
      '',
      q
        ? `#${ROUTES.CHECK_RECORD}?q=${encodeURIComponent(q)}`
        : `#${ROUTES.CHECK_RECORD}`
    );
    if (!q) {
      requestRef.current++;
      setAnswer(null);
      return;
    }
    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const data = await getApiService(state.serverUrl).checkRecord(q);
        // A slower earlier search must not replace a newer one
        if (request !== requestRef.current) return;
        setAnswer({ q, result: data, error: null });
      } catch (err) {
        if (request !== requestRef.current) return;
        logger.error('Check a record failed', err);
        setAnswer({
          q,
          result: null,
          error: err instanceof Error ? err.message : 'Search failed',
        });
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, state.serverUrl]);

  const q = query.trim();
  const current = answer && answer.q === q ? answer : null;
  const result = current?.result ?? null;
  const error = current?.error ?? null;
  const searching = !!q && !current;
  const cache = result?.collectionCache;
  const cachedAt = cache?.oldestPageAt ? Date.parse(cache.oldestPageAt) : NaN;
  const staleCollection =
    cache?.status === 'complete' &&
    Date.now() - cachedAt > STALE_COLLECTION_DAYS * DAY_MS;
  const isUrlQuery = !!result && /discogs\.com/i.test(result.query);
  const unknownRelease =
    !!result &&
    result.releaseId !== null &&
    result.releaseRecognized === false &&
    (isUrlQuery || result.groups.length === 0);

  return (
    <div className='check-record-page'>
      <header className='check-record-header'>
        <h1>Check a Record</h1>
        <p>
          Do you own it, want it, or did you trade it away? Search by artist or
          title, or paste a Discogs release link.
        </p>
      </header>

      <div className='check-record-search'>
        <Search size={18} aria-hidden='true' />
        <input
          type='search'
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder='Artist, title or Discogs release link'
          aria-label='Artist, title or Discogs release link'
          autoFocus
          autoComplete='off'
          autoCapitalize='none'
          spellCheck={false}
          enterKeyHint='search'
        />
      </div>

      {cache && cache.status !== 'complete' && (
        <p className='check-record-warning' role='status'>
          <AlertTriangle size={16} aria-hidden='true' />
          {cache.status === 'missing'
            ? 'Your collection hasn’t been loaded yet, so ownership can’t be checked. Open Browse Collection first.'
            : `Only ${cache.itemsRead} of ${cache.itemsExpected ?? '?'} collection items are loaded, so a record missing here may still be on your shelf.`}
        </p>
      )}

      {staleCollection && (
        <p className='check-record-warning' role='status'>
          <AlertTriangle size={16} aria-hidden='true' />
          {`Your collection was last loaded ${formatLocalDateOnly(cachedAt)}, so records added or removed on Discogs since then aren’t reflected. Open Browse Collection to refresh it.`}
        </p>
      )}

      {error && (
        <p className='check-record-error' role='alert'>
          {error}
        </p>
      )}

      {unknownRelease && (
        <p className='check-record-note' role='status'>
          Release {result!.releaseId} isn’t in your cached collection, wishlist
          or discard pile, so other versions of it can’t be checked here. Try
          searching by artist and title.
        </p>
      )}

      {searching && (
        <p className='check-record-meta' aria-live='polite'>
          Searching…
        </p>
      )}

      {!q && (
        <EmptyState
          icon={<ScanSearch size={32} aria-hidden='true' />}
          title='Holding a record?'
          description='Type a few letters of the artist or title to see whether you own it, another pressing of it, have it on your wishlist, or traded it in.'
          size='small'
        />
      )}

      {result && (
        <>
          <p className='check-record-meta' aria-live='polite'>
            {[
              result.groups.length === 0
                ? unknownRelease
                  ? ''
                  : 'No match in your cached collection, wishlist or discard history.'
                : `${result.groups.length}${result.hasMore ? '+' : ''} ${result.groups.length === 1 ? 'match' : 'matches'}`,
              Number.isFinite(cachedAt) && !staleCollection
                ? `Collection as of ${formatLocalDateOnly(cachedAt)}`
                : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <ul className='check-record-results'>
            {result.groups.map(group => (
              <ResultCard
                key={group.key}
                group={group}
                releaseQuery={
                  result.releaseId !== null && result.releaseRecognized === true
                }
              />
            ))}
          </ul>
          {result.hasMore && (
            <p className='check-record-meta'>
              Showing the best {result.groups.length}. Add more words to narrow
              it down.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default CheckRecordPage;
