import React, { useState } from 'react';

import {
  AlbumPlayCount,
  ArtistPlayCount,
  DateRange,
  TrackPlayCount,
} from '../../../shared/types';

import DateRangePicker from './DateRangePicker';

type Period =
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'days30'
  | 'days90'
  | 'days365'
  | 'custom';

interface TopListProps {
  title: string;
  type: 'artists' | 'albums' | 'tracks';
  data: ArtistPlayCount[] | AlbumPlayCount[] | TrackPlayCount[];
  onPeriodChange: (period: Period, dateRange?: DateRange) => void;
  currentPeriod: Period;
  loading?: boolean;
  customDateRange?: DateRange;
}

/**
 * Placeholder SVG for album covers
 */
const AlbumPlaceholder: React.FC = () => (
  <svg
    className='top-list-placeholder'
    viewBox='0 0 40 40'
    width='40'
    height='40'
  >
    <rect width='40' height='40' fill='var(--bg-tertiary)' rx='4' />
    <circle
      cx='20'
      cy='20'
      r='12'
      fill='none'
      stroke='var(--text-muted)'
      strokeWidth='1'
    />
    <circle
      cx='20'
      cy='20'
      r='4'
      fill='none'
      stroke='var(--text-muted)'
      strokeWidth='1'
    />
  </svg>
);

/**
 * Placeholder SVG for artist images
 */
const ArtistPlaceholder: React.FC = () => (
  <svg
    className='top-list-placeholder'
    viewBox='0 0 40 40'
    width='40'
    height='40'
  >
    <rect width='40' height='40' fill='var(--bg-tertiary)' rx='20' />
    <circle cx='20' cy='16' r='6' fill='var(--text-muted)' />
    <path d='M10 35 C10 27 30 27 30 35' fill='var(--text-muted)' />
  </svg>
);

/**
 * Format date range for display in button
 */
function formatDateRangeLabel(dateRange: DateRange): string {
  const start = new Date(dateRange.startDate * 1000);
  const end = new Date(dateRange.endDate * 1000);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  const startMonth = start.getMonth();
  const startYear = start.getFullYear();
  const endMonth = end.getMonth();
  const endYear = end.getFullYear();

  if (startYear === endYear && startMonth === endMonth) {
    return `${months[startMonth]} ${startYear}`;
  }
  if (startYear === endYear) {
    return `${months[startMonth]} - ${months[endMonth]} ${startYear}`;
  }
  return `${months[startMonth]} '${String(startYear).slice(-2)} - ${months[endMonth]} '${String(endYear).slice(-2)}`;
}

/**
 * Top artists or albums list with period selector
 */
export const TopList: React.FC<TopListProps> = ({
  title,
  type,
  data,
  onPeriodChange,
  currentPeriod,
  loading,
  customDateRange,
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const periods: Array<{ value: Period; label: string }> = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
    { value: 'days30', label: '30 Days' },
    { value: 'days90', label: '90 Days' },
    { value: 'days365', label: '365 Days' },
    { value: 'all', label: 'All Time' },
  ];

  const isAlbumData = (
    item: ArtistPlayCount | AlbumPlayCount | TrackPlayCount
  ): item is AlbumPlayCount => {
    return 'album' in item && !('track' in item);
  };

  const isTrackData = (
    item: ArtistPlayCount | AlbumPlayCount | TrackPlayCount
  ): item is TrackPlayCount => {
    return 'track' in item;
  };

  const getDescription = (): string => {
    if (type === 'artists') {
      return 'Your most played artists by scrobble count.';
    }
    if (type === 'tracks') {
      return 'Your most played tracks by scrobble count.';
    }
    return 'Your most played albums by scrobble count.';
  };

  const getEmptyMessage = (): string => {
    if (type === 'artists') return 'artists';
    if (type === 'tracks') return 'tracks';
    return 'albums';
  };

  const handlePeriodClick = (period: Period) => {
    if (period === 'custom') {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
      onPeriodChange(period);
    }
  };

  const handleDateRangeApply = (dateRange: DateRange) => {
    onPeriodChange('custom', dateRange);
    setShowDatePicker(false);
  };

  const customLabel =
    currentPeriod === 'custom' && customDateRange
      ? formatDateRangeLabel(customDateRange)
      : 'Custom';

  return (
    <div className='top-list'>
      <div className='top-list-header'>
        <div>
          <h3>{title}</h3>
          <p className='top-list-description'>{getDescription()}</p>
        </div>
        <div className='top-list-period-selector-wrapper'>
          <div className='top-list-period-selector'>
            {periods.map(period => (
              <button
                key={period.value}
                className={`top-list-period-btn ${currentPeriod === period.value ? 'active' : ''}`}
                onClick={() => handlePeriodClick(period.value)}
              >
                {period.label}
              </button>
            ))}
            <button
              className={`top-list-period-btn ${currentPeriod === 'custom' ? 'active' : ''}`}
              onClick={() => handlePeriodClick('custom')}
            >
              {customLabel}
            </button>
          </div>
          <DateRangePicker
            isOpen={showDatePicker}
            onClose={() => setShowDatePicker(false)}
            onApply={handleDateRangeApply}
            initialDateRange={customDateRange}
          />
        </div>
      </div>

      <div className='top-list-content'>
        {loading ? (
          <div className='top-list-loading'>Loading...</div>
        ) : data.length === 0 ? (
          <div className='top-list-empty'>
            No {getEmptyMessage()} for this period
          </div>
        ) : (
          <ol className='top-list-items'>
            {data.map((item, index) => (
              <li key={index} className='top-list-item'>
                <span className='top-list-rank'>{index + 1}</span>
                <div className='top-list-cover'>
                  {isAlbumData(item) ? (
                    item.coverUrl ? (
                      <img
                        src={item.coverUrl}
                        alt={`${item.album} cover`}
                        loading='lazy'
                      />
                    ) : (
                      <AlbumPlaceholder />
                    )
                  ) : isTrackData(item) ? (
                    <AlbumPlaceholder />
                  ) : (item as ArtistPlayCount).imageUrl ? (
                    <img
                      src={(item as ArtistPlayCount).imageUrl}
                      alt={`${item.artist}`}
                      loading='lazy'
                    />
                  ) : (
                    <ArtistPlaceholder />
                  )}
                </div>
                <div className='top-list-info'>
                  {isTrackData(item) ? (
                    <>
                      <div className='top-list-name'>{item.track}</div>
                      <div className='top-list-artist'>{item.artist}</div>
                    </>
                  ) : isAlbumData(item) ? (
                    <>
                      <div className='top-list-name'>{item.album}</div>
                      <div className='top-list-artist'>{item.artist}</div>
                    </>
                  ) : (
                    <div className='top-list-name'>{item.artist}</div>
                  )}
                </div>
                <div className='top-list-count'>
                  {item.playCount.toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

export default TopList;
