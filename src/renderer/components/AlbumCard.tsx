import { Check, Music, Package } from 'lucide-react';
import React from 'react';

import { CollectionItem, DiscogsRelease } from '../../shared/types';
import { formatRelativeTime } from '../utils/dateUtils';

import ArtistLink from './ArtistLink';
import { Button } from './ui/Button';

interface AlbumCardProps {
  item: CollectionItem;
  selected: boolean;
  onSelect: () => void;
  onViewDetails: (release: DiscogsRelease) => void;
  isInDiscardPile?: boolean;
  onAddToDiscardPile?: (item: CollectionItem) => void;
  playCount?: number;
  lastPlayed?: number | null;
}

const AlbumCard: React.FC<AlbumCardProps> = ({
  item,
  selected,
  onSelect,
  onViewDetails,
  isInDiscardPile = false,
  onAddToDiscardPile,
  playCount,
  lastPlayed,
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
        onMouseDown={e => {
          // Prevent browser's default focus behavior on mousedown.
          // In virtualized lists, focusing an absolutely-positioned element
          // triggers scroll-into-view using its CSS top:0 position (not its
          // visual transform position), which scrolls the container to top.
          e.preventDefault();
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onViewDetails(release);
          }
        }}
        role='button'
        tabIndex={0}
        style={{
          backgroundImage: getImageUrl(release.cover_image)
            ? `url(${getImageUrl(release.cover_image)})`
            : 'none',
        }}
        title='Click to view details'
        aria-label={`View details for ${release.title}`}
      >
        {!getImageUrl(release.cover_image) && (
          <Music size={32} aria-hidden='true' />
        )}
        {isInDiscardPile && (
          <span className='discard-pile-badge' title='In Discard Pile'>
            <Package size={14} aria-hidden='true' />
          </span>
        )}
        {playCount != null && playCount > 0 && (
          <span
            className='album-play-count-badge'
            aria-label={`${playCount} ${playCount === 1 ? 'play' : 'plays'}`}
          >
            {playCount} {playCount === 1 ? 'play' : 'plays'}
          </span>
        )}
      </div>

      <div className='album-card-info'>
        <div className='album-title' title={release.title}>
          {release.title}
        </div>

        <div className='album-artist' title={release.artist}>
          <ArtistLink artist={release.artist} />
        </div>

        <div className='album-year'>{release.year || 'Unknown Year'}</div>

        <div className='album-metadata'>{formatArray(release.format)}</div>

        {release.label && release.label.length > 0 && (
          <div className='album-metadata'>{formatArray(release.label)}</div>
        )}

        {lastPlayed != null && lastPlayed > 0 && (
          <div className='album-last-played'>
            Last played {formatRelativeTime(lastPlayed)}
          </div>
        )}
      </div>

      <div className='album-card-actions'>
        <Button
          size='small'
          variant={selected ? 'secondary' : 'primary'}
          onClick={e => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {selected ? (
            <>
              <Check size={14} aria-hidden='true' /> Selected
            </>
          ) : (
            'Select'
          )}
        </Button>

        <Button
          variant='secondary'
          size='small'
          onClick={e => {
            e.stopPropagation();
            onViewDetails(release);
          }}
        >
          View Details
        </Button>

        {onAddToDiscardPile && !isInDiscardPile && (
          <Button
            variant='warning'
            size='small'
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onAddToDiscardPile(item);
            }}
            title='Add to discard pile'
          >
            <Package size={14} aria-hidden='true' /> Discard
          </Button>
        )}

        {isInDiscardPile && (
          <span className='discard-pile-indicator'>In Discard Pile</span>
        )}
      </div>
    </div>
  );
};

export default React.memo(AlbumCard);
