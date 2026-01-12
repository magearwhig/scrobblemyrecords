import React from 'react';

import { StreakInfo } from '../../../shared/types';

interface StreakCardProps {
  streaks: StreakInfo;
}

/**
 * Card showing listening streak information
 */
export const StreakCard: React.FC<StreakCardProps> = ({ streaks }) => {
  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className='streak-card'>
      <div className='streak-card-content'>
        <div className='streak-card-icon'>🔥</div>
        <div className='streak-card-stats'>
          <div className='streak-card-current'>
            <span className='streak-card-value'>{streaks.currentStreak}</span>
            <span className='streak-card-label'>
              day{streaks.currentStreak !== 1 ? 's' : ''} streak
            </span>
          </div>
          <div className='streak-card-best'>
            Best: {streaks.longestStreak} day
            {streaks.longestStreak !== 1 ? 's' : ''}
            {streaks.longestStreakStart && (
              <span>
                {' '}
                ({formatDate(streaks.longestStreakStart)} -{' '}
                {formatDate(streaks.longestStreakEnd)})
              </span>
            )}
          </div>
        </div>
      </div>
      <p className='streak-card-description'>
        Consecutive days with at least one scrobble.
      </p>
    </div>
  );
};

export default StreakCard;
