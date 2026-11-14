import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlbumPlayCount,
  ArtistPlayCount,
  CollectionItem,
  DateRange,
  LabelPlayCount,
  TrackPlayCount,
} from '../../../shared/types';
import { navigate, ROUTES } from '../../routes';
import { getApiService } from '../../services/api';
import { imagesApi, statsApi } from '../../services/statsApi';
import { createLogger } from '../../utils/logger';

import { Period, PeriodSelector } from './PeriodSelector';
import { RankingsOverTime } from './RankingsOverTime';
import { TopList } from './TopList';
import './StatsRankings.css';

const logger = createLogger('StatsRankings');

const LIST_LENGTH = 10;

type Subject = 'albums' | 'labels' | 'artists' | 'tracks';

const SUBJECTS: Array<{ value: Subject; label: string }> = [
  { value: 'albums', label: 'Albums' },
  { value: 'labels', label: 'Labels' },
  { value: 'artists', label: 'Artists' },
  { value: 'tracks', label: 'Tracks' },
];

interface StatsRankingsProps {
  collectionMap?: Map<string, CollectionItem>;
  collectionArtistCounts?: Map<string, number>;
  collectionArtistCovers?: Map<string, string>;
}

/** Album covers from the batch image endpoint, keyed lowercase */
async function withAlbumCovers(
  albums: AlbumPlayCount[]
): Promise<AlbumPlayCount[]> {
  if (albums.length === 0) return albums;
  try {
    const res = await imagesApi.batchGetAlbumCovers(
      albums.map(a => ({ artist: a.artist, album: a.album }))
    );
    if (res.success && res.data) {
      return albums.map(album => {
        const key = `${album.artist.toLowerCase().trim()}|${album.album.toLowerCase().trim()}`;
        const coverUrl = res.data![key];
        return coverUrl ? { ...album, coverUrl } : album;
      });
    }
  } catch (err) {
    logger.error('Failed to fetch album images', err);
  }
  return albums;
}

/** Artist photos from the batch image endpoint, keyed lowercase */
async function withArtistImages(
  artists: ArtistPlayCount[]
): Promise<ArtistPlayCount[]> {
  if (artists.length === 0) return artists;
  try {
    const res = await imagesApi.batchGetArtistImages(
      artists.map(a => a.artist)
    );
    if (res.success && res.data) {
      return artists.map(artist => {
        const imageUrl = res.data![artist.artist.toLowerCase().trim()];
        return imageUrl ? { ...artist, imageUrl } : artist;
      });
    }
  } catch (err) {
    logger.error('Failed to fetch artist images', err);
  }
  return artists;
}

/**
 * The Stats page's rankings: top albums, labels, artists and tracks for one
 * period, chosen once for all four. On a narrow screen one list shows at a
 * time. Rankings over time sit behind a button, so their data only loads
 * when asked for.
 */
export const StatsRankings: React.FC<StatsRankingsProps> = ({
  collectionMap,
  collectionArtistCounts,
  collectionArtistCovers,
}) => {
  const [period, setPeriod] = useState<Period>('month');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [subject, setSubject] = useState<Subject>('albums');
  const [albums, setAlbums] = useState<AlbumPlayCount[]>([]);
  const [labels, setLabels] = useState<LabelPlayCount[]>([]);
  const [artists, setArtists] = useState<ArtistPlayCount[]>([]);
  const [tracks, setTracks] = useState<TrackPlayCount[]>([]);
  const [loading, setLoading] = useState<Record<Subject, boolean>>({
    albums: true,
    labels: true,
    artists: true,
    tracks: true,
  });
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [showOverTime, setShowOverTime] = useState(false);

  // Only the newest period's answers are shown, so a slow earlier request
  // can't replace them
  const generation = useRef(0);

  const load = useCallback((next: Period, range?: DateRange) => {
    const request = ++generation.current;
    const current = () => request === generation.current;
    setLoading({ albums: true, labels: true, artists: true, tracks: true });
    const done = (which: Subject) => {
      if (current()) setLoading(prev => ({ ...prev, [which]: false }));
    };
    const fail = (which: Subject) => (err: unknown) => {
      logger.error(`Failed to load top ${which}`, err);
    };

    statsApi
      .getTopAlbums(next, LIST_LENGTH, range)
      .then(res => {
        if (!current() || !res.success || !res.data) return;
        setAlbums(res.data);
        void withAlbumCovers(res.data).then(withCovers => {
          if (current()) setAlbums(withCovers);
        });
      })
      .catch(fail('albums'))
      .finally(() => done('albums'));
    statsApi
      .getTopLabels(next, LIST_LENGTH, range)
      .then(res => {
        if (current() && res.success && res.data) setLabels(res.data);
      })
      .catch(fail('labels'))
      .finally(() => done('labels'));
    statsApi
      .getTopArtists(next, LIST_LENGTH, range)
      .then(res => {
        if (!current() || !res.success || !res.data) return;
        setArtists(res.data);
        void withArtistImages(res.data).then(withImages => {
          if (current()) setArtists(withImages);
        });
      })
      .catch(fail('artists'))
      .finally(() => done('artists'));
    statsApi
      .getTopTracks(next, LIST_LENGTH, range)
      .then(res => {
        if (current() && res.success && res.data) setTracks(res.data);
      })
      .catch(fail('tracks'))
      .finally(() => done('tracks'));
  }, []);

  useEffect(() => {
    const requests = generation;
    load('month');
    return () => {
      // Unmounting: ignore whatever is still on its way
      requests.current++;
    };
  }, [load]);

  // Plays without album info, noted under the lists
  useEffect(() => {
    Promise.resolve()
      .then(() => getApiService().getUnresolvedHistorySummary())
      .then(summary => setUnresolvedCount(summary?.unresolvedCount ?? 0))
      .catch((err: unknown) => {
        logger.warn('Failed to load unresolved history summary', err);
      });
  }, []);

  const handlePeriodChange = useCallback(
    (next: Period, range?: DateRange) => {
      setPeriod(next);
      setDateRange(range);
      load(next, range);
    },
    [load]
  );

  const listClass = (which: Subject) =>
    `stats-rankings-list${subject === which ? ' stats-rankings-list--active' : ''}`;

  return (
    <section className='stats-rankings' aria-labelledby='stats-rankings-title'>
      <div className='stats-rankings-header'>
        <h2 id='stats-rankings-title'>Rankings</h2>
        <div className='stats-rankings-controls'>
          <label className='stats-rankings-subject'>
            <span className='sr-only'>List to show</span>
            <select
              aria-label='List to show'
              value={subject}
              onChange={e => setSubject(e.target.value as Subject)}
            >
              {SUBJECTS.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <PeriodSelector
            currentPeriod={period}
            onPeriodChange={handlePeriodChange}
            customDateRange={dateRange}
            label='Rankings period'
          />
        </div>
      </div>

      <div className='stats-rankings-grid'>
        <div className={listClass('albums')}>
          <TopList
            title='Top Albums'
            type='albums'
            data={albums}
            loading={loading.albums}
            collectionMap={collectionMap}
          />
        </div>
        <div className={listClass('labels')}>
          <TopList
            title='Top Labels'
            type='labels'
            data={labels}
            loading={loading.labels}
          />
        </div>
        <div className={listClass('artists')}>
          <TopList
            title='Top Artists'
            type='artists'
            data={artists}
            loading={loading.artists}
            collectionArtistCounts={collectionArtistCounts}
            collectionArtistCovers={collectionArtistCovers}
          />
        </div>
        <div className={listClass('tracks')}>
          <TopList
            title='Top Tracks'
            type='tracks'
            data={tracks}
            loading={loading.tracks}
          />
        </div>
      </div>

      {unresolvedCount > 0 && (
        <p className='stats-unresolved-note'>
          <Info size={16} aria-hidden='true' />
          <span>
            {unresolvedCount.toLocaleString()}{' '}
            {unresolvedCount === 1 ? 'play' : 'plays'} without album info{' '}
            {unresolvedCount === 1 ? 'is' : 'are'} excluded from album stats.
          </span>
          <button
            type='button'
            className='stats-unresolved-note-link'
            onClick={() => navigate(ROUTES.HISTORY, { tab: 'unresolved' })}
          >
            Review them
          </button>
        </p>
      )}

      <button
        type='button'
        className='stats-rankings-over-time-toggle'
        aria-expanded={showOverTime}
        onClick={() => setShowOverTime(show => !show)}
      >
        {showOverTime ? (
          <ChevronUp size={16} aria-hidden='true' />
        ) : (
          <ChevronDown size={16} aria-hidden='true' />
        )}
        {showOverTime ? 'Hide rankings over time' : 'Show rankings over time'}
      </button>
      {showOverTime && <RankingsOverTime />}
    </section>
  );
};

export default StatsRankings;
