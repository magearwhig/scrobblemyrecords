import React, { useCallback } from 'react';

import { ROUTES } from '../routes';

interface ArtistLinkProps {
  artist: string;
  className?: string;
}

/**
 * Clickable artist name that navigates to ArtistDetailPage.
 * Stores 'selectedArtist' and 'previousPage' in localStorage before navigating,
 * enabling the detail page to load the correct artist and show a back link.
 */
const ArtistLink: React.FC<ArtistLinkProps> = ({ artist, className = '' }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const currentPage = window.location.hash.replace('#', '').split('?')[0];
      localStorage.setItem('previousPage', currentPage);
      localStorage.setItem('selectedArtist', artist);
      window.location.hash = `#${ROUTES.ARTIST_DETAIL}`;
    },
    [artist]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const currentPage = window.location.hash.replace('#', '').split('?')[0];
        localStorage.setItem('previousPage', currentPage);
        localStorage.setItem('selectedArtist', artist);
        window.location.hash = `#${ROUTES.ARTIST_DETAIL}`;
      }
    },
    [artist]
  );

  return (
    <span
      className={`artist-link ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role='link'
      tabIndex={0}
      aria-label={`View artist details for ${artist}`}
    >
      {artist}
    </span>
  );
};

export default ArtistLink;
