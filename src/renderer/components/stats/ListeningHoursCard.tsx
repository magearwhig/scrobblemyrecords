import React from 'react';

import { ListeningHours } from '../../../shared/types';

interface ListeningHoursCardProps {
  hours: ListeningHours;
}

/**
 * Card displaying listening hours stats
 */
export const ListeningHoursCard: React.FC<ListeningHoursCardProps> = ({
  hours,
}) => {
  const formatHours = (h: number): string => {
    if (h < 1) {
      return `${Math.round(h * 60)}m`;
    }
    return `${h.toFixed(1)}h`;
  };

  return (
    <div className='stat-card'>
      <div className='stat-card-icon'>⏱️</div>
      <div className='stat-card-content'>
        <div className='stat-card-value'>{formatHours(hours.thisMonth)}</div>
        <div className='stat-card-label'>Listening This Month</div>
        <div className='stat-card-subvalue'>
          {formatHours(hours.thisWeek)} this week, {formatHours(hours.today)}{' '}
          today
        </div>
      </div>
    </div>
  );
};

export default ListeningHoursCard;
