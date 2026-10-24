import React from 'react';

import { WrappedListeningStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface TotalScrobblesSlideProps {
  stats: WrappedListeningStats;
  startDate: number; // milliseconds
  endDate: number; // milliseconds
}

const formatDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const TotalScrobblesSlide: React.FC<TotalScrobblesSlideProps> = ({
  stats,
  startDate,
  endDate,
}) => {
  return (
    <WrappedSlide>
      <p className='wrapped-subtitle'>
        {formatDay(startDate)} – {formatDay(endDate)}
      </p>
      <p className='wrapped-slide-label'>You listened to</p>
      <div className='wrapped-big-number'>
        {stats.totalScrobbles.toLocaleString()}
      </div>
      <p className='wrapped-slide-label'>tracks</p>
      <p className='wrapped-subtitle'>
        That's about {stats.estimatedListeningHours.toLocaleString()} hours of
        music.
      </p>
    </WrappedSlide>
  );
};

export default TotalScrobblesSlide;
