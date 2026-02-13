import React from 'react';

import { WrappedListeningStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface UniqueCountsSlideProps {
  stats: WrappedListeningStats;
}

const UniqueCountsSlide: React.FC<UniqueCountsSlideProps> = ({ stats }) => {
  return (
    <WrappedSlide>
      <h2 className='wrapped-slide-heading'>Your Musical Breadth</h2>
      <div className='wrapped-dual-stat'>
        <div className='wrapped-stat-block'>
          <div className='wrapped-big-number'>
            {stats.uniqueArtists.toLocaleString()}
          </div>
          <p className='wrapped-slide-label'>Different Artists</p>
        </div>
        <div className='wrapped-stat-block'>
          <div className='wrapped-big-number'>
            {stats.uniqueAlbums.toLocaleString()}
          </div>
          <p className='wrapped-slide-label'>Different Albums</p>
        </div>
      </div>
    </WrappedSlide>
  );
};

export default UniqueCountsSlide;
