import React, { useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import { DayOfWeekDistributionData } from '../../../shared/types';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

interface DayOfWeekChartProps {
  /** Array of 7 data points (0=Sunday through 6=Saturday) with scrobble counts and day names */
  data: DayOfWeekDistributionData[];
  /** Day index (0-6) with the highest scrobble count, highlighted in the chart */
  peakDay: number;
  /** Average total scrobbles across weekdays (Mon-Fri), used for the insight comparison */
  weekdayAvg: number;
  /** Average total scrobbles across weekend days (Sat-Sun), used for the insight comparison */
  weekendAvg: number;
  /** Whether the user listens more on 'weekday' or 'weekend', drives the insight text */
  insight: string;
  /** When true, renders skeleton placeholders instead of chart content */
  loading?: boolean;
}

/**
 * Horizontal bar chart showing scrobble distribution by day of week
 */
export const DayOfWeekChart: React.FC<DayOfWeekChartProps> = ({
  data,
  peakDay,
  weekdayAvg,
  weekendAvg,
  insight,
  loading,
}) => {
  const formatTooltip = useCallback(
    (value: number | undefined) => [
      `${Number(value || 0).toLocaleString()} scrobbles`,
      'Scrobbles',
    ],
    []
  );

  if (loading) {
    return (
      <div
        className='day-of-week-chart-container'
        aria-label='Listening distribution by day of week'
      >
        <h3>Day of Week</h3>
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
        className='day-of-week-chart-container'
        aria-label='Listening distribution by day of week'
      >
        <h3>Day of Week</h3>
        <EmptyState
          title='No day-of-week data'
          description='Scrobble some music to see your weekly listening patterns.'
          size='small'
        />
      </div>
    );
  }

  // Calculate insight percentage, handling edge cases
  const higher = insight === 'weekend' ? weekendAvg : weekdayAvg;
  const lower = insight === 'weekend' ? weekdayAvg : weekendAvg;
  const percentMore =
    lower > 0
      ? Math.round(((higher - lower) / lower) * 100)
      : higher > 0
        ? 100
        : 0;
  const insightLabel = insight === 'weekend' ? 'weekends' : 'weekdays';
  // When difference is < 5%, the insight text would be misleading
  const isEvenDistribution = percentMore < 5;

  return (
    <div
      className='day-of-week-chart-container'
      aria-label='Listening distribution by day of week'
    >
      <h3>Day of Week</h3>
      <div
        className='day-of-week-chart-wrapper'
        role='img'
        aria-label={`Bar chart showing scrobbles by day of week. Peak day is ${data.find(d => d.day === peakDay)?.dayName || 'unknown'}.`}
      >
        <ResponsiveContainer width='100%' height={280}>
          <BarChart
            data={data}
            layout='vertical'
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <XAxis
              type='number'
              stroke='var(--text-secondary)'
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type='category'
              dataKey='dayName'
              width={40}
              stroke='var(--text-secondary)'
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
              }}
              formatter={formatTooltip}
            />
            <Bar dataKey='count' radius={[0, 4, 4, 0]}>
              {data.map(entry => (
                <Cell
                  key={`cell-${entry.day}`}
                  fill='var(--accent-color)'
                  stroke={
                    entry.day === peakDay ? 'var(--text-primary)' : 'none'
                  }
                  strokeWidth={entry.day === peakDay ? 1 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className='listening-insight-text'>
        {isEvenDistribution ? (
          <>
            Your listening is <strong>fairly even</strong> throughout the week.
          </>
        ) : (
          <>
            You're a <strong>{insight}</strong> listener — you listen{' '}
            <strong>{percentMore}%</strong> more on{' '}
            <strong>{insightLabel}</strong>.
          </>
        )}
      </p>
    </div>
  );
};

export default DayOfWeekChart;
