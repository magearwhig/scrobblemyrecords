import React from 'react';

import {
  AlbumPlayCountResult,
  EnrichedWishlistItem,
  VinylStatus,
} from '../../shared/types';
import { formatRelativeTime } from '../utils/dateUtils';

import { Button } from './ui/Button';

interface WishlistItemCardProps {
  item: EnrichedWishlistItem;
  isMonitored: boolean;
  getStatusBadge: (status: VinylStatus) => React.ReactNode;
  formatDate: (dateStr: string) => string;
  formatPrice: (
    price: number | undefined,
    currency: string | undefined
  ) => string;
  playCount: AlbumPlayCountResult | undefined;
  onOpenVersions: (item: EnrichedWishlistItem) => void;
  onOpenMarketplace: (item: EnrichedWishlistItem) => void;
}

const WishlistItemCard: React.FC<WishlistItemCardProps> = ({
  item,
  isMonitored,
  getStatusBadge,
  formatDate,
  formatPrice,
  playCount,
  onOpenVersions,
  onOpenMarketplace,
}) => {
  const plays = playCount?.playCount ?? 0;
  const lastPlayed = playCount?.lastPlayed ?? null;

  return (
    <div className='wishlist-card'>
      <div className='wishlist-card-image'>
        {item.coverImage ? (
          <img src={item.coverImage} alt={item.title} />
        ) : (
          <div className='wishlist-card-placeholder'>No Image</div>
        )}
        {getStatusBadge(item.vinylStatus)}
        {isMonitored && (
          <span className='wishlist-badge wishlist-badge-monitored'>
            Monitored
          </span>
        )}
        {plays > 0 && (
          <span
            className='album-play-count-badge'
            aria-label={`${plays} ${plays === 1 ? 'play' : 'plays'}`}
          >
            {plays} {plays === 1 ? 'play' : 'plays'}
          </span>
        )}
      </div>
      <div className='wishlist-card-content'>
        <h4 className='wishlist-card-title'>{item.title}</h4>
        <p className='wishlist-card-artist'>{item.artist}</p>
        {item.year && <p className='wishlist-card-year'>{item.year}</p>}
        <div className='wishlist-card-meta'>
          <span className='wishlist-card-date'>
            Added: {formatDate(item.dateAdded)}
          </span>
          {item.lowestVinylPrice !== undefined && (
            <span className='wishlist-card-price'>
              From: {formatPrice(item.lowestVinylPrice, item.priceCurrency)}
            </span>
          )}
        </div>
        {lastPlayed != null && lastPlayed > 0 && (
          <div className='album-last-played'>
            Last played {formatRelativeTime(lastPlayed)}
          </div>
        )}
      </div>
      <div className='wishlist-card-actions'>
        <Button
          variant='secondary'
          size='small'
          onClick={() => onOpenVersions(item)}
          title='View all versions/pressings'
        >
          Versions
        </Button>
        {item.vinylStatus === 'has_vinyl' && (
          <Button
            size='small'
            onClick={() => onOpenMarketplace(item)}
            title='Browse vinyl on Discogs Marketplace'
          >
            Shop
          </Button>
        )}
      </div>
    </div>
  );
};

export default React.memo(WishlistItemCard);
