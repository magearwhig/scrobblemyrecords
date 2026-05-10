import { ExternalLink, Disc3, Play, Library } from 'lucide-react';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

import './AlbumDetailPage.page.css';

import { AlbumDetailResponse } from '../../shared/types';
import ArtistLink from '../components/ArtistLink';
import { AlbumListeningArc } from '../components/stats/AlbumListeningArc';
import TrackLink from '../components/TrackLink';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { ROUTES, navigate } from '../routes';
import { statsApi } from '../services/statsApi';
import { formatLocalDateOnly, formatRelativeTime } from '../utils/dateUtils';
import { createLogger } from '../utils/logger';
import { playAlbumOnSpotify } from '../utils/spotifyUtils';

const logger = createLogger('AlbumDetailPage');

/** Page name mapping for back navigation label. */
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
  [ROUTES.TRACK_DETAIL]: 'Track',
};

/**
 * Strip Discogs disambiguation suffix like " (2)" from artist names
 * for use in Last.fm URLs where the suffix is not valid.
 */
const stripDisambiguation = (name: string): string =>
  name.replace(/\s+\(\d+\)$/, '');

/** Album identification stored in localStorage by AlbumLink navigation. */
interface SelectedAlbumInfo {
  artist: string;
  album: string;
}

/**
 * Album detail page showing play stats, tracks, listening arc, and any
 * surfaced mappings (album / artist / compound). Reads the selected album
 * from `localStorage('selectedAlbum')` (JSON `{ artist, album }`) set by
 * `AlbumLink` navigation. Back navigation honours a `?from=` hash query
 * param, falling back to `#stats`.
 */
const AlbumDetailPage: React.FC = () => {
  const [data, setData] = useState<AlbumDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  /**
   * Album info parsed from localStorage. `null` if missing or malformed —
   * the page renders a friendly empty state in that case rather than crashing.
   */
  const albumInfo = useMemo<SelectedAlbumInfo | null>(() => {
    const raw = localStorage.getItem('selectedAlbum');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<SelectedAlbumInfo>;
      if (
        typeof parsed.artist !== 'string' ||
        typeof parsed.album !== 'string' ||
        !parsed.artist ||
        !parsed.album
      ) {
        return null;
      }
      return { artist: parsed.artist, album: parsed.album };
    } catch (err) {
      logger.error('Failed to parse selectedAlbum from localStorage', err);
      return null;
    }
  }, []);

  /** The page to navigate back to — derived from `?from=` URL param. */
  const previousPage = useMemo<string>(() => {
    const hash = window.location.hash.replace('#', '');
    const query = hash.includes('?') ? hash.split('?')[1] : '';
    return new URLSearchParams(query).get('from') || ROUTES.STATS;
  }, []);

  const backLabel = useMemo(() => {
    const pageName = PAGE_NAMES[previousPage] || 'Stats';
    return `Back to ${pageName}`;
  }, [previousPage]);

  const handleBackClick = useCallback(() => {
    navigate(previousPage);
  }, [previousPage]);

  const fetchAlbumDetail = useCallback(
    async (info: SelectedAlbumInfo, signal: AbortSignal) => {
      try {
        setLoading(true);
        setError('');
        const result = await statsApi.getAlbumDetail(info.artist, info.album);

        if (signal.aborted) return;

        if (result.success && result.data) {
          setData(result.data);
        } else {
          const message = result.error || 'Failed to load album details.';
          setError(message);
          logger.warn('Album detail fetch failed', {
            artist: info.artist,
            album: info.album,
          });
        }
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(message);
        logger.error('Error fetching album detail', {
          artist: info.artist,
          album: info.album,
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

  useEffect(() => {
    if (!albumInfo) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    fetchAlbumDetail(albumInfo, controller.signal);
    return () => controller.abort();
  }, [albumInfo, fetchAlbumDetail]);

  const firstPlayedDisplay = useMemo(() => {
    if (!data?.firstPlayed) return null;
    return formatLocalDateOnly(data.firstPlayed * 1000);
  }, [data?.firstPlayed]);

  const lastPlayedDisplay = useMemo(() => {
    if (!data?.lastPlayed) return null;
    return formatRelativeTime(data.lastPlayed);
  }, [data?.lastPlayed]);

  /**
   * Presentation-ready artist name. The resolver-derived `data.artist` is
   * the canonical key (often lowercased for compound artists), so when the
   * album is in the collection we prefer the proper-cased Discogs name for
   * any visible / aria / external-URL surface. Stays in sync with the
   * backend agent's downstream note #1.
   */
  const displayArtist = useMemo(() => {
    if (!data) return '';
    return data.inCollection && data.collectionArtist
      ? data.collectionArtist
      : data.artist;
  }, [data]);

  const cleanArtistName = useMemo(
    () => stripDisambiguation(displayArtist),
    [displayArtist]
  );

  const handleViewInCollection = useCallback(() => {
    if (!data?.collectionReleaseId) return;
    // ReleaseDetailsPage reads release info from localStorage, mirroring
    // the AlbumCard navigation pattern.
    localStorage.setItem(
      'selectedRelease',
      JSON.stringify({
        id: data.collectionReleaseId,
        artist: data.collectionArtist ?? data.artist,
        title: data.collectionAlbum ?? data.album,
      })
    );
    navigate(ROUTES.RELEASE_DETAILS, { from: 'album' });
  }, [data]);

  const handlePlayAlbum = useCallback(() => {
    if (!data) return;
    playAlbumOnSpotify(displayArtist, data.album);
  }, [data, displayArtist]);

  // ----- Loading state ---------------------------------------------------
  if (loading) {
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
          <Skeleton variant='rectangular' width={120} height={120} />
          <div className='detail-page-info'>
            <Skeleton variant='text' width={260} height={32} />
            <Skeleton variant='text' width={180} height={20} />
            <Skeleton variant='text' width={300} height={18} />
          </div>
        </div>
        <Skeleton variant='rectangular' width='100%' height={220} />
        <div className='album-detail-content-grid'>
          <Skeleton variant='rectangular' width='100%' height={300} />
          <Skeleton variant='rectangular' width='100%' height={300} />
        </div>
      </div>
    );
  }

  // ----- Empty state: no album selected ---------------------------------
  if (!albumInfo) {
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
          title='No album selected'
          description='Open an album from your stats, history, or an artist page to see its details here.'
          actions={[
            { label: backLabel, onClick: handleBackClick, variant: 'primary' },
          ]}
        />
      </div>
    );
  }

  // ----- Error state ----------------------------------------------------
  if (error || !data) {
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
          title='Could not load album'
          description={
            error || `No listening data available for "${albumInfo.album}".`
          }
          actions={[
            { label: backLabel, onClick: handleBackClick, variant: 'primary' },
          ]}
        />
      </div>
    );
  }

  const encodedAlbum = encodeURIComponent(data.album);
  const encodedCleanArtist = encodeURIComponent(cleanArtistName);
  const lastfmUrl = `https://www.last.fm/music/${encodedCleanArtist}/${encodedAlbum}`;

  const { mappings } = data;
  const hasAnyMappingCard =
    Boolean(mappings.albumMapping) ||
    Boolean(mappings.artistMapping) ||
    Boolean(mappings.compoundArtist) ||
    (Array.isArray(mappings.albumAliases) && mappings.albumAliases.length > 0);

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

      {/* Header: cover + album info */}
      <div className='detail-page-header album-detail-header'>
        {data.coverUrl ? (
          <img
            className='album-detail-cover'
            src={data.coverUrl}
            alt={`${data.album} cover`}
          />
        ) : (
          <div className='album-detail-cover-placeholder' aria-hidden='true'>
            <Disc3 size={48} aria-hidden='true' />
          </div>
        )}
        <div className='detail-page-info'>
          <h1 className='detail-page-title' title={data.album}>
            {data.album}
          </h1>
          <p className='detail-page-meta album-detail-artist-line'>
            by <ArtistLink artist={displayArtist} />
          </p>
          <p className='detail-page-meta'>
            {data.playCount.toLocaleString()}{' '}
            {data.playCount === 1 ? 'scrobble' : 'scrobbles'}
            {firstPlayedDisplay && (
              <> &middot; First played: {firstPlayedDisplay}</>
            )}
            {lastPlayedDisplay && (
              <> &middot; Last played: {lastPlayedDisplay}</>
            )}
          </p>

          <div className='album-detail-actions'>
            <Button
              variant='outline'
              size='small'
              onClick={handlePlayAlbum}
              iconLeft={<Play size={14} aria-hidden='true' />}
              aria-label={`Play ${data.album} on Spotify`}
            >
              Play on Spotify
            </Button>
            <a
              className='album-detail-external-link'
              href={lastfmUrl}
              target='_blank'
              rel='noopener noreferrer'
              aria-label={`View ${data.album} on Last.fm`}
            >
              <ExternalLink size={14} aria-hidden='true' /> Last.fm
            </a>
            {data.inCollection && data.collectionReleaseId && (
              <Button
                variant='secondary'
                size='small'
                onClick={handleViewInCollection}
                iconLeft={<Library size={14} aria-hidden='true' />}
              >
                View in Collection
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Listening Arc — full width, fetches its own data */}
      <section
        className='album-detail-arc-section'
        aria-label='Listening arc over time'
      >
        <AlbumListeningArc artist={data.artist} album={data.album} />
      </section>

      {/* Two-column content: Tracks | Mappings */}
      <div className='album-detail-content-grid'>
        {/* Tracks list */}
        <div className='detail-page-section'>
          <h3>Tracks</h3>
          {data.tracks.length === 0 ? (
            <p className='detail-page-meta'>
              No track-level scrobbles for this album yet.
            </p>
          ) : (
            <ul className='album-detail-tracks'>
              {data.tracks.map((t, index) => (
                <li
                  key={`${t.track}-${index}`}
                  className='album-detail-track-row'
                >
                  <span className='album-detail-track-rank'>{index + 1}.</span>
                  <span className='album-detail-track-name'>
                    <TrackLink
                      artist={displayArtist}
                      track={t.track}
                      album={data.album}
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

        {/* Mappings & Info */}
        <div className='album-detail-mappings-column'>
          {!hasAnyMappingCard && !data.inCollection && (
            <div className='detail-page-section'>
              <h3>Info</h3>
              <p className='detail-page-meta'>
                No special mappings or collection link for this album.
              </p>
            </div>
          )}

          {data.inCollection && (
            <div className='detail-page-section album-detail-mapping-card'>
              <h3>In Your Collection</h3>
              {data.collectionArtist && data.collectionAlbum && (
                <p className='detail-page-meta'>
                  Stored as{' '}
                  <strong>
                    {data.collectionArtist} &mdash; {data.collectionAlbum}
                  </strong>
                </p>
              )}
              {data.collectionReleaseId && (
                <Button
                  variant='outline'
                  size='small'
                  onClick={handleViewInCollection}
                  iconLeft={<Library size={14} aria-hidden='true' />}
                >
                  View Release Details
                </Button>
              )}
            </div>
          )}

          {mappings.albumMapping && (
            <div className='detail-page-section album-detail-mapping-card'>
              <h3>Album Mapping</h3>
              <p className='detail-page-meta'>
                This Last.fm album maps to a different name in your Discogs
                collection.
              </p>
              <dl className='album-detail-mapping-grid'>
                <dt>Last.fm</dt>
                <dd>
                  {mappings.albumMapping.historyArtist} &mdash;{' '}
                  {mappings.albumMapping.historyAlbum}
                </dd>
                <dt>Discogs</dt>
                <dd>
                  {mappings.albumMapping.collectionArtist} &mdash;{' '}
                  {mappings.albumMapping.collectionAlbum}
                </dd>
              </dl>
            </div>
          )}

          {mappings.artistMapping && (
            <div className='detail-page-section album-detail-mapping-card'>
              <h3>Artist Mapping</h3>
              <p className='detail-page-meta'>
                Discogs artist name is mapped to a different Last.fm name.
              </p>
              <dl className='album-detail-mapping-grid'>
                <dt>Discogs</dt>
                <dd>{mappings.artistMapping.discogsName}</dd>
                <dt>Last.fm</dt>
                <dd>{mappings.artistMapping.lastfmName}</dd>
              </dl>
            </div>
          )}

          {mappings.compoundArtist && (
            <div className='detail-page-section album-detail-mapping-card'>
              <h3>Compound Artist</h3>
              <p className='detail-page-meta'>
                <strong>{mappings.compoundArtist.compoundName}</strong> is
                composed of:
              </p>
              <ul className='album-detail-component-list'>
                {mappings.compoundArtist.components.map(name => (
                  <li key={name}>
                    <ArtistLink artist={name} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(mappings.albumAliases) &&
            mappings.albumAliases.length > 0 && (
              <div className='detail-page-section album-detail-mapping-card'>
                <h3>Album Aliases</h3>
                <p className='detail-page-meta'>
                  Other album names treated as the same album.
                </p>
                <ul className='album-detail-alias-list'>
                  {mappings.albumAliases.map((alias, idx) => (
                    <li key={`${alias.aliasArtist}-${alias.aliasAlbum}-${idx}`}>
                      {alias.aliasArtist} &mdash; {alias.aliasAlbum}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AlbumDetailPage;
