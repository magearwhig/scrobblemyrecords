import React from 'react';

import {
  DiscardPileItem,
  DiscardReason,
  DiscardStatus,
} from '../../../shared/types';

const REASON_LABELS: Record<DiscardReason, string> = {
  selling: 'For Sale',
  duplicate: 'Duplicate',
  damaged: 'Damaged',
  upgrade: 'Upgrading',
  not_listening: 'Not Listening',
  gift: 'Giving Away',
  other: 'Other',
};

const STATUS_LABELS: Record<DiscardStatus, string> = {
  marked: 'Marked',
  listed: 'Listed',
  sold: 'Sold',
  gifted: 'Gifted',
  removed: 'Removed',
  traded_in: 'Traded In',
};

const HISTORY_STATUSES: DiscardStatus[] = [
  'sold',
  'gifted',
  'removed',
  'traded_in',
];

interface DiscardItemCardProps {
  item: DiscardPileItem;
  selected: boolean;
  selectionMode: boolean;
  onEdit: (item: DiscardPileItem) => void;
  onSold: (item: DiscardPileItem) => void;
  onListed: (item: DiscardPileItem) => void;
  onTradedIn: (item: DiscardPileItem) => void;
  onRemove: (item: DiscardPileItem) => void;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  formatCurrency: (value: number | undefined, currency: string) => string;
  formatDate: (timestamp: number) => string;
}

const DiscardItemCard: React.FC<DiscardItemCardProps> = ({
  item,
  selected,
  selectionMode,
  onEdit,
  onSold,
  onListed,
  onTradedIn,
  onRemove,
  onToggleSelect,
  formatCurrency,
  formatDate,
}) => {
  return (
    <div
      className={`discard-item-card ${item.orphaned ? 'orphaned' : ''}${selected ? ' selected' : ''}`}
    >
      {selectionMode && !HISTORY_STATUSES.includes(item.status) && (
        <input
          type='checkbox'
          className='item-select-checkbox'
          checked={selected}
          onChange={e => {
            e.stopPropagation();
            onToggleSelect(
              item.id,
              e.nativeEvent instanceof window.MouseEvent &&
                (e.nativeEvent as globalThis.MouseEvent).shiftKey
            );
          }}
          aria-label={`Select ${item.artist} - ${item.title}`}
        />
      )}
      <div className='item-cover'>
        {item.coverImage ? (
          <img src={item.coverImage} alt={`${item.title} cover`} />
        ) : (
          <div className='no-cover'>No Image</div>
        )}
        {item.orphaned && (
          <div className='orphaned-badge' title='No longer in collection'>
            Orphaned
          </div>
        )}
      </div>

      <div className='item-info'>
        <div className='item-title'>{item.title}</div>
        <div className='item-artist'>{item.artist}</div>
        {item.format && (
          <div className='item-format'>{item.format.join(', ')}</div>
        )}
        {item.year && <div className='item-year'>{item.year}</div>}
      </div>

      <div className='item-badges'>
        <span className={`reason-badge reason-${item.reason}`}>
          {REASON_LABELS[item.reason]}
        </span>
        <span className={`status-badge status-${item.status}`}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <div className='item-details'>
        {item.estimatedValue !== undefined && (
          <div className='item-value'>
            Est: {formatCurrency(item.estimatedValue, item.currency)}
          </div>
        )}
        {item.actualSalePrice !== undefined && (
          <div className='item-sale-price'>
            Sold: {formatCurrency(item.actualSalePrice, item.currency)}
          </div>
        )}
        <div className='item-date'>Added: {formatDate(item.addedAt)}</div>
      </div>

      {item.marketplaceUrl && (
        <a
          href={item.marketplaceUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='marketplace-link'
        >
          View Listing
        </a>
      )}

      {item.notes && (
        <div className='item-notes' title={item.notes}>
          {item.notes.length > 50
            ? `${item.notes.substring(0, 50)}...`
            : item.notes}
        </div>
      )}

      <div className='item-actions'>
        <button
          className='btn btn-small btn-secondary'
          onClick={() => onEdit(item)}
          aria-label={`Edit ${item.artist} - ${item.title}`}
        >
          Edit
        </button>
        {item.status === 'marked' && (
          <>
            <button
              className='btn btn-small btn-primary'
              onClick={() => onListed(item)}
              aria-label={`Mark ${item.artist} - ${item.title} as listed`}
            >
              Listed
            </button>
            <button
              className='btn btn-small btn-success'
              onClick={() => onSold(item)}
              aria-label={`Mark ${item.artist} - ${item.title} as sold`}
            >
              Sold
            </button>
            <button
              className='btn btn-small btn-outline-warning'
              onClick={() => onTradedIn(item)}
              aria-label={`Mark ${item.artist} - ${item.title} as traded in`}
            >
              Traded In
            </button>
          </>
        )}
        {item.status === 'listed' && (
          <>
            <button
              className='btn btn-small btn-success'
              onClick={() => onSold(item)}
              aria-label={`Mark ${item.artist} - ${item.title} as sold`}
            >
              Sold
            </button>
            <button
              className='btn btn-small btn-outline-warning'
              onClick={() => onTradedIn(item)}
              aria-label={`Mark ${item.artist} - ${item.title} as traded in`}
            >
              Traded In
            </button>
          </>
        )}
        <button
          className='btn btn-small btn-danger'
          onClick={() => onRemove(item)}
          aria-label={`Remove ${item.artist} - ${item.title}`}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

export default React.memo(DiscardItemCard);
