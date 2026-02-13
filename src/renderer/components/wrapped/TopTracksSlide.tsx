import React from 'react';

import { WrappedTopItem } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface TopTracksSlideProps {
  tracks: WrappedTopItem[];
}

const TopTracksSlide: React.FC<TopTracksSlideProps> = ({ tracks }) => {
  if (tracks.length === 0) return null;
  const maxCount = tracks[0]?.playCount || 1;

  return (
    <WrappedSlide>
      <h2 className='wrapped-slide-heading'>Your Top Tracks</h2>
      <div className='wrapped-ranked-list'>
        {tracks.map((track, index) => (
          <div
            key={`${track.artist}-${track.name}`}
            className='wrapped-rank-item'
          >
            <span className='wrapped-rank-number'>{index + 1}</span>
            <div className='wrapped-rank-info'>
              <span className='wrapped-rank-name'>{track.name}</span>
              <span className='wrapped-rank-detail'>{track.artist}</span>
              <div className='wrapped-rank-bar-container'>
                <div
                  className='wrapped-rank-bar'
                  ref={el => {
                    if (el)
                      el.style.setProperty(
                        '--bar-width',
                        `${(track.playCount / maxCount) * 100}%`
                      );
                  }}
                />
              </div>
            </div>
            <span className='wrapped-rank-count'>{track.playCount} plays</span>
          </div>
        ))}
      </div>
    </WrappedSlide>
  );
};

export default TopTracksSlide;
