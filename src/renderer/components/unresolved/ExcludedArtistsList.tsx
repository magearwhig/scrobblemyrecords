import { Eye } from 'lucide-react';
import React from 'react';

import { ExcludedHistoryArtist } from '../../../shared/types';
import { Button } from '../ui/Button';
import { ListItemSkeleton } from '../ui/Skeleton';

import './ExcludedArtistsList.css';
import { pluralize } from './unresolvedFormat';

export interface ExcludedArtistsListProps {
  artists: ExcludedHistoryArtist[];
  loading: boolean;
  /** Normalized key of the artist currently being restored */
  restoringArtist: string | null;
  onTrackAgain: (artist: ExcludedHistoryArtist) => void;
}

/** Artists left out of listening stats, each with a "Track again" action. */
export const ExcludedArtistsList: React.FC<ExcludedArtistsListProps> = ({
  artists,
  loading,
  restoringArtist,
  onTrackAgain,
}) => {
  return (
    <section
      id='unresolved-excluded-panel'
      className='card unresolved-excluded'
      aria-labelledby='unresolved-excluded-title'
    >
      <h3 id='unresolved-excluded-title' className='unresolved-excluded-title'>
        Not tracked
      </h3>
      <p className='unresolved-excluded-description'>
        Plays by these artists are kept in your history but left out of all
        listening stats. Track an artist again to count its plays right away.
      </p>

      {loading && artists.length === 0 && <ListItemSkeleton count={3} />}

      {!loading && artists.length === 0 && (
        <p className='unresolved-excluded-empty'>Every artist is tracked.</p>
      )}

      {artists.length > 0 && (
        <ul className='unresolved-excluded-list'>
          {artists.map(artist => (
            <li key={artist.artist} className='unresolved-excluded-item'>
              <div className='unresolved-excluded-item-text'>
                <span className='unresolved-excluded-item-name'>
                  {artist.artistName}
                </span>
                <span className='unresolved-excluded-item-plays'>
                  {pluralize(artist.plays, 'play')}
                </span>
              </div>
              <Button
                variant='ghost'
                size='small'
                onClick={() => onTrackAgain(artist)}
                loading={restoringArtist === artist.artist}
                disabled={
                  restoringArtist !== null && restoringArtist !== artist.artist
                }
                aria-label={`Track again: ${artist.artistName}`}
                iconLeft={<Eye size={16} aria-hidden='true' />}
              >
                Track again
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ExcludedArtistsList;
