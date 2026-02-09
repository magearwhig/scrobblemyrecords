import React from 'react';

import { TrackedRelease } from '../../shared/types';

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
            <button
              className='btn btn-secondary btn-sm'
              onClick={() => onCheckVinyl(release.mbid, release.title)}
            >
              Check Vinyl
            </button>
          )}
          {release.vinylStatus === 'checking' && (
            <span className='checking-status'>Checking...</span>
          )}
          {release.discogsUrl && (
            <a
              href={release.discogsUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='btn btn-secondary btn-sm'
            >
              View on Discogs
            </a>
          )}
          {release.vinylStatus === 'available' &&
            !release.inWishlist &&
            release.discogsMasterId && (
              <button
                className='btn btn-primary btn-sm'
                onClick={() => onAddToWishlist(release.mbid, release.title)}
              >
                Add to Wishlist
              </button>
            )}
          {release.inWishlist && (
            <span className='in-wishlist'>&#10003; In Wishlist</span>
          )}
        </div>

        <div className='release-hide-actions'>
          <button
            className='btn-icon btn-hide'
            onClick={() => onHide(release)}
            title='Hide this release'
          >
            &#10005;
          </button>
          <button
            className='btn-icon btn-exclude'
            onClick={() =>
              onExcludeArtist(release.artistName, release.artistMbid)
            }
            title={`Exclude ${release.artistName} from release tracking`}
          >
            &#128683;
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ReleaseCard);
