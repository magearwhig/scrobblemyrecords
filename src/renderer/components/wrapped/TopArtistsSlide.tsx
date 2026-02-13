import React from 'react';

import { WrappedTopItem } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface TopArtistsSlideProps {
  artists: WrappedTopItem[];
}

const TopArtistsSlide: React.FC<TopArtistsSlideProps> = ({ artists }) => {
  if (artists.length === 0) return null;
  const maxCount = artists[0]?.playCount || 1;

  return (
    <WrappedSlide>
      <h2 className='wrapped-slide-heading'>Your Top Artists</h2>
      <div className='wrapped-ranked-list'>
        {artists.map((artist, index) => (
          <div key={artist.name} className='wrapped-rank-item'>
            <span className='wrapped-rank-number'>{index + 1}</span>
            {artist.imageUrl ? (
              <img
                className='wrapped-rank-image wrapped-rank-image-circle'
                src={artist.imageUrl}
                alt={artist.name}
                loading='lazy'
              />
            ) : (
              <div className='wrapped-rank-image wrapped-rank-image-circle wrapped-rank-placeholder'>
                ♪
              </div>
            )}
            <div className='wrapped-rank-info'>
              <span className='wrapped-rank-name'>{artist.name}</span>
              <div className='wrapped-rank-bar-container'>
                <div
                  className='wrapped-rank-bar'
                  ref={el => {
                    if (el)
                      el.style.setProperty(
                        '--bar-width',
                        `${(artist.playCount / maxCount) * 100}%`
                      );
                  }}
                />
              </div>
            </div>
            <span className='wrapped-rank-count'>{artist.playCount} plays</span>
          </div>
        ))}
      </div>
    </WrappedSlide>
  );
};

export default TopArtistsSlide;
