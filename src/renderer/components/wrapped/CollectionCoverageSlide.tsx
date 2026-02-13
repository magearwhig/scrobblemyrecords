import React from 'react';

import { WrappedCrossSourceStats } from '../../../shared/types';
import { ProgressBar } from '../ui/ProgressBar';

import WrappedSlide from './WrappedSlide';

interface CollectionCoverageSlideProps {
  crossSource: WrappedCrossSourceStats;
}

const CollectionCoverageSlide: React.FC<CollectionCoverageSlideProps> = ({
  crossSource,
}) => {
  return (
    <WrappedSlide>
      <p className='wrapped-slide-label'>Of your collection, you listened to</p>
      <div className='wrapped-big-number'>
        {crossSource.collectionCoverage}%
      </div>
      <p className='wrapped-subtitle'>
        {crossSource.albumsPlayed} of {crossSource.totalCollectionSize} albums
        played
      </p>
      <div className='wrapped-progress-section'>
        <ProgressBar
          value={crossSource.collectionCoverage}
          max={100}
          label='Collection coverage'
        />
      </div>
    </WrappedSlide>
  );
};

export default CollectionCoverageSlide;
