import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { ArtistDetailResponse } from '../../shared/types';
import PlayTrendChart from '../components/PlayTrendChart';
import TrackLink from '../components/TrackLink';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { ROUTES } from '../routes';
import { statsApi, imagesApi } from '../services/statsApi';
import { formatLocalDateOnly, formatRelativeTime } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';
import { playAlbumOnSpotify, playTrackOnSpotify } from '../utils/spotifyUtils';

const logger = createLogger('ArtistDetailPage');

/** Page name mapping for back navigation label */
const PAGE_NAMES: Record<string, string> = {
  [ROUTES.HOME]: 'Dashboard',
  [ROUTES.STATS]: 'Stats',
  [ROUTES.HISTORY]: 'History',
  [ROUTES.COLLECTION]: 'Collection',
  [ROUTES.DISCOVERY]: 'Discovery',
  [ROUTES.DISCARD_PILE]: 'Discard Pile',
  [ROUTES.WHAT_TO_PLAY]: 'What to Play',
  [ROUTES.WRAPPED]: 'Wrapped',
  [ROUTES.TRACK_DETAIL]: 'Track',
};

/**
 * Strip Discogs disambiguation suffix like " (2)" from artist names
 * for use in Last.fm URLs where the suffix is not valid.
 */
const stripDisambiguation = (name: string): string =>
  name.replace(/\s+\(\d+\)$/, '');

/**
 * Artist detail page showing play stats, top tracks, albums, and trend chart.
 * Reads the selected artist name from localStorage ('selectedArtist'),
 * set by ArtistLink navigation.
 */
const ArtistDetailPage: React.FC = () => {
  const [artistName, setArtistName] = useState<string>('');
  const [data, setData] = useState<ArtistDetailResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [trendPeriod, setTrendPeriod] = useState<'month' | 'week'>('month');
  const [previousPage, setPreviousPage] = useState<string>('');

  const fetchArtistData = useCallback(
    async (name: string, period: 'month' | 'week', signal: AbortSignal) => {
      try {
        setLoading(true);
        setError('');

        const result = await statsApi.getArtistDetail(name, period);

        if (signal.aborted) return;

        if (result.success && result.data) {
          setData(result.data);
        } else {
          setError('Failed to load artist data.');
          logger.warn('Artist detail fetch failed', { artist: name });
        }
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(message);
        logger.error('Error fetching artist detail', {
          artist: name,
          error: message,
        });
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  const fetchArtistImage = useCallback(
    async (name: string, signal: AbortSignal) => {
      try {
        const result = await imagesApi.getArtistImage(name);

        if (signal.aborted) return;

        if (result.success && result.data?.url) {
          setImageUrl(result.data.url);
        }
      } catch {
        if (signal.aborted) return;
        logger.warn('Failed to fetch artist image', { artist: name });
      }
    },
    []
  );

  // Load artist name from localStorage on mount
  useEffect(() => {
    const storedArtist = localStorage.getItem('selectedArtist');
    const storedPreviousPage = localStorage.getItem('previousPage') || '';
    setPreviousPage(storedPreviousPage);

    if (!storedArtist) {
      setError('No artist selected. Please go back and select an artist.');
      setLoading(false);
      return;
    }

    setArtistName(storedArtist);

    const controller = new AbortController();
    fetchArtistData(storedArtist, trendPeriod, controller.signal);
    fetchArtistImage(storedArtist, controller.signal);

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when trend period changes
  const handlePeriodChange = useCallback(
    (period: 'month' | 'week') => {
      setTrendPeriod(period);
      if (!artistName) return;

      const controller = new AbortController();
      fetchArtistData(artistName, period, controller.signal);
    },
    [artistName, fetchArtistData]
  );

  const handleBackClick = useCallback(() => {
    if (previousPage) {
      window.location.hash = `#${previousPage}`;
    } else {
      window.location.hash = `#${ROUTES.STATS}`;
    }
  }, [previousPage]);

  const backLabel = useMemo(() => {
    const pageName = PAGE_NAMES[previousPage] || 'Stats';
    return `Back to ${pageName}`;
  }, [previousPage]);

  const firstPlayedDisplay = useMemo(() => {
    if (!data?.firstPlayed) return null;
    return formatLocalDateOnly(data.firstPlayed * 1000);
  }, [data?.firstPlayed]);

  const lastPlayedDisplay = useMemo(() => {
    if (!data?.lastPlayed) return null;
    return formatRelativeTime(data.lastPlayed);
  }, [data?.lastPlayed]);

  /** Artist name with Discogs disambiguation stripped for external links */
  const cleanArtistName = useMemo(() => {
    if (!data) return '';
    return stripDisambiguation(data.artist);
  }, [data]);

  // Loading state
  if (loading && !data) {
    return (
      <div className='detail-page'>
        <button
          className='detail-page-back-link'
          onClick={handleBackClick}
          aria-label={backLabel}
        >
          &larr; {backLabel}
        </button>
        <div className='detail-page-header'>
          <Skeleton variant='circular' width={80} height={80} />
          <div className='detail-page-info'>
            <Skeleton variant='text' width={200} height={32} />
            <Skeleton variant='text' width={300} height={18} />
            <Skeleton variant='text' width={250} height={18} />
          </div>
        </div>
        <Skeleton variant='rectangular' width='100%' height={250} />
        <div className='detail-page-content'>
          <div className='detail-page-section'>
            <Skeleton variant='text' width={120} height={20} />
            <Skeleton variant='rectangular' width='100%' height={200} />
          </div>
          <div className='detail-page-section'>
            <Skeleton variant='text' width={120} height={20} />
            <Skeleton variant='rectangular' width='100%' height={200} />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className='detail-page'>
        <button
          className='detail-page-back-link'
          onClick={handleBackClick}
          aria-label={backLabel}
        >
          &larr; {backLabel}
        </button>
        <EmptyState
          title='Could not load artist'
          description={error}
          actions={[
            {
              label: backLabel,
              onClick: handleBackClick,
              variant: 'primary',
            },
          ]}
        />
      </div>
    );
  }

  // No data state
  if (!data) {
    return (
      <div className='detail-page'>
        <button
          className='detail-page-back-link'
          onClick={handleBackClick}
          aria-label={backLabel}
        >
          &larr; {backLabel}
        </button>
        <EmptyState
          title='No data found'
          description={`No listening data available for "${artistName}".`}
          actions={[
            {
              label: backLabel,
              onClick: handleBackClick,
              variant: 'primary',
            },
          ]}
        />
      </div>
    );
  }

  const encodedArtist = encodeURIComponent(data.artist);
  const encodedCleanArtist = encodeURIComponent(cleanArtistName);

  return (
    <div className='detail-page'>
      {/* Back navigation */}
      <button
        className='detail-page-back-link'
        onClick={handleBackClick}
        aria-label={backLabel}
      >
        &larr; {backLabel}
      </button>

      {/* Header: image + artist info */}
      <div className='detail-page-header'>
        {imageUrl ? (
          <img className='detail-page-image' src={imageUrl} alt={data.artist} />
        ) : (
          <div className='detail-page-image-placeholder' aria-hidden='true'>
            &#9835;
          </div>
        )}
        <div className='detail-page-info'>
          <h1 className='detail-page-title'>{data.artist}</h1>
          <p className='detail-page-meta'>
            {data.totalPlayCount.toLocaleString()} total scrobbles
            {firstPlayedDisplay && (
              <> &middot; First played: {firstPlayedDisplay}</>
            )}
            {lastPlayedDisplay && (
              <> &middot; Last played: {lastPlayedDisplay}</>
            )}
          </p>
          <div className='detail-page-external-links'>
            <a
              href={`https://open.spotify.com/search/${encodedArtist}`}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`Search ${data.artist} on Spotify`}
            >
              &#9654; Play on Spotify
            </a>
            <a
              href={`https://www.last.fm/music/${encodedCleanArtist}`}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`View ${data.artist} on Last.fm`}
            >
              &#8599; Last.fm
            </a>
            <a
              href={`https://www.discogs.com/search/?q=${encodedArtist}&type=artist`}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`Search ${data.artist} on Discogs`}
            >
              &#8599; Discogs
            </a>
          </div>
        </div>
      </div>

      {/* Play Trend Chart */}
      <PlayTrendChart
        data={data.playTrend}
        periodLabel={trendPeriod}
        onPeriodChange={handlePeriodChange}
        loading={loading}
      />

      {/* Two-column content: Top Tracks | Albums */}
      <div className='detail-page-content'>
        {/* Top Tracks */}
        <div className='detail-page-section'>
          <h3>Top Tracks</h3>
          {data.topTracks.length === 0 ? (
            <p className='detail-page-meta'>No track data available.</p>
          ) : (
            <ul className='detail-page-top-tracks'>
              {data.topTracks.map((track, index) => (
                <li
                  key={`${track.track}-${track.album}`}
                  className='detail-page-track-item'
                >
                  <span className='detail-page-track-rank'>{index + 1}.</span>
                  <span className='detail-page-track-name'>
                    <TrackLink
                      artist={data.artist}
                      track={track.track}
                      album={track.album}
                    />
                  </span>
                  <span className='detail-page-track-count'>
                    {track.playCount.toLocaleString()}
                  </span>
                  <button
                    className='btn btn-small btn-icon'
                    onClick={() =>
                      playTrackOnSpotify(data.artist, track.track, track.album)
                    }
                    aria-label={`Play ${track.track} on Spotify`}
                    title={`Play ${track.track} on Spotify`}
                  >
                    &#9654;
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Albums */}
        <div className='detail-page-section'>
          <h3>Albums</h3>
          {data.albums.length === 0 ? (
            <p className='detail-page-meta'>No album data available.</p>
          ) : (
            <div className='detail-page-albums'>
              {data.albums.map(album => (
                <div key={album.album} className='detail-page-album-item'>
                  {album.coverUrl ? (
                    <img
                      className='detail-page-album-cover'
                      src={album.coverUrl}
                      alt={album.album}
                    />
                  ) : (
                    <div
                      className='detail-page-album-cover-placeholder'
                      aria-hidden='true'
                    >
                      &#9835;
                    </div>
                  )}
                  <div className='detail-page-album-info'>
                    <div className='detail-page-album-name'>{album.album}</div>
                    <div className='detail-page-album-meta'>
                      {album.playCount.toLocaleString()} plays
                      {album.inCollection && (
                        <>
                          {' '}
                          <Badge variant='success' size='small'>
                            In Collection
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    className='btn btn-small btn-icon'
                    onClick={() => playAlbumOnSpotify(data.artist, album.album)}
                    aria-label={`Play ${album.album} on Spotify`}
                    title={`Play ${album.album} on Spotify`}
                  >
                    &#9654;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Listening Stats */}
      <div className='detail-page-section'>
        <h3>Listening Stats</h3>
        <div className='detail-page-stats-row'>
          <div className='detail-page-stat-card'>
            <div className='stat-label'>This Week</div>
            <div className='stat-value'>
              {data.periodCounts.thisWeek.toLocaleString()}
            </div>
          </div>
          <div className='detail-page-stat-card'>
            <div className='stat-label'>This Month</div>
            <div className='stat-value'>
              {data.periodCounts.thisMonth.toLocaleString()}
            </div>
          </div>
          <div className='detail-page-stat-card'>
            <div className='stat-label'>This Year</div>
            <div className='stat-value'>
              {data.periodCounts.thisYear.toLocaleString()}
            </div>
          </div>
          <div className='detail-page-stat-card'>
            <div className='stat-label'>All Time</div>
            <div className='stat-value'>
              {data.periodCounts.allTime.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArtistDetailPage;
