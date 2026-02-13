import React from 'react';

import { WrappedCollectionStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface MostPlayedAdditionSlideProps {
  collection: WrappedCollectionStats;
}

const MostPlayedAdditionSlide: React.FC<MostPlayedAdditionSlideProps> = ({
  collection,
}) => {
  if (!collection.mostPlayedNewAddition) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>Most-Played Addition</h2>
        <p className='wrapped-subtitle'>
          No new additions were played during this period.
        </p>
      </WrappedSlide>
    );
  }

  const { artist, title, coverUrl, dateAdded, playCount } =
    collection.mostPlayedNewAddition;
  const addedStr = new Date(dateAdded).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  });

  return (
    <WrappedSlide>
      <p className='wrapped-slide-label'>Your most-played new addition</p>
      <div className='wrapped-featured-section'>
        {coverUrl ? (
          <img
            className='wrapped-featured-cover'
            src={coverUrl}
            alt={`${artist} - ${title}`}
            loading='lazy'
          />
        ) : (
          <div className='wrapped-featured-cover wrapped-cover-placeholder'>
            💿
          </div>
        )}
        <h2 className='wrapped-featured-title'>{artist}</h2>
        <h3 className='wrapped-featured-album'>{title}</h3>
        <p className='wrapped-subtitle'>
          Added {addedStr} · {playCount} plays since
        </p>
      </div>
    </WrappedSlide>
  );
};

export default MostPlayedAdditionSlide;
