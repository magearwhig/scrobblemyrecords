import React from 'react';

import {
  AlbumPlayCountResult,
  EnrichedWishlistItem,
  VinylStatus,
} from '../../shared/types';

interface WishlistItemCardProps {
  item: EnrichedWishlistItem;
  isMonitored: boolean;
  getStatusBadge: (status: VinylStatus) => React.ReactNode;
  formatDate: (dateStr: string) => string;
  formatPrice: (
    price: number | undefined,
    currency: string | undefined
  ) => string;
  showPlayCounts: boolean;
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
  showPlayCounts,
  playCount,
  onOpenVersions,
  onOpenMarketplace,
}) => {
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
          {showPlayCounts && (playCount?.playCount ?? 0) > 0 && (
            <span className='wishlist-card-plays'>
              {playCount?.playCount} plays
            </span>
          )}
        </div>
      </div>
      <div className='wishlist-card-actions'>
        <button
          className='btn btn-small btn-secondary'
          onClick={() => onOpenVersions(item)}
          title='View all versions/pressings'
        >
          Versions
        </button>
        {item.vinylStatus === 'has_vinyl' && (
          <button
            className='btn btn-small btn-primary'
            onClick={() => onOpenMarketplace(item)}
            title='Browse vinyl on Discogs Marketplace'
          >
            Shop
          </button>
        )}
      </div>
    </div>
  );
};

export default React.memo(WishlistItemCard);
