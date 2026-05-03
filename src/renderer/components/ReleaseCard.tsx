import { ExternalLink } from 'lucide-react';
import React from 'react';

import { TrackedRelease } from '../../shared/types';

import ArtistLink from './ArtistLink';
import { Button, IconButton } from './ui/Button';

interface ReleaseCardProps {
  release: TrackedRelease;
  formatReleaseDate: (dateStr: string | null) => string;
  getVinylBadge: (status: TrackedRelease['vinylStatus']) => React.ReactNode;
  onCheckVinyl: (mbid: string, title: string) => void;
  onAddToWishlist: (mbid: string, title: string) => void;
  onHide: (release: TrackedRelease) => void;
  onExcludeArtist: (artistName: string, artistMbid: string) => void;
  /**
   * For reissues, the original release-group's first-release date (looked up
   * by `releaseGroupMbid` from sibling tracked entries). When present, the
   * card shows it next to the reissue date so the user can see "originally
   * 2003 — repressed 2026" at a glance.
   */
  originalReleaseDate?: string | null;
}

const ReleaseCard: React.FC<ReleaseCardProps> = ({
  release,
  formatReleaseDate,
  getVinylBadge,
  onCheckVinyl,
  onAddToWishlist,
  onHide,
  onExcludeArtist,
  originalReleaseDate,
}) => {
  const showOriginalDate =
    release.isReissue &&
    !!originalReleaseDate &&
    originalReleaseDate !== release.releaseDate;
  return (
    <div className={`release-card ${release.isUpcoming ? 'upcoming' : ''}`}>
      <div className='release-cover'>
        {release.coverArtUrl ? (
          <img src={release.coverArtUrl} alt={release.title} loading='lazy' />
        ) : (
          <div className='no-cover'>
            <span>No Cover</span>
          </div>
        )}
        {release.isUpcoming && <div className='upcoming-badge'>Upcoming</div>}
      </div>

      <div className='release-info'>
        <h3 className='release-title' title={release.title}>
          {release.title}
        </h3>
        <p className='release-artist' title={release.artistName}>
          <ArtistLink artist={release.artistName} />
        </p>
        <p className='release-date'>
          {showOriginalDate ? (
            <>
              <span
                className='release-date-original'
                title='Original release-group first-release date'
              >
                Orig. {formatReleaseDate(originalReleaseDate ?? null)}
              </span>
              <span className='release-date-separator' aria-hidden='true'>
                {' '}
                →{' '}
              </span>
              <span
                className='release-date-reissue'
                title='Reissue / pressing date'
              >
                Reissue {formatReleaseDate(release.releaseDate)}
              </span>
            </>
          ) : (
            formatReleaseDate(release.releaseDate)
          )}
        </p>
        {release.isReissue && (release.labelName || release.country) && (
          <p
            className='release-reissue-meta'
            title='Reissue / repressing details from MusicBrainz'
          >
            {release.labelName ?? ''}
            {release.labelName && release.country ? ' · ' : ''}
            {release.country ?? ''}
          </p>
        )}
        <div className='release-type'>
          <span className='badge badge-type'>{release.releaseType}</span>
          {release.isReissue && (
            <span
              className='badge badge-info'
              title='New pressing of an older release group'
            >
              Reissue
            </span>
          )}
          {getVinylBadge(release.vinylStatus)}
        </div>

        {release.vinylPriceRange && (
          <p className='price-range'>
            ${release.vinylPriceRange.min.toFixed(2)} - $
            {release.vinylPriceRange.max.toFixed(2)}{' '}
            {release.vinylPriceRange.currency}
          </p>
        )}

        <div className='release-actions'>
          {(release.vinylStatus === 'unknown' ||
            release.vinylStatus === 'not-found') && (
            <Button
              variant='secondary'
              size='small'
              onClick={() => onCheckVinyl(release.mbid, release.title)}
            >
              Check Vinyl
            </Button>
          )}
          {release.vinylStatus === 'checking' && (
            <span className='checking-status'>Checking...</span>
          )}
          <a
            href={
              release.discogsUrl ||
              `https://www.discogs.com/search/?q=${encodeURIComponent(`${release.artistName} ${release.title}`)}&type=release`
            }
            target='_blank'
            rel='noopener noreferrer'
            className='button button--secondary button--small'
            title={
              release.discogsUrl
                ? 'View on Discogs'
                : 'Search Discogs for this release'
            }
          >
            <ExternalLink size={14} aria-hidden='true' />{' '}
            {release.discogsUrl ? 'View on Discogs' : 'Find on Discogs'}
          </a>
          {release.vinylStatus === 'available' &&
            !release.inWishlist &&
            release.discogsMasterId && (
              <Button
                size='small'
                onClick={() => onAddToWishlist(release.mbid, release.title)}
              >
                Add to Wishlist
              </Button>
            )}
          {release.inWishlist && (
            <span className='in-wishlist'>&#10003; In Wishlist</span>
          )}
        </div>

        <div className='release-hide-actions'>
          <IconButton
            icon={<>&#10005;</>}
            aria-label='Hide this release'
            variant='ghost'
            size='small'
            onClick={() => onHide(release)}
            title='Hide this release'
          />
          <IconButton
            icon={<>&#128683;</>}
            aria-label={`Exclude ${release.artistName} from release tracking`}
            variant='ghost'
            size='small'
            onClick={() =>
              onExcludeArtist(release.artistName, release.artistMbid)
            }
            title={`Exclude ${release.artistName} from release tracking`}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReleaseCard);
