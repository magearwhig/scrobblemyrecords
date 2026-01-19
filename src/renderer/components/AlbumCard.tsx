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

      <div style={{ flex: 1 }}>
        <div className='album-title' title={release.title}>
          {release.title}
        </div>

        <div className='album-artist' title={release.artist}>
          {release.artist}
        </div>

        <div className='album-year'>{release.year || 'Unknown Year'}</div>

        <div
          className='album-metadata'
          style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}
        >
          {formatArray(release.format)}
        </div>

        {release.label && release.label.length > 0 && (
          <div
            className='album-metadata'
            style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}
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

        {onAddToDiscardPile && !isInDiscardPile && (
          <button
            type='button'
            className='btn btn-small btn-outline-warning'
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onAddToDiscardPile(item);
            }}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
            title='Add to discard pile'
          >
            📦 Discard
          </button>
        )}

        {isInDiscardPile && (
          <span
            className='discard-pile-indicator'
            style={{
              fontSize: '0.7rem',
              color: 'var(--accent-warning, #f59e0b)',
              textAlign: 'center',
            }}
          >
            In Discard Pile
          </span>
        )}
      </div>
    </div>
  );
};

export default AlbumCard;
