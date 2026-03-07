import { Disc3 } from 'lucide-react';
import React from 'react';

import { WrappedCollectionStats } from '../../../shared/types';

import WrappedSlide from './WrappedSlide';

interface RecordsAddedSlideProps {
  collection: WrappedCollectionStats;
}

const RecordsAddedSlide: React.FC<RecordsAddedSlideProps> = ({
  collection,
}) => {
  if (collection.recordsAdded === 0) {
    return (
      <WrappedSlide>
        <h2 className='wrapped-slide-heading'>Collection Growth</h2>
        <p className='wrapped-subtitle'>No new records added in this period.</p>
      </WrappedSlide>
    );
  }

  return (
    <WrappedSlide>
      <p className='wrapped-slide-label'>You added</p>
      <div className='wrapped-big-number'>{collection.recordsAdded}</div>
      <p className='wrapped-slide-label'>records to your collection</p>
      {collection.recordsList.length > 0 && (
        <div className='wrapped-cover-grid'>
          {collection.recordsList.slice(0, 10).map((record, index) => (
            <div key={index} className='wrapped-cover-item'>
              {record.coverUrl ? (
                <img
                  className='wrapped-cover-image'
                  src={record.coverUrl}
                  alt={`${record.artist} - ${record.title}`}
                  loading='lazy'
                />
              ) : (
                <div className='wrapped-cover-image wrapped-cover-placeholder'>
                  <Disc3 size={24} aria-hidden='true' />
                </div>
              )}
            </div>
          ))}
          {collection.recordsAdded > 10 && (
            <div className='wrapped-cover-more'>
              +{collection.recordsAdded - 10} more
            </div>
          )}
        </div>
      )}
    </WrappedSlide>
  );
};

export default RecordsAddedSlide;
