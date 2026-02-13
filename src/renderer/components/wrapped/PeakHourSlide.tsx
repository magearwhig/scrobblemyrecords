import React from 'react';

import { WrappedListeningStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface PeakHourSlideProps {
  stats: WrappedListeningStats;
}

const formatHour = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
};

const getTimeOfDay = (hour: number): string => {
  if (hour >= 5 && hour < 12) return 'a morning';
  if (hour >= 12 && hour < 17) return 'an afternoon';
  if (hour >= 17 && hour < 21) return 'an evening';
  return 'a late-night';
};

const PeakHourSlide: React.FC<PeakHourSlideProps> = ({ stats }) => {
  if (!stats.peakListeningHour) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>Peak Listening Hour</h2>
        <p className='wrapped-subtitle'>
          Not enough data to determine your peak hour.
        </p>
      </WrappedSlide>
    );
  }

  const hour = stats.peakListeningHour.hour;

  return (
    <WrappedSlide>
      <p className='wrapped-slide-label'>
        You're {getTimeOfDay(hour)} listener
      </p>
      <div className='wrapped-big-number'>{formatHour(hour)}</div>
      <p className='wrapped-subtitle'>
        was your most active hour with{' '}
        {stats.peakListeningHour.scrobbleCount.toLocaleString()} total plays
      </p>
    </WrappedSlide>
  );
};

export default PeakHourSlide;
