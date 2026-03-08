import { TrendingDown, TrendingUp } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { RoiScoreItem } from '../../../shared/types';
import { statsApi } from '../../services/statsApi';
import { createLogger } from '../../utils/logger';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import './CollectionROIChart.css';

const logger = createLogger('CollectionROIChart');

const CHART_LIMIT = 20;

interface CollectionROIChartProps {
  limit?: number;
}

/**
 * Placeholder SVG for album covers
 */
const AlbumPlaceholder: React.FC = () => (
  <svg viewBox='0 0 40 40' width='40' height='40' aria-hidden='true'>
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
 * Format a currency value for display
 */
function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Format ROI score for display
 */
function formatRoiScore(score: number): string {
  if (score >= 10) return score.toFixed(1);
  return score.toFixed(2);
}

interface RoiRowProps {
  item: RoiScoreItem;
  rank: number;
  isTopValue: boolean;
}

const RoiRow: React.FC<RoiRowProps> = React.memo(
  ({ item, rank, isTopValue }) => (
    <li className='roi-chart-row'>
      <span className='roi-chart-rank'>{rank}</span>
      <div className='roi-chart-cover'>
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt={`${item.album} cover`}
            loading='lazy'
            width='40'
            height='40'
          />
        ) : (
          <AlbumPlaceholder />
        )}
      </div>
      <div className='roi-chart-info'>
        <span className='roi-chart-album'>{item.album}</span>
        <span className='roi-chart-artist'>{item.artist}</span>
      </div>
      <div className='roi-chart-stats'>
        <span className='roi-chart-plays'>
          {item.playCount.toLocaleString()} plays
        </span>
        <span className='roi-chart-price'>
          {formatCurrency(item.medianPrice, item.currency)}
        </span>
      </div>
      <div
        className={`roi-chart-score ${isTopValue ? 'roi-chart-score--high' : 'roi-chart-score--low'}`}
        title={`${formatRoiScore(item.roiScore)} plays per $1 of market value`}
      >
        {isTopValue ? (
          <TrendingUp size={14} aria-hidden='true' />
        ) : (
          <TrendingDown size={14} aria-hidden='true' />
        )}
        <span aria-label={`${formatRoiScore(item.roiScore)} plays per dollar`}>
          {formatRoiScore(item.roiScore)}
          <span className='roi-chart-score-unit'>x</span>
        </span>
      </div>
    </li>
  )
);
RoiRow.displayName = 'RoiRow';

/**
 * Collection ROI leaderboard: top best-value and worst-value albums
 * based on play count per dollar of market value.
 * Lazy-loaded via IntersectionObserver.
 */
export const CollectionROIChart: React.FC<CollectionROIChartProps> = ({
  limit = CHART_LIMIT,
}) => {
  const [data, setData] = useState<RoiScoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'best' | 'worst'>('best');
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          setLoading(true);
          statsApi
            .getCollectionROI(limit)
            .then(res => {
              if (res.success && res.data) {
                setData(res.data);
              }
            })
            .catch(err => {
              logger.error('Failed to load collection ROI', err);
            })
            .finally(() => {
              setLoading(false);
            });
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [limit]);

  // Best value: highest ROI score (most plays per dollar)
  const topItems = [...data]
    .sort((a, b) => b.roiScore - a.roiScore)
    .slice(0, 10);

  // Worst value: lowest ROI score (fewest plays per dollar)
  const bottomItems = [...data]
    .sort((a, b) => a.roiScore - b.roiScore)
    .slice(0, 10);

  const displayItems = activeTab === 'best' ? topItems : bottomItems;

  return (
    <div
      ref={containerRef}
      className='roi-chart-container'
      aria-label='Collection ROI leaderboard'
    >
      <div className='roi-chart-header'>
        <div>
          <h3>Collection ROI</h3>
          <p className='roi-chart-description'>
            Play count per dollar of market value — your best and worst
            investments.
          </p>
        </div>
        <div className='roi-chart-tabs' role='tablist'>
          <button
            role='tab'
            aria-selected={activeTab === 'best'}
            className={`roi-chart-tab ${activeTab === 'best' ? 'roi-chart-tab--active' : ''}`}
            onClick={() => setActiveTab('best')}
          >
            Best Value
          </button>
          <button
            role='tab'
            aria-selected={activeTab === 'worst'}
            className={`roi-chart-tab ${activeTab === 'worst' ? 'roi-chart-tab--active' : ''}`}
            onClick={() => setActiveTab('worst')}
          >
            Worst Value
          </button>
        </div>
      </div>

      {loading ? (
        <div className='roi-chart-loading' aria-label='Loading ROI data'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='roi-chart-skeleton-row' aria-hidden='true'>
              <Skeleton variant='text' width={24} height={16} />
              <Skeleton variant='rectangular' width={40} height={40} />
              <div className='roi-chart-skeleton-info'>
                <Skeleton variant='text' width='60%' height={14} />
                <Skeleton variant='text' width='40%' height={12} />
              </div>
              <Skeleton variant='text' width={60} height={14} />
            </div>
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title='No collection value data available'
          description='Run a value scan from Collection Analytics to see ROI scores.'
          size='small'
        />
      ) : (
        <ol
          className='roi-chart-list'
          aria-label={`${activeTab === 'best' ? 'Best value' : 'Worst value'} albums by ROI`}
        >
          {displayItems.map((item, index) => (
            <RoiRow
              key={`${item.artist}|${item.album}`}
              item={item}
              rank={index + 1}
              isTopValue={activeTab === 'best'}
            />
          ))}
        </ol>
      )}
    </div>
  );
};

export default CollectionROIChart;
