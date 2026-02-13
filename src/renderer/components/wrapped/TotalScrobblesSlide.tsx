import React from 'react';

import { WrappedListeningStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface TotalScrobblesSlideProps {
  stats: WrappedListeningStats;
}

const TotalScrobblesSlide: React.FC<TotalScrobblesSlideProps> = ({ stats }) => {
  return (
    <WrappedSlide>
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
