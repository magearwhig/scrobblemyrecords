import React from 'react';

import {
  DiscardPileItem,
  DiscardPileStats,
  DiscardStatus,
} from '../../../shared/types';

const HISTORY_STATUSES: DiscardStatus[] = [
  'sold',
  'gifted',
  'removed',
  'traded_in',
];

interface DiscardStatsBarProps {
  stats: DiscardPileStats;
  filteredItems: DiscardPileItem[];
  formatCurrency: (value: number | undefined, currency: string) => string;
}

const DiscardStatsBar: React.FC<DiscardStatsBarProps> = ({
  stats,
  filteredItems,
  formatCurrency,
}) => {
  const historyCount = HISTORY_STATUSES.reduce(
    (sum, status) => sum + (stats.byStatus[status] || 0),
    0
  );

  const filteredEstimatedValue = filteredItems.reduce(
    (sum, item) => sum + (item.estimatedValue || 0),
    0
  );
  const filteredActualSales = filteredItems.reduce(
    (sum, item) => sum + (item.actualSalePrice || 0),
    0
  );

  return (
    <div className='discard-stats-summary'>
      <div className='stat-card'>
        <div className='stat-value'>{stats.totalItems}</div>
        <div className='stat-label'>Total Items</div>
      </div>
      <div className='stat-card'>
        <div className='stat-value'>{stats.byStatus.marked}</div>
        <div className='stat-label'>Pending</div>
      </div>
      <div className='stat-card'>
        <div className='stat-value'>{stats.byStatus.listed}</div>
        <div className='stat-label'>Listed</div>
      </div>
      <div className='stat-card'>
        <div className='stat-value'>{historyCount}</div>
        <div className='stat-label'>History</div>
      </div>
      <div className='stat-card'>
        <div className='stat-value'>
          {formatCurrency(filteredEstimatedValue, stats.currency)}
        </div>
        <div className='stat-label'>Est. Value</div>
      </div>
      <div className='stat-card'>
        <div className='stat-value'>
          {formatCurrency(filteredActualSales, stats.currency)}
        </div>
        <div className='stat-label'>Actual Sales</div>
      </div>
    </div>
  );
};

export default React.memo(DiscardStatsBar);
