import React, { useCallback } from 'react';

import { ROUTES, navigate } from '../routes';

interface AlbumLinkProps {
  artist: string;
  album: string;
  className?: string;
}

/**
 * Clickable album name that navigates to AlbumDetailPage.
 * Stores a JSON object { artist, album } under 'selectedAlbum' in localStorage
 * and passes the current page as a `?from=` query param so the detail page can
 * render a correct back link. Mirrors {@link ArtistLink} and {@link TrackLink}.
 */
const AlbumLink: React.FC<AlbumLinkProps> = ({
  artist,
  album,
  className = '',
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const currentPage = window.location.hash.replace('#', '').split('?')[0];
      localStorage.setItem('selectedAlbum', JSON.stringify({ artist, album }));
      navigate(ROUTES.ALBUM_DETAIL, { from: currentPage });
    },
    [artist, album]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const currentPage = window.location.hash.replace('#', '').split('?')[0];
        localStorage.setItem(
          'selectedAlbum',
          JSON.stringify({ artist, album })
        );
        navigate(ROUTES.ALBUM_DETAIL, { from: currentPage });
      }
    },
    [artist, album]
  );

  return (
    <span
      className={`album-link ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role='link'
      tabIndex={0}
      aria-label={`View album details for ${album}`}
    >
      {album}
    </span>
  );
};

export default AlbumLink;
