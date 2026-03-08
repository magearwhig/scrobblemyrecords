import React, { useState, useEffect, useCallback, useMemo } from 'react';

import './TrackDetailPage.page.css';

import { TrackDetailResponse } from '../../shared/types';
import ArtistLink from '../components/ArtistLink';
import PlayTrendChart from '../components/PlayTrendChart';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { ROUTES, navigate } from '../routes';
import { statsApi } from '../services/statsApi';
import { formatLocalDateOnly, formatRelativeTime } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';
import { playTrackOnSpotify } from '../utils/spotifyUtils';

const logger = createLogger('TrackDetailPage');

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
  [ROUTES.ARTIST_DETAIL]: 'Artist',
};

/**
 * Strip Discogs disambiguation suffix like " (2)" from artist names
 * for use in Last.fm URLs where the suffix is not valid.
 */
const stripDisambiguation = (name: string): string =>
  name.replace(/\s+\(\d+\)$/, '');

/** Track identification stored in localStorage by TrackLink navigation. */
interface SelectedTrackInfo {
  artist: string;
  track: string;
  album?: string;
}

/**
 * Track detail page showing play count, trend chart, and album appearances.
 * Reads track info from localStorage ('selectedTrack') as JSON,
 * set by TrackLink navigation.
 */
const TrackDetailPage: React.FC = () => {
  const [trackData, setTrackData] = useState<TrackDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [trendPeriod, setTrendPeriod] = useState<'month' | 'week'>('month');

  // Read track info from localStorage (set by TrackLink or other navigation)
  const trackInfo = useMemo<SelectedTrackInfo | null>(() => {
    const trackInfoStr = localStorage.getItem('selectedTrack');
    if (!trackInfoStr) return null;
    try {
      return JSON.parse(trackInfoStr) as SelectedTrackInfo;
    } catch (err) {
      logger.error('Failed to parse selectedTrack from localStorage', err);
      return null;
    }
  }, []);

  const fetchTrackDetail = useCallback(
    async (signal: AbortSignal) => {
      if (!trackInfo) {
        setLoading(false);
        setError('No track selected');
        return;
      }

      try {
        setLoading(true);
        setError('');
        const response = await statsApi.getTrackDetail(
          trackInfo.artist,
          trackInfo.track,
          trackInfo.album,
          trendPeriod
        );

        if (signal.aborted) return;

        if (response.success && response.data) {
          setTrackData(response.data);
        } else {
          setError(response.error || 'Failed to load track data');
        }
      } catch (err) {
        if (signal.aborted) return;
        logger.error('Failed to fetch track detail', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [trackInfo, trendPeriod]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchTrackDetail(controller.signal);
    return () => controller.abort();
  }, [fetchTrackDetail]);

  /** The page to navigate back to — derived from `?from=` URL param. */
  const previousPage = useMemo(() => {
    const hash = window.location.hash.replace('#', '');
    const query = hash.includes('?') ? hash.split('?')[1] : '';
    return new URLSearchParams(query).get('from') || ROUTES.STATS;
  }, []);

  const backLabel = useMemo(() => {
    const pageName = PAGE_NAMES[previousPage] || 'Stats';
    return `Back to ${pageName}`;
  }, [previousPage]);

  const handleBack = useCallback(() => {
    navigate(previousPage);
  }, [previousPage]);

  const handleSpotifyPlay = useCallback(() => {
    if (trackInfo) {
      playTrackOnSpotify(trackInfo.artist, trackInfo.track, trackInfo.album);
    }
  }, [trackInfo]);

  const firstPlayedDisplay = useMemo(() => {
    if (!trackData?.firstPlayed) return null;
    return formatLocalDateOnly(trackData.firstPlayed * 1000);
  }, [trackData?.firstPlayed]);

  const lastPlayedDisplay = useMemo(() => {
    if (!trackData?.lastPlayed) return null;
    return formatRelativeTime(trackData.lastPlayed);
  }, [trackData?.lastPlayed]);

  /** Artist name with Discogs disambiguation stripped for external links */
  const cleanArtistName = useMemo(() => {
    if (!trackInfo) return '';
    return stripDisambiguation(trackInfo.artist);
  }, [trackInfo]);

  // Loading state
  if (loading) {
    return (
      <div className='detail-page'>
        <button
          className='detail-page-back-link'
          onClick={handleBack}
          aria-label={backLabel}
        >
          &larr; {backLabel}
        </button>
        <div className='detail-page-header'>
          <div className='detail-page-info'>
            <Skeleton variant='text' width={300} height={32} />
            <Skeleton variant='text' width={200} height={20} />
            <Skeleton variant='text' width={250} height={16} />
          </div>
        </div>
        <Skeleton variant='rectangular' width='100%' height={250} />
      </div>
    );
  }

  // Error / no track selected
  if (error || !trackInfo) {
    return (
      <div className='detail-page'>
        <button
          className='detail-page-back-link'
          onClick={handleBack}
          aria-label={backLabel}
        >
          &larr; {backLabel}
        </button>
        <EmptyState
          title='Track Not Found'
          description={
            error ||
            'No track was selected. Please navigate here from a track list.'
          }
          actions={[
            {
              label: backLabel,
              onClick: handleBack,
              variant: 'primary',
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className='detail-page'>
      <button
        className='detail-page-back-link'
        onClick={handleBack}
        aria-label={backLabel}
      >
        &larr; {backLabel}
      </button>

      {/* Header */}
      <div className='detail-page-header'>
        <div className='detail-page-info'>
          <h1 className='detail-page-title'>{trackInfo.track}</h1>
          <p className='detail-page-meta'>
            by <ArtistLink artist={trackInfo.artist} />
          </p>
          {trackData && (
            <p className='detail-page-meta'>
              {trackData.totalPlayCount.toLocaleString()} total plays
              {firstPlayedDisplay && (
                <> &middot; First played: {firstPlayedDisplay}</>
              )}
              {lastPlayedDisplay && (
                <> &middot; Last played: {lastPlayedDisplay}</>
              )}
            </p>
          )}

          {/* External Links */}
          <div className='detail-page-external-links'>
            <button
              className='detail-page-external-link-btn'
              onClick={handleSpotifyPlay}
              aria-label={`Play ${trackInfo.track} on Spotify`}
            >
              &#9654; Play on Spotify
            </button>
            <a
              href={`https://www.last.fm/music/${encodeURIComponent(cleanArtistName)}/_/${encodeURIComponent(trackInfo.track)}`}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`View ${trackInfo.track} on Last.fm`}
            >
              &#8599; Last.fm
            </a>
            <a
              href={`https://www.discogs.com/search/?q=${encodeURIComponent(trackInfo.artist)}&type=all`}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`Search ${trackInfo.track} on Discogs`}
            >
              &#8599; Discogs
            </a>
          </div>
        </div>
      </div>

      {/* Play Trend Chart */}
      {trackData && (
        <div className='detail-page-section'>
          <PlayTrendChart
            data={trackData.playTrend}
            periodLabel={trendPeriod}
            onPeriodChange={setTrendPeriod}
          />
        </div>
      )}

      {/* Appears On */}
      {trackData && trackData.appearsOn.length > 0 && (
        <div className='detail-page-section'>
          <h3>Appears On</h3>
          <div className='detail-page-appears-on'>
            {trackData.appearsOn.map((album, index) => (
              <div
                key={`${album.album}-${index}`}
                className='detail-page-album-item'
              >
                {album.coverUrl ? (
                  <img
                    className='detail-page-album-cover'
                    src={album.coverUrl}
                    alt={`${album.album} cover`}
                    loading='lazy'
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
                  <span className='detail-page-album-name'>{album.album}</span>
                  <span className='detail-page-album-meta'>
                    {album.artist} &middot; {album.playCount.toLocaleString()}{' '}
                    plays
                  </span>
                </div>
                {album.inCollection && (
                  <Badge variant='success' size='small'>
                    In Collection
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackDetailPage;
