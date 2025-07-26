import React from 'react';

import { CollectionItem, DiscogsRelease } from '../../shared/types';

interface AlbumCardProps {
  item: CollectionItem;
  selected: boolean;
  onSelect: () => void;
  onViewDetails: (release: DiscogsRelease) => void;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
  item,
  selected,
  onSelect,
  onViewDetails,
}) => {
  const { release } = item;

  const formatArray = (arr: string[] | undefined) => {
    if (!arr || arr.length === 0) return 'Unknown';
    return arr.join(', ');
  };

  const getImageUrl = (coverImage?: string) => {
    if (!coverImage) return null;
    // Discogs images might need proper handling
    return coverImage;
  };

  return (
    <div
      className={`album-card ${selected ? 'selected' : ''}`}
      style={{
        border: selected ? '2px solid #1db954' : '1px solid #e0e0e0',
        backgroundColor: selected ? '#f0fff4' : 'white',
      }}
    >
      <div
        className='album-cover'
        style={{
          backgroundImage: getImageUrl(release.cover_image)
            ? `url(${getImageUrl(release.cover_image)})`
            : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: '0.8rem',
        }}
      >
        {!getImageUrl(release.cover_image) && '🎵'}
      </div>

      <div style={{ flex: 1 }}>
        <div className='album-title' title={release.title}>
          {release.title}
        </div>

        <div className='album-artist' title={release.artist}>
          {release.artist}
        </div>

        <div className='album-year'>{release.year || 'Unknown Year'}</div>

        <div
          style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.25rem' }}
        >
          {formatArray(release.format)}
        </div>

        {release.label && release.label.length > 0 && (
          <div
            style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.25rem' }}
          >
            {formatArray(release.label)}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          marginTop: '0.75rem',
        }}
      >
        <button
          className={`btn btn-small ${selected ? 'btn-secondary' : ''}`}
          onClick={e => {
            e.stopPropagation();
            onSelect();
          }}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
        >
          {selected ? '✓ Selected' : 'Select'}
        </button>

        <button
          className='btn btn-small btn-secondary'
          onClick={e => {
            e.stopPropagation();
            onViewDetails(release);
          }}
          style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
        >
          View Details
        </button>
      </div>
    </div>
  );
};

export default AlbumCard;
