import React from 'react';

import { WrappedCrossSourceStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface VinylVsDigitalSlideProps {
  crossSource: WrappedCrossSourceStats;
}

const VinylVsDigitalSlide: React.FC<VinylVsDigitalSlideProps> = ({
  crossSource,
}) => {
  const total = crossSource.vinylScrobbles + crossSource.otherScrobbles;

  if (total === 0) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>Vinyl vs Digital</h2>
        <p className='wrapped-subtitle'>
          No source data available for this period.
        </p>
      </WrappedSlide>
    );
  }

  return (
    <WrappedSlide>
      <h2 className='wrapped-slide-heading'>Vinyl vs Digital</h2>
      <div className='wrapped-source-breakdown'>
        <div className='wrapped-source-bar'>
          <div
            className='wrapped-source-vinyl'
            ref={el => {
              if (el)
                el.style.setProperty(
                  '--vinyl-width',
                  `${crossSource.vinylPercentage}%`
                );
            }}
          />
        </div>
        <div className='wrapped-source-labels'>
          <div className='wrapped-source-item'>
            <span className='wrapped-source-swatch wrapped-source-swatch-vinyl' />
            <span>
              RecordScrobbles: {crossSource.vinylScrobbles.toLocaleString()} (
              {crossSource.vinylPercentage}%)
            </span>
          </div>
          <div className='wrapped-source-item'>
            <span className='wrapped-source-swatch wrapped-source-swatch-other' />
            <span>
              Other: {crossSource.otherScrobbles.toLocaleString()} (
              {100 - crossSource.vinylPercentage}%)
            </span>
          </div>
        </div>
      </div>
    </WrappedSlide>
  );
};

export default VinylVsDigitalSlide;
