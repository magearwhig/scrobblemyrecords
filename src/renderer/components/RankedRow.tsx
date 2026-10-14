import { Play } from 'lucide-react';
import React from 'react';

import { IconButton } from './ui/Button';
import './RankedRow.css';

/**
 * Placeholder SVG for album covers
 */
const AlbumPlaceholder: React.FC = () => (
  <svg
    className='ranked-row-placeholder'
    viewBox='0 0 40 40'
    width='40'
    height='40'
    aria-hidden='true'
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
    className='ranked-row-placeholder'
    viewBox='0 0 40 40'
    width='40'
    height='40'
    aria-hidden='true'
  >
    <rect width='40' height='40' fill='var(--bg-tertiary)' rx='20' />
    <circle cx='20' cy='16' r='6' fill='var(--text-muted)' />
    <path d='M10 35 C10 27 30 27 30 35' fill='var(--text-muted)' />
  </svg>
);

export interface RankedRowProps {
  /** Position in the ranking; omitted when the list isn't a ranking */
  rank?: number;
  /** Album covers are square, artist photos round */
  imageKind: 'album' | 'artist';
  imageUrl?: string | null;
  imageAlt: string;
  /** Main line, usually a link */
  title: React.ReactNode;
  /** Shown after the title, e.g. an "Owned" badge */
  badge?: React.ReactNode;
  /** Second line, e.g. the artist */
  subtitle?: React.ReactNode;
  /**
   * Plays relative to the top item (0 to 1), drawn as a bar where the row
   * has room for it
   */
  share?: number;
  /** When first and last played; shown as columns where there is room */
  firstPlayed?: React.ReactNode;
  lastPlayed?: React.ReactNode;
  /** Plays the item on Spotify; the button is left out without it */
  onPlay?: () => void;
  playCount: number;
}

/**
 * One row of a ranked list of artists, albums or tracks, as on the Stats
 * page's top lists and the History page's full lists.
 */
export const RankedRow: React.FC<RankedRowProps> = ({
  rank,
  imageKind,
  imageUrl,
  imageAlt,
  title,
  badge,
  subtitle,
  share,
  firstPlayed,
  lastPlayed,
  onPlay,
  playCount,
}) => (
  <li
    className={`ranked-row${rank === undefined ? ' ranked-row--unranked' : ''}`}
  >
    {rank !== undefined && <span className='ranked-row-rank'>{rank}</span>}
    <div className={`ranked-row-cover ranked-row-cover--${imageKind}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={imageAlt} loading='lazy' />
      ) : imageKind === 'artist' ? (
        <ArtistPlaceholder />
      ) : (
        <AlbumPlaceholder />
      )}
    </div>
    <div className='ranked-row-info'>
      <div className='ranked-row-name'>
        <span className='ranked-row-name-text'>{title}</span>
        {badge}
      </div>
      {subtitle && <div className='ranked-row-subtitle'>{subtitle}</div>}
    </div>
    {share !== undefined && (
      <div className='ranked-row-bar' aria-hidden='true'>
        <div
          className='ranked-row-bar-fill'
          ref={el => {
            el?.style.setProperty(
              '--share',
              `${Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10}%`
            );
          }}
        />
      </div>
    )}
    {firstPlayed !== undefined && (
      <div className='ranked-row-date ranked-row-date--first'>
        {firstPlayed}
      </div>
    )}
    {lastPlayed !== undefined && (
      <div className='ranked-row-date ranked-row-date--last'>{lastPlayed}</div>
    )}
    {onPlay && (
      <IconButton
        icon={<Play size={14} aria-hidden='true' />}
        aria-label='Play on Spotify'
        variant='ghost'
        size='small'
        className='ranked-row-play-btn'
        onClick={onPlay}
        title='Play on Spotify'
      />
    )}
    <div
      className='ranked-row-count'
      title={`${playCount.toLocaleString()} ${playCount === 1 ? 'play' : 'plays'}`}
    >
      {playCount.toLocaleString()}
      <span className='sr-only'>{playCount === 1 ? ' play' : ' plays'}</span>
    </div>
  </li>
);

/**
 * Column labels for rows that have date columns, shown only where the
 * columns are (wide lists)
 */
export const RankedListHeader: React.FC = () => (
  <div className='ranked-list-header' aria-hidden='true'>
    <span className='ranked-list-header-name'>Name</span>
    <span className='ranked-list-header-bar'>Share of plays</span>
    <span className='ranked-row-date ranked-row-date--first'>First played</span>
    <span className='ranked-row-date ranked-row-date--last'>Last played</span>
    <span className='ranked-list-header-count'>Plays</span>
  </div>
);

export default RankedRow;
