import React, { useCallback } from 'react';

import { DashboardRecentAlbum } from '../../../shared/types';
import { formatLocalTimeClean } from '../../utils/dateUtils';

interface RecentAlbumsProps {
  albums: DashboardRecentAlbum[];
  timezone?: string;
}

/**
 * Compact list of recently played albums.
 * Shows album cover, artist, title, and when it was last played.
 * Clicking navigates to collection if owned, or shows details if not.
 */
export const RecentAlbums: React.FC<RecentAlbumsProps> = ({
  albums,
  timezone,
}) => {
  // Navigation helper using hash-based routing
  const navigate = useCallback((path: string) => {
    window.location.hash = path.startsWith('/') ? path.slice(1) : path;
  }, []);

  if (albums.length === 0) {
    return null;
  }

  const handleAlbumClick = (album: DashboardRecentAlbum) => {
    if (album.inCollection && album.releaseId) {
      navigate(`collection?release=${album.releaseId}`);
    }
    // For non-collection albums, we could show a modal or do nothing
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return `Today, ${formatLocalTimeClean(date)}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  return (
    <div className='dashboard-section'>
      <div className='dashboard-section-header-row'>
        <h3 className='dashboard-section-header'>Recent Activity</h3>
        {timezone && (
          <span className='dashboard-section-subtitle'>
            Times in {timezone}
          </span>
        )}
      </div>
      <div className='dashboard-recent-albums'>
        {albums.map((album, index) => (
          <button
            key={`${album.artist}-${album.album}-${index}`}
            className={`dashboard-album-item ${album.inCollection ? 'dashboard-album-item-clickable' : ''}`}
            onClick={() => handleAlbumClick(album)}
            type='button'
            disabled={!album.inCollection}
          >
            <div className='dashboard-album-cover'>
              {album.coverUrl ? (
                <img src={album.coverUrl} alt={`${album.album} cover`} />
              ) : (
                <div className='dashboard-album-cover-placeholder'>💿</div>
              )}
            </div>
            <div className='dashboard-album-info'>
              <div className='dashboard-album-title'>{album.album}</div>
              <div className='dashboard-album-artist'>{album.artist}</div>
            </div>
            <div className='dashboard-album-time'>
              {formatTimestamp(album.lastPlayed)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default RecentAlbums;
