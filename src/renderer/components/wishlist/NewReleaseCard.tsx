import React from 'react';

import { WishlistNewRelease } from '../../../shared/types';

interface Props {
  release: WishlistNewRelease;
  onDismiss: (id: string) => void;
}

/**
 * Card component for displaying a newly detected vinyl release
 */
export const NewReleaseCard: React.FC<Props> = ({ release, onDismiss }) => {
  const isRecent = Date.now() - release.detectedAt < 7 * 24 * 60 * 60 * 1000;

  const getSourceLabel = (source: string): string => {
    switch (source) {
      case 'wishlist':
        return 'Discogs Wishlist';
      case 'local_want':
        return 'Local Want List';
      default:
        return source;
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return days === 1 ? '1 day ago' : `${days} days ago`;
    }
    if (hours > 0) {
      return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    }
    return 'Just now';
  };

  const formatPrice = (
    price: number | undefined,
    currency: string | undefined
  ): string => {
    if (price === undefined) return '';
    const currencySymbol =
      currency === 'USD'
        ? '$'
        : currency === 'EUR'
          ? '\u20AC'
          : currency === 'GBP'
            ? '\u00A3'
            : currency || '$';
    return `${currencySymbol}${price.toFixed(2)}`;
  };

  const handleViewOnDiscogs = () => {
    window.open(release.discogsUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`new-release-card ${release.dismissed ? 'dismissed' : ''}`}>
      <div className='new-release-card-cover'>
        {release.coverImage ? (
          <img
            src={release.coverImage}
            alt={`${release.artist} - ${release.title}`}
            className='new-release-cover-img'
          />
        ) : (
          <div className='new-release-cover-placeholder'>
            <span className='vinyl-icon'>&#x1F4BF;</span>
          </div>
        )}
      </div>

      <div className='new-release-card-info'>
        <div className='new-release-title'>
          <span className='new-release-artist'>{release.artist}</span>
          <span className='new-release-separator'> - </span>
          <span className='new-release-album'>{release.title}</span>
        </div>

        <div className='new-release-details'>
          {isRecent && <span className='new-release-badge new'>NEW</span>}
          <span className='new-release-format'>
            {release.format.join(' \u00B7 ')}
          </span>
          {release.year > 0 && (
            <span className='new-release-year'>Pressed: {release.year}</span>
          )}
          {release.country && (
            <span className='new-release-country'>{release.country}</span>
          )}
        </div>

        <div className='new-release-meta'>
          {release.label && (
            <span className='new-release-label'>{release.label}</span>
          )}
          {release.catalogNumber && (
            <span className='new-release-catalog'>
              ({release.catalogNumber})
            </span>
          )}
        </div>

        {release.lowestPrice !== undefined && (
          <div className='new-release-price'>
            From {formatPrice(release.lowestPrice, release.priceCurrency)}
            {release.numForSale !== undefined && release.numForSale > 0 && (
              <span className='new-release-for-sale'>
                ({release.numForSale} for sale)
              </span>
            )}
          </div>
        )}

        <div className='new-release-source'>
          <span
            className='new-release-source-badge'
            data-source={release.source}
          >
            {getSourceLabel(release.source)}
          </span>
          <span className='new-release-detected'>
            Detected {formatRelativeTime(release.detectedAt)}
          </span>
        </div>
      </div>

      <div className='new-release-card-actions'>
        <button
          className='btn btn-primary btn-sm'
          onClick={handleViewOnDiscogs}
        >
          View on Discogs
        </button>
        <button
          className='btn btn-ghost btn-sm'
          onClick={() => onDismiss(release.id)}
          title={release.dismissed ? 'Already dismissed' : 'Dismiss'}
        >
          {release.dismissed ? '\u2713' : '\u2715'}
        </button>
      </div>
    </div>
  );
};

export default React.memo(NewReleaseCard);
