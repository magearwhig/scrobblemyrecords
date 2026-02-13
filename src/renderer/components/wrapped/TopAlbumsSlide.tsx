import React from 'react';

import { WrappedTopItem } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface TopAlbumsSlideProps {
  albums: WrappedTopItem[];
}

const TopAlbumsSlide: React.FC<TopAlbumsSlideProps> = ({ albums }) => {
  if (albums.length === 0) return null;
  const maxCount = albums[0]?.playCount || 1;

  return (
    <WrappedSlide>
      <h2 className='wrapped-slide-heading'>Your Top Albums</h2>
      <div className='wrapped-ranked-list'>
        {albums.map((album, index) => (
          <div key={album.name} className='wrapped-rank-item'>
            <span className='wrapped-rank-number'>{index + 1}</span>
            {album.imageUrl ? (
              <img
                className='wrapped-rank-image'
                src={album.imageUrl}
                alt={album.name}
                loading='lazy'
              />
            ) : (
              <div className='wrapped-rank-image wrapped-rank-placeholder'>
                💿
              </div>
            )}
            <div className='wrapped-rank-info'>
              <span className='wrapped-rank-name'>{album.artist}</span>
              <span className='wrapped-rank-detail'>{album.album}</span>
              <div className='wrapped-rank-bar-container'>
                <div
                  className='wrapped-rank-bar'
                  ref={el => {
                    if (el)
                      el.style.setProperty(
                        '--bar-width',
                        `${(album.playCount / maxCount) * 100}%`
                      );
                  }}
                />
              </div>
            </div>
            <span className='wrapped-rank-count'>{album.playCount} plays</span>
          </div>
        ))}
      </div>
    </WrappedSlide>
  );
};

export default TopAlbumsSlide;
