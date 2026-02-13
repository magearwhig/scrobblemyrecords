import React from 'react';

import { WrappedListeningStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface StreakSlideProps {
  stats: WrappedListeningStats;
}

const StreakSlide: React.FC<StreakSlideProps> = ({ stats }) => {
  if (!stats.longestStreak || stats.longestStreak.days <= 1) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>Listening Streak</h2>
        <p className='wrapped-subtitle'>
          No multi-day listening streak in this period.
        </p>
      </WrappedSlide>
    );
  }

  const startStr = new Date(
    `${stats.longestStreak.startDate}T00:00:00`
  ).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const endStr = new Date(
    `${stats.longestStreak.endDate}T00:00:00`
  ).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <WrappedSlide>
      <p className='wrapped-slide-label'>Your longest streak was</p>
      <div className='wrapped-big-number'>{stats.longestStreak.days}</div>
      <p className='wrapped-slide-label'>consecutive days</p>
      <p className='wrapped-subtitle'>
        {startStr} — {endStr}
      </p>
    </WrappedSlide>
  );
};

export default StreakSlide;
