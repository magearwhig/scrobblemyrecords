import React, { useState } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

import { TimelineDataPoint, DateRange } from '../../../shared/types';

import DateRangePicker from './DateRangePicker';

type Period =
  | 'week'
  | 'month'
  | 'year'
  | 'days30'
  | 'days90'
  | 'days365'
  | 'custom';

interface ListeningTimelineProps {
  data: TimelineDataPoint[];
  loading?: boolean;
  onPeriodChange?: (period: Period, dateRange?: DateRange) => void;
  currentPeriod?: Period;
  customDateRange?: DateRange;
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
 * Line/area chart showing listening activity over time
 */
export const ListeningTimeline: React.FC<ListeningTimelineProps> = ({
  data,
  loading,
  onPeriodChange,
  currentPeriod = 'year',
  customDateRange,
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);

  const periods: Array<{ value: Period; label: string }> = [
    { value: 'week', label: '7 Days' },
    { value: 'days30', label: '30 Days' },
    { value: 'days90', label: '90 Days' },
    { value: 'days365', label: '365 Days' },
    { value: 'year', label: '12 Months' },
  ];

  const handlePeriodClick = (period: Period) => {
    if (!onPeriodChange) return;
    if (period === 'custom') {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
      onPeriodChange(period);
    }
  };

  const handleDateRangeApply = (dateRange: DateRange) => {
    if (!onPeriodChange) return;
    onPeriodChange('custom', dateRange);
    setShowDatePicker(false);
  };

  const customLabel =
    currentPeriod === 'custom' && customDateRange
      ? formatDateRangeLabel(customDateRange)
      : 'Custom';

  const formatXAxis = (dateStr: string): string => {
    // Handle different date formats
    if (dateStr.length === 7) {
      // YYYY-MM format
      const [year, month] = dateStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', { month: 'short' });
    }
    // YYYY-MM-DD format
    const date = new Date(`${dateStr}T00:00:00`);
    if (currentPeriod === 'week') {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTooltipLabel = (dateStr: string): string => {
    if (dateStr.length === 7) {
      // YYYY-MM format
      const [year, month] = dateStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }
    // YYYY-MM-DD format
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className='listening-timeline'>
        <h3>Listening Timeline</h3>
        <div className='listening-timeline-loading'>Loading...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className='listening-timeline'>
        <h3>Listening Timeline</h3>
        <div className='listening-timeline-empty'>
          No listening data available
        </div>
      </div>
    );
  }

  const totalInPeriod = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className='listening-timeline'>
      <div className='listening-timeline-header'>
        <div>
          <h3>Listening Timeline</h3>
          <p className='listening-timeline-description'>
            Your scrobble activity over time. {totalInPeriod.toLocaleString()}{' '}
            scrobbles in this period.
          </p>
        </div>
        {onPeriodChange && (
          <div className='listening-timeline-period-selector-wrapper'>
            <div className='listening-timeline-period-selector'>
              {periods.map(period => (
                <button
                  key={period.value}
                  className={`listening-timeline-period-btn ${currentPeriod === period.value ? 'active' : ''}`}
                  onClick={() => handlePeriodClick(period.value)}
                >
                  {period.label}
                </button>
              ))}
              <button
                className={`listening-timeline-period-btn ${currentPeriod === 'custom' ? 'active' : ''}`}
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
        )}
      </div>

      <div className='listening-timeline-chart'>
        <ResponsiveContainer width='100%' height={200}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id='colorScrobbles' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='5%' stopColor='#1db954' stopOpacity={0.3} />
                <stop offset='95%' stopColor='#1db954' stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray='3 3' stroke='var(--border-color)' />
            <XAxis
              dataKey='date'
              tickFormatter={formatXAxis}
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
                `${Number(value || 0).toLocaleString()} scrobbles`,
                'Scrobbles',
              ]}
            />
            <Area
              type='monotone'
              dataKey='count'
              stroke='#1db954'
              strokeWidth={2}
              fillOpacity={1}
              fill='url(#colorScrobbles)'
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ListeningTimeline;
