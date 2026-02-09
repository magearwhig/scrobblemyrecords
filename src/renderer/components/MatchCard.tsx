import React from 'react';

import { SellerMatch } from '../../shared/types';

interface MatchCardProps {
  match: SellerMatch;
  formatPrice: (price: number, currency: string) => string;
  formatRelativeTime: (timestamp: number) => string;
  getSellerDisplayName: (sellerId: string) => string;
  onMarkAsSeen: (matchId: string) => void;
  onVerify: (matchId: string) => void;
  markingAsSeen: boolean;
  verifying: boolean;
}

const MatchCard: React.FC<MatchCardProps> = ({
  match,
  formatPrice,
  formatRelativeTime,
  getSellerDisplayName,
  onMarkAsSeen,
  onVerify,
  markingAsSeen,
  verifying,
}) => {
  return (
    <div
      className={`seller-match-card ${match.status === 'seen' ? 'seller-match-card-seen' : ''} ${match.status === 'sold' ? 'seller-match-card-sold' : ''}`}
    >
      {match.coverImage ? (
        <img
          src={match.coverImage}
          alt={`${match.artist} - ${match.title}`}
          className='seller-match-cover'
        />
      ) : (
        <div className='seller-match-cover seller-match-cover-placeholder'>
          <span>No Image</span>
        </div>
      )}
      <div className='seller-match-info'>
        <div className='seller-match-title'>
          {match.artist} - {match.title}
          {match.status === 'seen' && (
            <span className='seller-match-badge seller-match-badge-seen'>
              SEEN
            </span>
          )}
          {match.status === 'sold' && (
            <span
              className={`seller-match-badge seller-match-badge-sold ${match.statusConfidence === 'unverified' ? 'seller-match-badge-unverified' : ''}`}
              title={
                match.statusConfidence === 'unverified'
                  ? 'Status not verified - click Refresh to check'
                  : match.lastVerifiedAt
                    ? `Verified ${formatRelativeTime(match.lastVerifiedAt)}`
                    : 'Sold'
              }
            >
              SOLD{match.statusConfidence === 'unverified' ? '?' : ''}
            </span>
          )}
        </div>
        <div className='seller-match-details'>
          {match.format.join(', ')} &bull; {match.condition}
        </div>
        <div className='seller-match-price'>
          {formatPrice(match.price, match.currency)}
        </div>
        <div className='seller-match-seller'>
          @ {getSellerDisplayName(match.sellerId)}
        </div>
        <div className='seller-match-date'>
          Found: {formatRelativeTime(match.dateFound)}
        </div>
      </div>
      <div className='seller-match-actions'>
        {match.status === 'sold' && (
          <button
            className='btn btn-small btn-outline'
            onClick={() => onVerify(match.id)}
            disabled={verifying}
            title='Check if still available on Discogs'
          >
            {verifying ? '...' : 'Refresh'}
          </button>
        )}
        {match.status !== 'seen' && match.status !== 'sold' && (
          <button
            className='btn btn-small btn-outline'
            onClick={() => onMarkAsSeen(match.id)}
            disabled={markingAsSeen}
          >
            {markingAsSeen ? '...' : 'Mark as Seen'}
          </button>
        )}
        <a
          href={match.listingUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='btn btn-small'
        >
          View on Discogs
        </a>
      </div>
    </div>
  );
};

export default React.memo(MatchCard);
