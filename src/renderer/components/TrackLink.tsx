import React, { useCallback } from 'react';

import { ROUTES } from '../routes';

interface TrackLinkProps {
  artist: string;
  track: string;
  album?: string;
  className?: string;
}

/**
 * Clickable track name that navigates to TrackDetailPage.
 * Stores a JSON object { artist, track, album } under 'selectedTrack'
 * and the current route under 'previousPage' in localStorage before navigating.
 */
const TrackLink: React.FC<TrackLinkProps> = ({
  artist,
  track,
  album,
  className = '',
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const currentPage = window.location.hash.replace('#', '').split('?')[0];
      localStorage.setItem('previousPage', currentPage);
      localStorage.setItem(
        'selectedTrack',
        JSON.stringify({ artist, track, album })
      );
      window.location.hash = `#${ROUTES.TRACK_DETAIL}`;
    },
    [artist, track, album]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const currentPage = window.location.hash.replace('#', '').split('?')[0];
        localStorage.setItem('previousPage', currentPage);
        localStorage.setItem(
          'selectedTrack',
          JSON.stringify({ artist, track, album })
        );
        window.location.hash = `#${ROUTES.TRACK_DETAIL}`;
      }
    },
    [artist, track, album]
  );

  return (
    <span
      className={`track-link ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role='link'
      tabIndex={0}
      aria-label={`View track details for ${track}`}
    >
      {track}
    </span>
  );
};

export default TrackLink;
