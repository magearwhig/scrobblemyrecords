import React from 'react';

import {
  AlbumPlayCount,
  ArtistPlayCount,
  CollectionItem,
  DateRange,
  LabelPlayCount,
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
import LabelLink from '../LabelLink';
import { RankedRow } from '../RankedRow';
import TrackLink from '../TrackLink';

import './TopList.css';

import { Period, PeriodSelector } from './PeriodSelector';

/** Lists with an all-time view on the history page */
const VIEW_ALL_LABELS: Partial<Record<TopListProps['type'], string>> = {
  artists: 'Artists',
  albums: 'Albums',
  tracks: 'Tracks',
};

type TopListItem =
  | ArtistPlayCount
  | AlbumPlayCount
  | TrackPlayCount
  | LabelPlayCount;

interface TopListProps {
  title: string;
  type: 'artists' | 'albums' | 'tracks' | 'labels';
  data:
    | ArtistPlayCount[]
    | AlbumPlayCount[]
    | TrackPlayCount[]
    | LabelPlayCount[];
  /** Without it the list has no period buttons (the page sets the period) */
  onPeriodChange?: (period: Period, dateRange?: DateRange) => void;
  currentPeriod?: Period;
  loading?: boolean;
  customDateRange?: DateRange;
  collectionMap?: Map<string, CollectionItem>;
  collectionArtistCounts?: Map<string, number>;
  /** Cover of an owned record per artist, shown when there's no photo */
  collectionArtistCovers?: Map<string, string>;
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
  const isLabelData = (item: TopListItem): item is LabelPlayCount =>
    'labelKey' in item;

  const isAlbumData = (item: TopListItem): item is AlbumPlayCount => {
    return 'album' in item && !('track' in item);
  };

  const isTrackData = (item: TopListItem): item is TrackPlayCount => {
    return 'track' in item;
  };

  const getDescription = (): string => {
    if (type === 'artists') {
      return 'Your most played artists by scrobble count.';
    }
    if (type === 'tracks') {
      return 'Your most played tracks by scrobble count.';
    }
    if (type === 'labels') {
      return 'Your most played record labels by scrobble count.';
    }
    return 'Your most played albums by scrobble count.';
  };

  const getEmptyMessage = (): string => {
    if (type === 'artists') return 'artists';
    if (type === 'tracks') return 'tracks';
    if (type === 'labels') return 'labels';
    return 'albums';
  };

  return (
    <div className='top-list'>
      <div className='top-list-header'>
        <div>
          <h3>{title}</h3>
          <p className='top-list-description'>{getDescription()}</p>
        </div>
        {onPeriodChange && (
          <PeriodSelector
            currentPeriod={currentPeriod ?? 'month'}
            onPeriodChange={onPeriodChange}
            customDateRange={customDateRange}
          />
        )}
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
              {(data as TopListItem[]).map((item, index) => {
                if (isLabelData(item)) {
                  return (
                    <RankedRow
                      key={item.labelKey}
                      rank={index + 1}
                      imageKind='album'
                      imageUrl={item.coverUrl}
                      imageAlt={`${item.label} record`}
                      title={<LabelLink label={item.label} />}
                      subtitle={`${item.albumCount.toLocaleString()} ${
                        item.albumCount === 1 ? 'album' : 'albums'
                      }`}
                      playCount={item.playCount}
                    />
                  );
                }
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
            {VIEW_ALL_LABELS[type] && (
              <div className='top-list-view-all'>
                <a
                  href={`#history?view=${type}`}
                  className='top-list-view-all-link'
                >
                  View all-time {VIEW_ALL_LABELS[type].toLowerCase()}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TopList;
