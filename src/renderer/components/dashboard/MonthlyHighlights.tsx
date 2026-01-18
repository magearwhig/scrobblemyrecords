import React from 'react';

import { DashboardTopAlbum, DashboardTopArtist } from '../../../shared/types';

interface MonthlyHighlightsProps {
  artists: DashboardTopArtist[];
  albums: DashboardTopAlbum[];
}

/**
 * Monthly highlights section showing top artists and albums for the current month.
 * Displays in two columns: artists on the left, albums on the right.
 */
export const MonthlyHighlights: React.FC<MonthlyHighlightsProps> = ({
  artists,
  albums,
}) => {
  const currentMonth = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  if (artists.length === 0 && albums.length === 0) {
    return null;
  }

  return (
    <div className='dashboard-section'>
      <h3 className='dashboard-section-header'>This Month</h3>
      <p className='dashboard-section-subtitle'>{currentMonth}</p>

      <div className='dashboard-highlights-grid'>
        {/* Top Artists */}
        {artists.length > 0 && (
          <div className='dashboard-highlights-column'>
            <h4 className='dashboard-highlights-title'>Top Artists</h4>
            <ol className='dashboard-highlights-list'>
              {artists.map((artist, index) => (
                <li key={artist.name} className='dashboard-highlight-item'>
                  <span className='dashboard-highlight-rank'>{index + 1}</span>
                  <div className='dashboard-highlight-avatar'>
                    {artist.imageUrl ? (
                      <img src={artist.imageUrl} alt={artist.name} />
                    ) : (
                      <span className='dashboard-highlight-avatar-placeholder'>
                        {artist.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className='dashboard-highlight-info'>
                    <span className='dashboard-highlight-name'>
                      {artist.name}
                    </span>
                    <span className='dashboard-highlight-count'>
                      {artist.playCount} plays
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Top Albums */}
        {albums.length > 0 && (
          <div className='dashboard-highlights-column'>
            <h4 className='dashboard-highlights-title'>Top Albums</h4>
            <ol className='dashboard-highlights-list'>
              {albums.map((album, index) => (
                <li
                  key={`${album.artist}-${album.album}`}
                  className='dashboard-highlight-item'
                >
                  <span className='dashboard-highlight-rank'>{index + 1}</span>
                  <div className='dashboard-highlight-cover'>
                    {album.coverUrl ? (
                      <img src={album.coverUrl} alt={`${album.album} cover`} />
                    ) : (
                      <span className='dashboard-highlight-cover-placeholder'>
                        💿
                      </span>
                    )}
                  </div>
                  <div className='dashboard-highlight-info'>
                    <span className='dashboard-highlight-name'>
                      {album.album}
                    </span>
                    <span className='dashboard-highlight-artist'>
                      {album.artist}
                    </span>
                    <span className='dashboard-highlight-count'>
                      {album.playCount} plays
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};

export default MonthlyHighlights;
