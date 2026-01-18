import React from 'react';

import { MissingArtist } from '../../../shared/types';

type ArtistSortOption = 'plays' | 'artist' | 'albums' | 'recent';

interface MissingArtistsTabProps {
  missingArtists: MissingArtist[];
  artistSort: ArtistSortOption;
  setArtistSort: (sort: ArtistSortOption) => void;
  formatDate: (timestamp: number) => string;
  openLink: (url: string) => void;
  getLastFmArtistUrl: (artist: string) => string;
  getDiscogsArtistUrl: (artist: string) => string;
  openArtistMapping: (artist: MissingArtist) => void;
  handleHideArtist: (artist: MissingArtist) => void;
}

const MissingArtistsTab: React.FC<MissingArtistsTabProps> = ({
  missingArtists,
  artistSort,
  setArtistSort,
  formatDate,
  openLink,
  getLastFmArtistUrl,
  getDiscogsArtistUrl,
  openArtistMapping,
  handleHideArtist,
}) => {
  // Sort artists based on selected option
  const sortedArtists = [...missingArtists].sort((a, b) => {
    switch (artistSort) {
      case 'plays':
        return b.playCount - a.playCount;
      case 'artist':
        return a.artist.localeCompare(b.artist);
      case 'albums':
        return b.albumCount - a.albumCount;
      case 'recent':
        return b.lastPlayed - a.lastPlayed;
      default:
        return 0;
    }
  });

  return (
    <div className='discovery-section'>
      <div className='discovery-section-header'>
        <h2>Artists You Listen To But Don't Own</h2>
        <div className='discovery-sort'>
          <label htmlFor='artist-sort'>Sort by:</label>
          <select
            id='artist-sort'
            value={artistSort}
            onChange={e => setArtistSort(e.target.value as ArtistSortOption)}
          >
            <option value='plays'>Most Plays</option>
            <option value='artist'>Artist Name</option>
            <option value='albums'>Most Albums</option>
            <option value='recent'>Recently Played</option>
          </select>
        </div>
      </div>
      {missingArtists.length === 0 ? (
        <p className='empty-state'>
          No missing artists found. You have a complete collection!
        </p>
      ) : (
        <div className='missing-list'>
          {sortedArtists.map((artist, index) => (
            <div key={`${artist.artist}-${index}`} className='missing-item'>
              <div className='missing-item-info'>
                <div className='missing-item-title'>{artist.artist}</div>
                <div className='missing-item-artist'>
                  {artist.albumCount} album
                  {artist.albumCount > 1 ? 's' : ''} in history
                </div>
              </div>
              <div className='missing-item-stats'>
                <span className='missing-item-playcount'>
                  {artist.playCount} plays
                </span>
                <span>Last: {formatDate(artist.lastPlayed)}</span>
              </div>
              <div className='missing-item-actions'>
                <button
                  className='btn btn-small btn-icon'
                  onClick={() => openLink(getLastFmArtistUrl(artist.artist))}
                  title='View artist on Last.fm'
                >
                  Last.fm
                </button>
                <button
                  className='btn btn-small btn-icon'
                  onClick={() => openLink(getDiscogsArtistUrl(artist.artist))}
                  title='Search artist on Discogs'
                >
                  Discogs
                </button>
                <button
                  className='btn btn-small btn-secondary'
                  onClick={() => openArtistMapping(artist)}
                  title='Map to collection artist'
                >
                  Map
                </button>
                <button
                  className='btn btn-small btn-link'
                  onClick={() => handleHideArtist(artist)}
                  title='Hide from discovery (e.g., podcasts)'
                >
                  Hide
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MissingArtistsTab;
