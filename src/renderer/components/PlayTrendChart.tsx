import React, { useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { createLogger } from '../utils/logger';

import { Skeleton } from './ui/Skeleton';

const logger = createLogger('PlayTrendChart');

/**
 * Props for PlayTrendChart.
 * @property data - Time-series data points with period labels (YYYY-MM or YYYY-Www) and counts.
 * @property periodLabel - Currently selected granularity for the trend data.
 * @property onPeriodChange - Callback when the user switches between monthly/weekly views.
 *   When omitted, the period selector is hidden.
 * @property loading - Shows a skeleton placeholder when true.
 */
interface PlayTrendChartProps {
  data: Array<{ period: string; count: number }>;
  periodLabel?: 'month' | 'week';
  onPeriodChange?: (period: 'month' | 'week') => void;
  loading?: boolean;
}

/** Area chart showing play count over time with optional month/week toggle. */
const PlayTrendChart: React.FC<PlayTrendChartProps> = ({
  data,
  periodLabel = 'month',
  onPeriodChange,
  loading = false,
}) => {
  const formatPeriod = useCallback((period: string): string => {
    // YYYY-MM -> "Jan 2024"
    if (/^\d{4}-\d{2}$/.test(period)) {
      const [year, month] = period.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
      });
    }
    // YYYY-Www -> "Wk 3, 2024"
    if (/^\d{4}-W\d{2}$/.test(period)) {
      const [year, week] = period.split('-W');
      return `Wk ${parseInt(week)}, ${year}`;
    }
    return period;
  }, []);

  const formatTooltipLabel = useCallback((period: string): string => {
    // YYYY-MM -> "January 2024"
    if (/^\d{4}-\d{2}$/.test(period)) {
      const [year, month] = period.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }
    // YYYY-Www -> "Week 3, 2024"
    if (/^\d{4}-W\d{2}$/.test(period)) {
      const [year, week] = period.split('-W');
      return `Week ${parseInt(week)}, ${year}`;
    }
    return period;
  }, []);

  const handlePeriodChange = useCallback(
    // eslint-disable-next-line no-undef
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as 'month' | 'week';
      logger.debug('Period changed', { period: value });
      if (onPeriodChange) {
        onPeriodChange(value);
      }
    },
    [onPeriodChange]
  );

  if (loading) {
    return (
      <div className='play-trend-chart'>
        <div className='play-trend-chart-header'>
          <h3>Play Count Over Time</h3>
        </div>
        <Skeleton variant='rectangular' width='100%' height={250} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className='play-trend-chart'>
        <div className='play-trend-chart-header'>
          <h3>Play Count Over Time</h3>
        </div>
        <div className='play-trend-chart-empty'>
          No listening data available
        </div>
      </div>
    );
  }

  return (
    <div className='play-trend-chart'>
      <div className='play-trend-chart-header'>
        <h3>Play Count Over Time</h3>
        {onPeriodChange && (
          <div className='play-trend-chart-controls'>
            <label htmlFor='trend-period-select'>Period:</label>
            <select
              id='trend-period-select'
              value={periodLabel}
              onChange={handlePeriodChange}
              className='form-input'
              aria-label='Select trend period granularity'
            >
              <option value='month'>Monthly</option>
              <option value='week'>Weekly</option>
            </select>
          </div>
        )}
      </div>
      <ResponsiveContainer width='100%' height={250}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id='colorPlayTrend' x1='0' y1='0' x2='0' y2='1'>
              <stop offset='5%' stopColor='#1db954' stopOpacity={0.3} />
              <stop offset='95%' stopColor='#1db954' stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray='3 3' stroke='var(--border-color)' />
          <XAxis
            dataKey='period'
            tickFormatter={formatPeriod}
            stroke='var(--text-secondary)'
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke='var(--text-secondary)'
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-primary)',
            }}
            labelFormatter={formatTooltipLabel}
            formatter={value => [
              `${Number(value || 0).toLocaleString()} plays`,
              'Plays',
            ]}
          />
          <Area
            type='monotone'
            dataKey='count'
            stroke='#1db954'
            strokeWidth={2}
            fillOpacity={1}
            fill='url(#colorPlayTrend)'
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PlayTrendChart;
