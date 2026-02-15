import React, { useCallback, useEffect, useRef } from 'react';

import { DateAlbumsResult } from '../../../shared/types';

interface HeatmapDayDetailProps {
  /** Selected date in YYYY-MM-DD format, displayed as a formatted heading */
  date: string;
  /** Albums played on the selected date, sorted by play count descending */
  albums: DateAlbumsResult['albums'];
  /** Total scrobble count for the selected date (may exceed sum of album plays if some plays lack album info) */
  totalScrobbles: number;
  /** Callback to dismiss the detail panel, triggered by close button or Escape key */
  onClose: () => void;
}

/**
 * Detail panel showing albums played on a specific date,
 * rendered below the CalendarHeatmap when a day cell is clicked.
 */
export const HeatmapDayDetail: React.FC<HeatmapDayDetailProps> = ({
  date,
  albums,
  totalScrobbles,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus the panel on mount for accessibility
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const formatDate = (dateStr: string): string => {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div
      className='heatmap-day-detail'
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      role='region'
      aria-label={`Albums played on ${formatDate(date)}`}
    >
      <div className='heatmap-day-detail-header'>
        <div>
          <h4 className='heatmap-day-detail-date'>{formatDate(date)}</h4>
          <p className='heatmap-day-detail-count'>
            {totalScrobbles} scrobble{totalScrobbles !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          className='heatmap-day-detail-close'
          onClick={onClose}
          aria-label='Close day detail'
        >
          &times;
        </button>
      </div>

      {albums.length === 0 ? (
        <p className='heatmap-day-detail-empty'>No album data for this day.</p>
      ) : (
        <ul className='heatmap-day-detail-albums'>
          {albums.map((album, index) => (
            <li
              key={`${album.artist}-${album.album}-${index}`}
              className='heatmap-day-detail-album'
            >
              {album.coverUrl ? (
                <img
                  src={album.coverUrl}
                  alt={`${album.artist} - ${album.album}`}
                  className='heatmap-day-detail-cover'
                />
              ) : (
                <div className='heatmap-day-detail-cover heatmap-day-detail-cover-placeholder' />
              )}
              <div className='heatmap-day-detail-album-info'>
                <span className='heatmap-day-detail-album-title'>
                  {album.album}
                </span>
                <span className='heatmap-day-detail-album-artist'>
                  {album.artist}
                </span>
              </div>
              <span className='heatmap-day-detail-album-plays'>
                {album.playCount} play{album.playCount !== 1 ? 's' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HeatmapDayDetail;
