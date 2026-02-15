import React from 'react';

import { TrackedRelease } from '../../shared/types';

import { Button, IconButton } from './ui/Button';

interface ReleaseCardProps {
  release: TrackedRelease;
  formatReleaseDate: (dateStr: string | null) => string;
  getVinylBadge: (status: TrackedRelease['vinylStatus']) => React.ReactNode;
  onCheckVinyl: (mbid: string, title: string) => void;
  onAddToWishlist: (mbid: string, title: string) => void;
  onHide: (release: TrackedRelease) => void;
  onExcludeArtist: (artistName: string, artistMbid: string) => void;
}

const ReleaseCard: React.FC<ReleaseCardProps> = ({
  release,
  formatReleaseDate,
  getVinylBadge,
  onCheckVinyl,
  onAddToWishlist,
  onHide,
  onExcludeArtist,
}) => {
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
          {release.artistName}
        </p>
        <p className='release-date'>{formatReleaseDate(release.releaseDate)}</p>
        <div className='release-type'>
          <span className='badge badge-type'>{release.releaseType}</span>
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
          {release.discogsUrl && (
            <a
              href={release.discogsUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='button button--secondary button--small'
            >
              View on Discogs
            </a>
          )}
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
