import React from 'react';

import { MonitoredSeller } from '../../shared/types';

import { Button } from './ui/Button';

interface SellerCardProps {
  seller: MonitoredSeller;
  formatRelativeTime: (timestamp: number) => string;
  onRemove: (username: string) => void;
  removing: boolean;
}

const SellerCard: React.FC<SellerCardProps> = ({
  seller,
  formatRelativeTime,
  onRemove,
  removing,
}) => {
  return (
    <div className='seller-card'>
      <div className='seller-card-header'>
        <div className='seller-card-info'>
          <div className='seller-card-name'>{seller.displayName}</div>
          <div className='seller-card-username'>@{seller.username}</div>
        </div>
        <div className='seller-card-stats'>
          <span>
            Inventory: {seller.inventorySize?.toLocaleString() || '?'}
          </span>
          <span>Matches: {seller.matchCount || 0}</span>
        </div>
      </div>
      <div className='seller-card-meta'>
        {seller.lastScanned
          ? `Last scanned: ${formatRelativeTime(seller.lastScanned)}`
          : 'Not yet scanned'}
      </div>
      <div className='seller-card-actions'>
        {(seller.matchCount || 0) > 0 && (
          <Button
            size='small'
            onClick={() => {
              window.location.hash = `marketplace?tab=matches&seller=${encodeURIComponent(seller.username)}`;
            }}
          >
            View Matches
          </Button>
        )}
        <Button
          variant='danger'
          size='small'
          onClick={() => onRemove(seller.username)}
          disabled={removing}
        >
          {removing ? 'Removing...' : 'Remove'}
        </Button>
      </div>
    </div>
  );
};

export default React.memo(SellerCard);
