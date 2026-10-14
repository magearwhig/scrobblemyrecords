import React, { useState } from 'react';

import {
  AlbumPlayCount,
  ArtistPlayCount,
  CollectionItem,
  DateRange,
  TrackPlayCount,
} from '../../../shared/types';
import { toDisplayName } from '../../../shared/utils/displayName';
import { normalizeForMatching } from '../../../shared/utils/trackNormalization';
import { Badge } from '../../components/ui/Badge';
import {
  playTrackOnSpotify,
  playAlbumOnSpotify,
  playArtistOnSpotify,
} from '../../utils/spotifyUtils';
import AlbumLink from '../AlbumLink';
import ArtistLink from '../ArtistLink';
import { RankedRow } from '../RankedRow';
import TrackLink from '../TrackLink';

import DateRangePicker from './DateRangePicker';
import './TopList.css';

type Period =
  | 'week'
  | 'month'
  | 'year'
  | 'all'
  | 'days30'
  | 'days90'
  | 'days365'
  | 'custom';

const VIEW_ALL_LABELS: Record<TopListProps['type'], string> = {
  artists: 'Artists',
  albums: 'Albums',
  tracks: 'Tracks',
};

interface TopListProps {
  title: string;
  type: 'artists' | 'albums' | 'tracks';
  data: ArtistPlayCount[] | AlbumPlayCount[] | TrackPlayCount[];
  onPeriodChange: (period: Period, dateRange?: DateRange) => void;
  currentPeriod: Period;
  loading?: boolean;
  customDateRange?: DateRange;
  collectionMap?: Map<string, CollectionItem>;
  collectionArtistCounts?: Map<string, number>;
  /** Cover of an owned record per artist, shown when there's no photo */
  collectionArtistCovers?: Map<string, string>;
}

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
  collectionMap,
  collectionArtistCounts,
  collectionArtistCovers,
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
          <>
            <ol className='ranked-list'>
              {data.map((item, index) => {
                const artistLink = (
                  <ArtistLink
                    artist={item.artist}
                    label={toDisplayName(item.artist)}
                  />
                );
                if (isTrackData(item)) {
                  return (
                    <RankedRow
                      key={index}
                      rank={index + 1}
                      imageKind='album'
                      imageAlt={`${item.album} cover`}
                      title={
                        <TrackLink
                          artist={item.artist}
                          track={item.track}
                          album={item.album}
                        />
                      }
                      subtitle={artistLink}
                      onPlay={() =>
                        playTrackOnSpotify(item.artist, item.track, item.album)
                      }
                      playCount={item.playCount}
                    />
                  );
                }
                if (isAlbumData(item)) {
                  const owned =
                    item.inCollection ||
                    !!collectionMap?.has(
                      `${normalizeForMatching(item.artist)}|${normalizeForMatching(item.album)}`
                    );
                  return (
                    <RankedRow
                      key={index}
                      rank={index + 1}
                      imageKind='album'
                      imageUrl={item.coverUrl}
                      imageAlt={`${item.album} cover`}
                      title={
                        <AlbumLink artist={item.artist} album={item.album} />
                      }
                      badge={
                        owned && (
                          <Badge variant='success' size='small'>
                            Owned
                          </Badge>
                        )
                      }
                      subtitle={artistLink}
                      onPlay={() => playAlbumOnSpotify(item.artist, item.album)}
                      playCount={item.playCount}
                    />
                  );
                }
                const ownedCount = collectionArtistCounts?.get(
                  normalizeForMatching(item.artist)
                );
                return (
                  <RankedRow
                    key={index}
                    rank={index + 1}
                    imageKind='artist'
                    imageUrl={
                      (item as ArtistPlayCount).imageUrl ||
                      collectionArtistCovers?.get(
                        normalizeForMatching(item.artist)
                      )
                    }
                    imageAlt={item.artist}
                    title={artistLink}
                    badge={
                      !!ownedCount &&
                      ownedCount > 0 && (
                        <Badge variant='success' size='small'>
                          {ownedCount} owned
                        </Badge>
                      )
                    }
                    onPlay={() => playArtistOnSpotify(item.artist)}
                    playCount={item.playCount}
                  />
                );
              })}
            </ol>
            <div className='top-list-view-all'>
              <a
                href={`#history?view=${type}`}
                className='top-list-view-all-link'
              >
                View all-time {VIEW_ALL_LABELS[type].toLowerCase()}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TopList;
