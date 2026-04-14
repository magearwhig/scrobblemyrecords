import React from 'react';

import { MonitoredSeller } from '../../shared/types';
import { navigate } from '../routes';

import { Button } from './ui/Button';

interface SellerCardProps {
  seller: MonitoredSeller;
  formatRelativeTime: (timestamp: number) => string;
  onRemove: (username: string) => void;
  removing: boolean;
  onScan: (username: string) => void;
  scanDisabled: boolean;
}

const SellerCard: React.FC<SellerCardProps> = ({
  seller,
  formatRelativeTime,
  onRemove,
  removing,
  onScan,
  scanDisabled,
}) => {
  const lastActivity = Math.max(
    seller.lastScanned || 0,
    seller.lastQuickCheck || 0
  );

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
        {lastActivity > 0
          ? `Last scanned: ${formatRelativeTime(lastActivity)}`
          : 'Not yet scanned'}
      </div>
      <div className='seller-card-actions'>
        <Button
          size='small'
          onClick={() => onScan(seller.username)}
          disabled={scanDisabled}
        >
          Scan
        </Button>
        {(seller.matchCount || 0) > 0 && (
          <Button
            size='small'
            onClick={() => {
              navigate(
                `marketplace?tab=matches&seller=${encodeURIComponent(seller.username)}`
              );
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
