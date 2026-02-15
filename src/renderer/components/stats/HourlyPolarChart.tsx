import React from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { HourlyDistributionData } from '../../../shared/types';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

interface HourlyPolarChartProps {
  /** Array of 24 data points (one per hour, 0-23) with scrobble counts */
  data: HourlyDistributionData[];
  /** Hour (0-23) with the highest scrobble count, used to highlight the peak */
  peakHour: number;
  /** Time-of-day category ('morning' | 'afternoon' | 'evening' | 'night') derived from the dominant 6-hour block */
  insight: string;
  /** When true, renders skeleton placeholders instead of chart content */
  loading?: boolean;
}

// Only label every 3rd hour on the polar axis to prevent overlapping text.
// With 24 data points, labeling all hours would be unreadable at typical chart sizes.
const HOUR_LABELS: Record<number, string> = {
  0: '12am',
  3: '3am',
  6: '6am',
  9: '9am',
  12: '12pm',
  15: '3pm',
  18: '6pm',
  21: '9pm',
};

function formatHour(hour: number): string {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

/**
 * Radar/polar chart showing scrobble distribution by hour of day
 */
export const HourlyPolarChart: React.FC<HourlyPolarChartProps> = ({
  data,
  peakHour,
  insight,
  loading,
}) => {
  if (loading) {
    return (
      <div
        className='polar-chart-container'
        aria-label='Listening distribution by hour of day'
      >
        <h3>Hourly Distribution</h3>
        <Skeleton variant='rectangular' width='100%' height={280} />
        <Skeleton
          variant='text'
          width='80%'
          height={16}
          className='listening-insight-skeleton'
        />
      </div>
    );
  }

  const hasData = data && data.length > 0 && data.some(d => d.count > 0);

  if (!hasData) {
    return (
      <div
        className='polar-chart-container'
        aria-label='Listening distribution by hour of day'
      >
        <h3>Hourly Distribution</h3>
        <EmptyState
          title='No hourly data'
          description='Scrobble some music to see your hourly listening patterns.'
          size='small'
        />
      </div>
    );
  }

  // Prepare data with labels for display
  const chartData = data.map(d => ({
    ...d,
    label: HOUR_LABELS[d.hour] || '',
  }));

  return (
    <div
      className='polar-chart-container'
      aria-label='Listening distribution by hour of day'
    >
      <h3>Hourly Distribution</h3>
      <div
        className='polar-chart-wrapper'
        role='img'
        aria-label={`Radar chart showing scrobbles by hour. Peak hour is ${formatHour(peakHour)}.`}
      >
        <ResponsiveContainer width='100%' height={280}>
          <RadarChart data={chartData} cx='50%' cy='50%' outerRadius='70%'>
            <PolarGrid stroke='var(--border-color)' />
            <PolarAngleAxis
              dataKey='label'
              tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            />
            <PolarRadiusAxis
              tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
              }}
              formatter={value => [
                `${Number(value || 0).toLocaleString()} scrobbles`,
                'Scrobbles',
              ]}
              labelFormatter={(_label, payload) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hour = (payload as any)?.[0]?.payload?.hour;
                return hour !== undefined ? formatHour(hour) : String(_label);
              }}
            />
            <Radar
              dataKey='count'
              stroke='var(--accent-color)'
              fill='var(--accent-color)'
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <p className='listening-insight-text'>
        You're a <strong>{insight}</strong> listener. Your peak hour is{' '}
        <strong>{formatHour(peakHour)}</strong>.
      </p>
    </div>
  );
};

export default HourlyPolarChart;
