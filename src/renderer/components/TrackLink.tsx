import React, { useCallback } from 'react';

import { ROUTES, navigate } from '../routes';

interface TrackLinkProps {
  artist: string;
  track: string;
  album?: string;
  className?: string;
}

/**
 * Clickable track name that navigates to TrackDetailPage.
 * Stores a JSON object { artist, track, album } under 'selectedTrack' in
 * localStorage and passes the current page as a `?from=` query param so the
 * detail page can render a correct back link.
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
      localStorage.setItem(
        'selectedTrack',
        JSON.stringify({ artist, track, album })
      );
      navigate(ROUTES.TRACK_DETAIL, { from: currentPage });
    },
    [artist, track, album]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const currentPage = window.location.hash.replace('#', '').split('?')[0];
        localStorage.setItem(
          'selectedTrack',
          JSON.stringify({ artist, track, album })
        );
        navigate(ROUTES.TRACK_DETAIL, { from: currentPage });
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
