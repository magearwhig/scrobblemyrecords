import React, { useMemo } from 'react';

import { WrappedListeningStats } from '../../../shared/types';
import CalendarHeatmap from '../stats/CalendarHeatmap';

import WrappedSlide from './WrappedSlide';

interface HeatmapSlideProps {
  stats: WrappedListeningStats;
  startDate: number; // milliseconds
  endDate: number; // milliseconds
}

const HeatmapSlide: React.FC<HeatmapSlideProps> = ({
  stats,
  startDate,
  endDate,
}) => {
  const year = useMemo(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    // If range spans one year, use that; otherwise use end year
    return startYear === endYear ? startYear : endYear;
  }, [startDate, endDate]);

  if (stats.heatmapData.length === 0) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>Listening Activity</h2>
        <p className='wrapped-subtitle'>
          No listening activity data for this period.
        </p>
      </WrappedSlide>
    );
  }

  return (
    <WrappedSlide className='wrapped-slide-heatmap'>
      <h2 className='wrapped-slide-heading'>Listening Activity</h2>
      <div className='wrapped-heatmap-container'>
        <CalendarHeatmap data={stats.heatmapData} year={year} />
      </div>
    </WrappedSlide>
  );
};

export default HeatmapSlide;
