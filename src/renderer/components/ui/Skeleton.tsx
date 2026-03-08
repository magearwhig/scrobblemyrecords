import React from 'react';

import './Skeleton.css';
import '../../pages/StatsPage.page.css';

interface SkeletonProps {
  /**
   * Width of the skeleton. Can be a number (px) or string (e.g., '100%', '200px').
   */
  width?: number | string;
  /**
   * Height of the skeleton. Can be a number (px) or string.
   */
  height?: number | string;
  /**
   * Shape variant of the skeleton.
   */
  variant?: 'text' | 'rectangular' | 'circular';
  /**
   * Custom className for additional styling.
   */
  className?: string;
  /**
   * Animation type.
   */
  animation?: 'pulse' | 'wave' | 'none';
}

/**
 * Base skeleton component for building loading states.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = 'rectangular',
  className = '',
  animation = 'pulse',
}) => {
  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={`skeleton skeleton--${variant} skeleton--${animation} ${className}`}
      style={style}
    />
  );
};

/**
 * Skeleton for album card loading states.
 */
export const AlbumCardSkeleton: React.FC<{ count?: number }> = ({
  count = 1,
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className='skeleton-album-card' aria-hidden='true'>
          <Skeleton variant='rectangular' className='skeleton-album-cover' />
          <div className='skeleton-album-info'>
            <Skeleton variant='text' height={16} width='80%' />
            <Skeleton variant='text' height={14} width='60%' />
            <Skeleton variant='text' height={12} width='40%' />
          </div>
        </div>
      ))}
    </>
  );
};

/**
 * Skeleton for stat card loading states.
 */
export const StatCardSkeleton: React.FC<{ count?: number }> = ({
  count = 1,
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className='skeleton-stat-card' aria-hidden='true'>
          <Skeleton variant='text' height={14} width='60%' />
          <Skeleton variant='text' height={32} width='40%' />
        </div>
      ))}
    </>
  );
};

/**
 * Skeleton for list item loading states.
 */
export const ListItemSkeleton: React.FC<{
  count?: number;
  showAvatar?: boolean;
}> = ({ count = 1, showAvatar = false }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className='skeleton-list-item' aria-hidden='true'>
          {showAvatar && (
            <Skeleton
              variant='circular'
              width={40}
              height={40}
              className='skeleton-avatar'
            />
          )}
          <div className='skeleton-list-content'>
            <Skeleton variant='text' height={16} width='70%' />
            <Skeleton variant='text' height={14} width='50%' />
          </div>
        </div>
      ))}
    </>
  );
};

/**
 * Skeleton for table row loading states.
 */
// Stable widths for skeleton columns to avoid visual jitter on re-renders
const SKELETON_COL_WIDTHS = [75, 65, 80, 60, 70, 55, 85, 68];

export const TableRowSkeleton: React.FC<{
  count?: number;
  columns?: number;
}> = ({ count = 1, columns = 4 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, rowIndex) => (
        <tr key={rowIndex} className='skeleton-table-row' aria-hidden='true'>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex}>
              <Skeleton
                variant='text'
                height={16}
                width={`${SKELETON_COL_WIDTHS[(rowIndex * columns + colIndex) % SKELETON_COL_WIDTHS.length]}%`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
};

/**
 * Skeleton for session card loading states (History page).
 */
export const SessionCardSkeleton: React.FC<{ count?: number }> = ({
  count = 1,
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className='card skeleton-session-card'
          aria-hidden='true'
        >
          <div className='skeleton-session-header'>
            <div className='skeleton-session-status'>
              <Skeleton variant='circular' width={24} height={24} />
              <Skeleton variant='text' height={16} width={80} />
            </div>
            <Skeleton variant='text' height={14} width={120} />
          </div>
          <div className='skeleton-session-info'>
            <Skeleton variant='text' height={14} width={100} />
          </div>
          <div className='skeleton-session-covers'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant='rectangular' width={40} height={40} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
};

/**
 * Skeleton for Stats page loading state.
 */
export const StatsPageSkeleton: React.FC = () => {
  return (
    <div className='stats-page' aria-hidden='true'>
      <header className='stats-page-header'>
        <Skeleton variant='text' width={200} height={32} />
      </header>

      {/* Top stat cards row */}
      <section className='stats-cards-row'>
        <StatCardSkeleton count={5} />
      </section>

      {/* Charts row */}
      <section className='stats-charts-row'>
        <div className='skeleton-chart-card'>
          <Skeleton variant='text' width={150} height={20} />
          <Skeleton
            variant='rectangular'
            width='100%'
            height={200}
            className='skeleton-chart'
          />
        </div>
        <div className='skeleton-chart-card'>
          <Skeleton variant='text' width={150} height={20} />
          <Skeleton
            variant='rectangular'
            width='100%'
            height={200}
            className='skeleton-chart'
          />
        </div>
      </section>
    </div>
  );
};

/**
 * Skeleton for Collection page grid loading state.
 */
export const CollectionPageSkeleton: React.FC = () => {
  return (
    <div className='skeleton-collection-grid' aria-hidden='true'>
      <AlbumCardSkeleton count={12} />
    </div>
  );
};

/**
 * Skeleton for ReleaseDetailsPage loading state.
 */
export const ReleaseDetailsSkeleton: React.FC = () => {
  return (
    <div className='card' aria-hidden='true'>
      <div className='skeleton-release-details-header'>
        <Skeleton variant='text' width={180} height={28} />
        <Skeleton variant='rectangular' width={120} height={32} />
      </div>
      <div className='skeleton-release-details-body'>
        <Skeleton variant='rectangular' width={160} height={160} />
        <div className='skeleton-release-details-info'>
          <Skeleton variant='text' width='60%' height={24} />
          <Skeleton variant='text' width='40%' height={18} />
          <Skeleton variant='text' width='30%' height={16} />
          <Skeleton variant='text' width='50%' height={16} />
        </div>
      </div>
      <div className='skeleton-release-details-tracks'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='skeleton-release-track-row'>
            <Skeleton variant='text' width={20} height={14} />
            <Skeleton variant='text' width='60%' height={14} />
            <Skeleton variant='text' width={50} height={14} />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Skeleton for NewReleasesPage loading state.
 */
export const NewReleasesSkeleton: React.FC = () => {
  return (
    <div className='skeleton-new-releases-grid' aria-hidden='true'>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className='skeleton-release-card'>
          <Skeleton variant='rectangular' className='skeleton-release-cover' />
          <div className='skeleton-release-card-info'>
            <Skeleton variant='text' height={16} width='80%' />
            <Skeleton variant='text' height={14} width='60%' />
            <Skeleton variant='text' height={12} width='40%' />
          </div>
        </div>
      ))}
    </div>
  );
};

export default Skeleton;
