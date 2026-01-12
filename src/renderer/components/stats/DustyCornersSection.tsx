import React from 'react';

import { DustyCornerAlbum } from '../../../shared/types';

interface DustyCornersSectionProps {
  albums: DustyCornerAlbum[];
  loading?: boolean;
}

/**
 * Placeholder SVG for album covers (vinyl record icon)
 */
const VinylPlaceholder: React.FC = () => (
  <svg
    className='dusty-corners-placeholder'
    viewBox='0 0 100 100'
    width='100%'
    height='100%'
  >
    <rect width='100' height='100' fill='var(--bg-tertiary)' rx='4' />
    <circle
      cx='50'
      cy='50'
      r='38'
      fill='none'
      stroke='var(--text-muted)'
      strokeWidth='2'
    />
    <circle
      cx='50'
      cy='50'
      r='28'
      fill='none'
      stroke='var(--text-muted)'
      strokeWidth='1'
      opacity='0.5'
    />
    <circle
      cx='50'
      cy='50'
      r='18'
      fill='none'
      stroke='var(--text-muted)'
      strokeWidth='1'
      opacity='0.5'
    />
    <circle cx='50' cy='50' r='8' fill='var(--text-muted)' />
  </svg>
);

/**
 * Section showing albums that haven't been played in a while
 */
export const DustyCornersSection: React.FC<DustyCornersSectionProps> = ({
  albums,
  loading,
}) => {
  const formatLastPlayed = (album: DustyCornerAlbum): string => {
    if (album.daysSincePlay === -1 || album.lastPlayed === 0) {
      return 'Never played';
    }
    if (album.daysSincePlay < 30) {
      return `${album.daysSincePlay} days ago`;
    }
    if (album.daysSincePlay < 365) {
      const months = Math.floor(album.daysSincePlay / 30);
      return `${months} month${months !== 1 ? 's' : ''} ago`;
    }
    const years = Math.floor(album.daysSincePlay / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  };

  if (loading) {
    return (
      <div className='dusty-corners-section'>
        <h3>Dusty Corners</h3>
        <div className='dusty-corners-loading'>Loading...</div>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className='dusty-corners-section'>
        <h3>Dusty Corners</h3>
        <div className='dusty-corners-empty'>
          <p>
            No dusty corners! You've been listening to your whole collection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='dusty-corners-section'>
      <div className='dusty-corners-header'>
        <div>
          <h3>Dusty Corners</h3>
          <p className='dusty-corners-description'>
            Albums from your collection that haven't been played in 6+ months.
            Click an album to give it some love!
          </p>
        </div>
      </div>

      <div className='dusty-corners-grid'>
        {albums.slice(0, 8).map(album => (
          <div
            key={`${album.artist}-${album.album}`}
            className='dusty-corners-card'
            onClick={() => {
              // Store release info for ReleaseDetailsPage and navigate
              const releaseInfo = {
                id: album.collectionId,
                title: album.album,
                artist: album.artist,
              };
              localStorage.setItem(
                'selectedRelease',
                JSON.stringify(releaseInfo)
              );
              window.location.hash = 'release-details';
            }}
          >
            <div className='dusty-corners-cover'>
              {album.coverUrl ? (
                <img
                  src={album.coverUrl}
                  alt={`${album.album} cover`}
                  loading='lazy'
                />
              ) : (
                <VinylPlaceholder />
              )}
            </div>
            <div className='dusty-corners-info'>
              <div className='dusty-corners-album' title={album.album}>
                {album.album}
              </div>
              <div className='dusty-corners-artist' title={album.artist}>
                {album.artist}
              </div>
              <div className='dusty-corners-last-played'>
                {formatLastPlayed(album)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {albums.length > 8 && (
        <div className='dusty-corners-more'>
          +{albums.length - 8} more albums need some love
        </div>
      )}
    </div>
  );
};

export default DustyCornersSection;
