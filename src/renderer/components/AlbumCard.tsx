import React from 'react';

import { CollectionItem, DiscogsRelease } from '../../shared/types';

interface AlbumCardProps {
  item: CollectionItem;
  selected: boolean;
  onSelect: () => void;
  onViewDetails: (release: DiscogsRelease) => void;
  isInDiscardPile?: boolean;
  onAddToDiscardPile?: (item: CollectionItem) => void;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
  item,
  selected,
  onSelect,
  onViewDetails,
  isInDiscardPile = false,
  onAddToDiscardPile,
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
      className={`album-card ${selected ? 'selected' : ''} ${isInDiscardPile ? 'in-discard-pile' : ''}`}
    >
      <div
        className='album-cover'
        onClick={() => onViewDetails(release)}
        style={{
          backgroundImage: getImageUrl(release.cover_image)
            ? `url(${getImageUrl(release.cover_image)})`
            : 'none',
        }}
        title='Click to view details'
      >
        {!getImageUrl(release.cover_image) && '🎵'}
        {isInDiscardPile && (
          <span className='discard-pile-badge' title='In Discard Pile'>
            📦
          </span>
        )}
      </div>

      <div className='album-card-info'>
        <div className='album-title' title={release.title}>
          {release.title}
        </div>

        <div className='album-artist' title={release.artist}>
          {release.artist}
        </div>

        <div className='album-year'>{release.year || 'Unknown Year'}</div>

        <div className='album-metadata'>{formatArray(release.format)}</div>

        {release.label && release.label.length > 0 && (
          <div className='album-metadata'>{formatArray(release.label)}</div>
        )}
      </div>

      <div className='album-card-actions'>
        <button
          className={`btn btn-small ${selected ? 'btn-secondary' : ''}`}
          onClick={e => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {selected ? '✓ Selected' : 'Select'}
        </button>

        <button
          className='btn btn-small btn-secondary'
          onClick={e => {
            e.stopPropagation();
            onViewDetails(release);
          }}
        >
          View Details
        </button>

        {onAddToDiscardPile && !isInDiscardPile && (
          <button
            type='button'
            className='btn btn-small btn-outline-warning'
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onAddToDiscardPile(item);
            }}
            title='Add to discard pile'
          >
            📦 Discard
          </button>
        )}

        {isInDiscardPile && (
          <span className='discard-pile-indicator'>In Discard Pile</span>
        )}
      </div>
    </div>
  );
};

export default React.memo(AlbumCard);
