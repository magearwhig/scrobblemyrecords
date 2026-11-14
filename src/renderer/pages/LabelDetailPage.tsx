import { Disc3, ExternalLink } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import './LabelDetailPage.page.css';

import { AlbumLabelStatus, LabelDetailResponse } from '../../shared/types';
import AlbumLink from '../components/AlbumLink';
import ArtistLink from '../components/ArtistLink';
import PlayTrendChart from '../components/PlayTrendChart';
import TrackLink from '../components/TrackLink';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { ROUTES, navigate } from '../routes';
import { getApiService } from '../services/api';
import { statsApi } from '../services/statsApi';
import { formatLocalDateOnly, formatRelativeTime } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('LabelDetailPage');

/** Page names for the back link */
const PAGE_NAMES: Record<string, string> = {
  [ROUTES.RELEASE_DETAILS]: 'Release Details',
  [ROUTES.ALBUM_DETAIL]: 'Album',
  [ROUTES.ARTIST_DETAIL]: 'Artist',
  [ROUTES.COLLECTION]: 'Collection',
  [ROUTES.COLLECTION_ANALYTICS]: 'Collection Analytics',
  [ROUTES.STATS]: 'Stats',
  [ROUTES.MARKETPLACE]: 'Marketplace',
};

/** Badge text for where an album's label came from */
const SOURCE_NAMES: Record<
  LabelDetailResponse['topAlbums'][number]['source'],
  string
> = {
  owned: 'Owned',
  musicbrainz: 'MusicBrainz',
  discogs: 'Discogs',
  override: 'You set',
};

const plural = (count: number, word: string) =>
  `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

/**
 * Label detail page: listening on the albums you own on one label, with top
 * artists, albums and tracks. Reads the label from localStorage
 * ('selectedLabel'), set by LabelLink.
 */
const LabelDetailPage: React.FC = () => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);
  const [labelName, setLabelName] = useState('');
  const [includeUnowned, setIncludeUnowned] = useState(true);
  const [lookupStatus, setLookupStatus] = useState<AlbumLabelStatus | null>(
    null
  );
  const [data, setData] = useState<LabelDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trendPeriod, setTrendPeriod] = useState<'month' | 'week'>('month');

  const previousPage = useMemo<string>(() => {
    const hash = window.location.hash.replace('#', '');
    const query = hash.includes('?') ? hash.split('?')[1] : '';
    return new URLSearchParams(query).get('from') || ROUTES.STATS;
  }, []);
  const backLabel = `Back to ${PAGE_NAMES[previousPage] ?? 'Stats'}`;
  const handleBack = useCallback(() => navigate(previousPage), [previousPage]);

  const load = useCallback(
    async (
      name: string,
      period: 'month' | 'week',
      withUnowned: boolean,
      signal: AbortSignal
    ) => {
      try {
        setLoading(true);
        setError('');
        const result = await statsApi.getLabelDetail(name, period, withUnowned);
        if (signal.aborted) return;
        if (result.success && result.data) {
          setData(result.data);
        } else {
          setError(result.error || 'Could not load this label.');
        }
      } catch (err) {
        if (signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        logger.error('Error fetching label detail', { label: name, message });
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const stored = localStorage.getItem('selectedLabel');
    if (!stored) {
      setError('No label selected. Go back and choose a label.');
      setLoading(false);
      return;
    }
    setLabelName(stored);
    const controller = new AbortController();
    void load(stored, 'month', true, controller.signal);
    api
      .getAlbumLabelStatus()
      .then(status => {
        if (!controller.signal.aborted) setLookupStatus(status);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePeriodChange = useCallback(
    (period: 'month' | 'week') => {
      setTrendPeriod(period);
      if (!labelName) return;
      void load(
        labelName,
        period,
        includeUnowned,
        new AbortController().signal
      );
    },
    [includeUnowned, labelName, load]
  );

  const handleIncludeUnowned = useCallback(
    (checked: boolean) => {
      setIncludeUnowned(checked);
      if (!labelName) return;
      void load(labelName, trendPeriod, checked, new AbortController().signal);
    },
    [labelName, load, trendPeriod]
  );

  const backButton = (
    <button
      className='detail-page-back-link'
      onClick={handleBack}
      aria-label={backLabel}
    >
      &larr; {backLabel}
    </button>
  );

  if (loading && !data) {
    return (
      <div className='detail-page'>
        {backButton}
        <Skeleton variant='text' width={240} height={32} />
        <Skeleton variant='rectangular' width='100%' height={250} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className='detail-page'>
        {backButton}
        <EmptyState
          title='Could not load label'
          description={error || 'No listening data for this label.'}
          actions={[
            { label: backLabel, onClick: handleBack, variant: 'primary' },
          ]}
        />
      </div>
    );
  }

  const encodedLabel = encodeURIComponent(data.label);

  return (
    <div className='detail-page label-detail-page'>
      {backButton}

      <div className='detail-page-header'>
        <div className='detail-page-image-placeholder' aria-hidden='true'>
          <Disc3 size={40} />
        </div>
        <div className='detail-page-info'>
          <h1 className='detail-page-title'>{data.label}</h1>
          {data.otherSpellings.length > 0 && (
            <p className='detail-page-meta'>
              Also listed as: {data.otherSpellings.join(', ')}
            </p>
          )}
          <p className='detail-page-meta'>
            {plural(data.totalPlayCount, 'play')} &middot;{' '}
            {data.ownedCopyCount.toLocaleString()}{' '}
            {data.ownedCopyCount === 1 ? 'copy' : 'copies'} in your collection
          </p>
          {data.lookedUpPlayCount > 0 && (
            <p className='detail-page-meta'>
              {data.ownedPlayCount.toLocaleString()} from albums you own
              {' · '}
              {data.lookedUpPlayCount.toLocaleString()} from albums you
              don&apos;t own, by their looked-up label
            </p>
          )}
          <p className='detail-page-meta'>
            {data.firstPlayed && (
              <>First played: {formatLocalDateOnly(data.firstPlayed * 1000)}</>
            )}
            {data.lastPlayed && (
              <> &middot; Last played: {formatRelativeTime(data.lastPlayed)}</>
            )}
          </p>
          <label className='label-detail-toggle'>
            <input
              type='checkbox'
              checked={includeUnowned}
              onChange={e => handleIncludeUnowned(e.target.checked)}
            />
            Include albums you don&apos;t own
          </label>
          {includeUnowned && lookupStatus && lookupStatus.pending > 0 && (
            <p className='detail-page-meta label-detail-lookup-status'>
              Still looking up labels: {lookupStatus.checked.toLocaleString()}{' '}
              of {lookupStatus.total.toLocaleString()} albums checked
            </p>
          )}
          <div className='detail-page-external-links'>
            <a
              href={`https://www.discogs.com/search/?q=${encodedLabel}&type=label`}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`Search ${data.label} on Discogs`}
            >
              <ExternalLink size={14} aria-hidden='true' /> Discogs
            </a>
          </div>
        </div>
      </div>

      <div className='detail-page-stats-row label-detail-stats'>
        {(
          [
            ['This Week', data.periodCounts.thisWeek],
            ['This Month', data.periodCounts.thisMonth],
            ['This Year', data.periodCounts.thisYear],
            ['All Time', data.periodCounts.allTime],
          ] as const
        ).map(([name, value]) => (
          <div key={name} className='detail-page-stat-card'>
            <div className='stat-label'>{name}</div>
            <div className='stat-value'>{value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <PlayTrendChart
        data={data.playTrend}
        periodLabel={trendPeriod}
        onPeriodChange={handlePeriodChange}
        loading={loading}
      />

      <div className='label-detail-grid'>
        <section className='detail-page-section' aria-label='Top artists'>
          <h3>Top Artists</h3>
          <ol className='label-detail-list'>
            {data.topArtists.map(artist => (
              <li key={artist.artist} className='label-detail-row'>
                <span className='label-detail-name'>
                  <ArtistLink artist={artist.artist} />
                  <span className='label-detail-sub'>
                    {plural(artist.albumCount, 'album')}
                  </span>
                </span>
                <span className='label-detail-count'>
                  {artist.playCount.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className='detail-page-section' aria-label='Top albums'>
          <h3>Top Albums</h3>
          <ol className='label-detail-list'>
            {data.topAlbums.map(album => (
              <li
                key={`${album.artist}|${album.album}`}
                className='label-detail-row'
              >
                {album.coverUrl ? (
                  <img
                    className='label-detail-cover'
                    src={album.coverUrl}
                    alt=''
                    loading='lazy'
                  />
                ) : (
                  <span className='label-detail-cover' aria-hidden='true' />
                )}
                <span className='label-detail-name'>
                  <AlbumLink artist={album.artist} album={album.album} />
                  <span className='label-detail-sub'>
                    <ArtistLink artist={album.artist} />{' '}
                    <Badge
                      variant={album.owned ? 'success' : 'default'}
                      size='small'
                    >
                      {SOURCE_NAMES[album.source]}
                    </Badge>
                  </span>
                </span>
                <span className='label-detail-count'>
                  {album.playCount.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className='detail-page-section' aria-label='Top tracks'>
          <h3>Top Tracks</h3>
          <ol className='label-detail-list'>
            {data.topTracks.map(track => (
              <li
                key={`${track.artist}|${track.album}|${track.track}`}
                className='label-detail-row'
              >
                <span className='label-detail-name'>
                  <TrackLink
                    artist={track.artist}
                    track={track.track}
                    album={track.album}
                  />
                  <span className='label-detail-sub'>
                    {track.artist} &middot; {track.album}
                  </span>
                </span>
                <span className='label-detail-count'>
                  {track.playCount.toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {data.unplayedCopies.length > 0 && (
        <section
          className='detail-page-section'
          aria-label='On the shelf, never played'
        >
          <h3>On the Shelf, Never Played</h3>
          <ul className='label-detail-unplayed'>
            {data.unplayedCopies.map(copy => (
              <li key={copy.releaseId}>
                <AlbumLink artist={copy.artist} album={copy.album} />{' '}
                <span className='label-detail-sub'>{copy.artist}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default LabelDetailPage;
