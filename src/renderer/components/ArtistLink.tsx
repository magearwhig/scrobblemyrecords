import React, { useCallback } from 'react';

import { ROUTES, navigate } from '../routes';

interface ArtistLinkProps {
  artist: string;
  className?: string;
}

/**
 * Clickable artist name that navigates to ArtistDetailPage.
 * Stores 'selectedArtist' in localStorage and passes the current page as a
 * `?from=` query param so the detail page can render a correct back link.
 */
const ArtistLink: React.FC<ArtistLinkProps> = ({ artist, className = '' }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const currentPage = window.location.hash.replace('#', '').split('?')[0];
      localStorage.setItem('selectedArtist', artist);
      navigate(ROUTES.ARTIST_DETAIL, { from: currentPage });
    },
    [artist]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const currentPage = window.location.hash.replace('#', '').split('?')[0];
        localStorage.setItem('selectedArtist', artist);
        navigate(ROUTES.ARTIST_DETAIL, { from: currentPage });
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
