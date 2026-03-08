import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { LegendPayload } from 'recharts/types/component/DefaultLegendContent';

import { TasteDriftResult } from '../../../shared/types';
import { statsApi } from '../../services/statsApi';
import { createLogger } from '../../utils/logger';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import './TasteDriftChart.css';

const logger = createLogger('TasteDriftChart');

// Chart color CSS variables (defined in styles.css)
const CHART_COLORS = [
  'var(--chart-color-1, #d4a24e)',
  'var(--chart-color-2, #1e90ff)',
  'var(--chart-color-3, #ff6b6b)',
  'var(--chart-color-4, #ffd43b)',
  'var(--chart-color-5, #a855f7)',
  'var(--chart-color-6, #f97316)',
  'var(--chart-color-7, #06b6d4)',
  'var(--chart-color-8, #ec4899)',
  'var(--chart-color-9, #84cc16)',
  'var(--chart-color-10, #6366f1)',
];

/**
 * Format a YYYY-QN period string to a readable label like "Q3 '23"
 */
function formatQuarterLabel(period: string): string {
  const match = period.match(/^(\d{4})-Q(\d)$/);
  if (!match) return period;
  const year = match[1].slice(2); // last 2 digits
  const quarter = match[2];
  return `Q${quarter} '${year}`;
}

/**
 * Transform TasteDriftResult snapshots into recharts-compatible flat array.
 * Each entry has `period` plus one key per genre with its weight (0-1).
 * Genres missing from a quarter are backfilled with 0 so lines drop to
 * the baseline instead of breaking mid-chart.
 */
function buildChartData(
  result: TasteDriftResult
): Array<Record<string, string | number>> {
  const allGenres = result.topGenresOverall.slice(0, 10);
  return result.snapshots.map(snapshot => {
    const entry: Record<string, string | number> = { period: snapshot.period };
    // Backfill all tracked genres with 0
    for (const genre of allGenres) {
      entry[genre] = 0;
    }
    // Overwrite with actual values where present
    for (const genre of snapshot.genres) {
      entry[genre.name] = Math.round(genre.weight * 100);
    }
    return entry;
  });
}

/**
 * Multi-line chart showing how genre share shifts over time (by quarter).
 * Lazy-loaded via IntersectionObserver.
 */
export const TasteDriftChart: React.FC = () => {
  const [result, setResult] = useState<TasteDriftResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredGenre, setHoveredGenre] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchedRef = useRef(false);

  const handleLegendEnter = useCallback((o: LegendPayload) => {
    if (typeof o.dataKey === 'string') setHoveredGenre(o.dataKey);
  }, []);
  const handleLegendLeave = useCallback(() => {
    setHoveredGenre(null);
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !fetchedRef.current) {
          fetchedRef.current = true;
          setLoading(true);
          statsApi
            .getTasteDrift()
            .then(res => {
              if (res.success && res.data) {
                setResult(res.data);
              }
            })
            .catch(err => {
              logger.error('Failed to load taste drift', err);
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
  }, []);

  const chartData =
    result && result.snapshots.length > 0 ? buildChartData(result) : [];
  const genres = result ? result.topGenresOverall.slice(0, 10) : [];

  return (
    <div
      ref={containerRef}
      className='taste-drift-container'
      aria-label='Taste drift over time chart'
    >
      <div className='taste-drift-header'>
        <h3>Taste Drift</h3>
        <p className='taste-drift-description'>
          How your genre preferences have shifted over time, by quarter.
        </p>
      </div>

      {loading ? (
        <Skeleton variant='rectangular' width='100%' height={300} />
      ) : !result || result.snapshots.length < 2 ? (
        <EmptyState
          title='Not enough listening history'
          description='Keep scrobbling to see your taste drift over time!'
          size='small'
        />
      ) : (
        <div className='taste-drift-chart'>
          <ResponsiveContainer width='100%' height={300}>
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray='3 3'
                stroke='var(--border-color)'
                vertical={false}
              />
              <XAxis
                dataKey='period'
                stroke='var(--text-secondary)'
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatQuarterLabel}
              />
              <YAxis
                stroke='var(--text-secondary)'
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
                formatter={(
                  value: number | undefined,
                  name: string | undefined
                ) => [`${value ?? 0}%`, name ?? '']}
              />
              <Legend
                wrapperStyle={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  paddingTop: 'var(--space-2)',
                  cursor: 'pointer',
                }}
                onMouseEnter={handleLegendEnter}
                onMouseLeave={handleLegendLeave}
              />
              {genres.map((genre, index) => (
                <Line
                  key={genre}
                  type='monotone'
                  dataKey={genre}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={hoveredGenre === genre ? 3 : 2}
                  strokeOpacity={
                    hoveredGenre === null || hoveredGenre === genre ? 1 : 0.15
                  }
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default TasteDriftChart;
