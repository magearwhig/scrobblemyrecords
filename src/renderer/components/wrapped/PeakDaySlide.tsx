import React from 'react';

import { WrappedListeningStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface PeakDaySlideProps {
  stats: WrappedListeningStats;
}

const PeakDaySlide: React.FC<PeakDaySlideProps> = ({ stats }) => {
  if (!stats.peakListeningDay) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>Peak Listening Day</h2>
        <p className='wrapped-subtitle'>
          Not enough data to determine your peak day.
        </p>
      </WrappedSlide>
    );
  }

  const dateStr = new Date(
    `${stats.peakListeningDay.date}T00:00:00`
  ).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <WrappedSlide>
      <p className='wrapped-slide-label'>Your biggest listening day was</p>
      <h2 className='wrapped-slide-heading'>{dateStr}</h2>
      <div className='wrapped-big-number'>
        {stats.peakListeningDay.scrobbleCount}
      </div>
      <p className='wrapped-slide-label'>tracks played</p>
    </WrappedSlide>
  );
};

export default PeakDaySlide;
