import React from 'react';

import { WrappedListeningStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface NewArtistsSlideProps {
  stats: WrappedListeningStats;
}

const NewArtistsSlide: React.FC<NewArtistsSlideProps> = ({ stats }) => {
  if (stats.newArtistsDiscovered === 0) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>New Discoveries</h2>
        <p className='wrapped-subtitle'>
          No new artists discovered in this period — you stuck with your
          favorites!
        </p>
      </WrappedSlide>
    );
  }

  return (
    <WrappedSlide>
      <p className='wrapped-slide-label'>You discovered</p>
      <div className='wrapped-big-number'>{stats.newArtistsDiscovered}</div>
      <p className='wrapped-slide-label'>new artists</p>
      {stats.newArtistsList.length > 0 && (
        <div className='wrapped-new-artists-list'>
          {stats.newArtistsList.slice(0, 5).map(artist => (
            <div key={artist.name} className='wrapped-new-artist-item'>
              {artist.imageUrl ? (
                <img
                  className='wrapped-new-artist-image'
                  src={artist.imageUrl}
                  alt={artist.name}
                  loading='lazy'
                />
              ) : (
                <div className='wrapped-new-artist-image wrapped-rank-placeholder'>
                  ♪
                </div>
              )}
              <div className='wrapped-new-artist-info'>
                <span className='wrapped-new-artist-name'>{artist.name}</span>
                <span className='wrapped-new-artist-plays'>
                  {artist.playCount} plays
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </WrappedSlide>
  );
};

export default NewArtistsSlide;
