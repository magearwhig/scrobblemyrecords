import React from 'react';

import { OnThisDayResult } from '../../../shared/types';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

interface OnThisDayProps {
  /** On This Day data with year-by-year listening history */
  data: OnThisDayResult | null;
  /** When true, renders skeleton placeholders instead of content */
  loading?: boolean;
}

/**
 * Card-based timeline showing what was listened to on this day in previous years
 */
export const OnThisDay: React.FC<OnThisDayProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <div
        className='on-this-day-container'
        aria-label='On This Day in your listening history'
      >
        <h3>On This Day</h3>
        <Skeleton variant='rectangular' width='100%' height={200} />
      </div>
    );
  }

  const hasData =
    data && data.years.length > 0 && data.years.some(y => y.totalScrobbles > 0);

  if (!hasData) {
    return (
      <div
        className='on-this-day-container'
        aria-label='On This Day in your listening history'
      >
        <h3>On This Day</h3>
        <EmptyState
          title='No history for this day'
          description='Come back once you have scrobble data from previous years.'
          size='small'
        />
      </div>
    );
  }

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dateLabel = `${monthNames[data!.date.month - 1]} ${data!.date.day}`;

  return (
    <div
      className='on-this-day-container'
      aria-label='On This Day in your listening history'
    >
      <h3>On This Day &mdash; {dateLabel}</h3>
      <div className='on-this-day-timeline'>
        {data!.years.map(yearEntry => (
          <div
            key={yearEntry.year}
            className='on-this-day-year-card'
            role='group'
            aria-label={`${yearEntry.yearsAgo} year${yearEntry.yearsAgo !== 1 ? 's' : ''} ago — ${yearEntry.totalScrobbles} scrobbles`}
          >
            <div className='on-this-day-year-header'>
              <span className='on-this-day-year-label'>{yearEntry.year}</span>
              <span className='on-this-day-year-ago'>
                {yearEntry.yearsAgo} year{yearEntry.yearsAgo !== 1 ? 's' : ''}{' '}
                ago
              </span>
              <span className='on-this-day-year-scrobbles'>
                {yearEntry.totalScrobbles} scrobble
                {yearEntry.totalScrobbles !== 1 ? 's' : ''}
              </span>
            </div>
            {yearEntry.albums.length > 0 && (
              <ul className='on-this-day-albums'>
                {yearEntry.albums.slice(0, 5).map((album, i) => (
                  <li
                    key={`${album.artist}-${album.album}-${i}`}
                    className='on-this-day-album'
                  >
                    {album.coverUrl ? (
                      <img
                        src={album.coverUrl}
                        alt={`${album.artist} - ${album.album}`}
                        className='on-this-day-album-cover'
                      />
                    ) : (
                      <div className='on-this-day-album-cover on-this-day-album-cover-placeholder' />
                    )}
                    <div className='on-this-day-album-info'>
                      <span className='on-this-day-album-title'>
                        {album.album}
                      </span>
                      <span className='on-this-day-album-artist'>
                        {album.artist}
                      </span>
                    </div>
                    <span className='on-this-day-album-plays'>
                      {album.playCount} play{album.playCount !== 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OnThisDay;
