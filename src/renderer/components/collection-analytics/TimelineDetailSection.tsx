import React, { useState, useCallback, useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { GrowthTimeline, DecadeHistogram } from '../../../shared/types';
import { collectionAnalyticsApi } from '../../services/statsApi';

interface TimelineDetailSectionProps {
  growth: GrowthTimeline;
  decades: DecadeHistogram;
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  color: 'var(--text-primary)',
};

const TimelineDetailSection: React.FC<TimelineDetailSectionProps> = ({
  growth: initialGrowth,
  decades,
}) => {
  const [granularity, setGranularity] = useState<'month' | 'year'>(
    initialGrowth.granularity
  );
  const [growthData, setGrowthData] = useState<GrowthTimeline>(initialGrowth);
  const [loadingGrowth, setLoadingGrowth] = useState(false);
  const [showYears, setShowYears] = useState(false);

  const handleGranularityChange = useCallback(
    async (newGranularity: 'month' | 'year') => {
      if (newGranularity === granularity || loadingGrowth) return;
      setGranularity(newGranularity);
      setLoadingGrowth(true);
      try {
        const response = await collectionAnalyticsApi.getGrowth(newGranularity);
        if (response.success && response.data) {
          setGrowthData(response.data);
        }
      } finally {
        setLoadingGrowth(false);
      }
    },
    [granularity, loadingGrowth]
  );

  const toggleYearView = useCallback(() => {
    setShowYears(prev => !prev);
  }, []);

  const growthSrText = useMemo(() => {
    const points = growthData.dataPoints;
    if (points.length === 0) return 'No growth data available.';
    const first = points[0];
    const last = points[points.length - 1];
    return `Collection growth chart (${granularity}ly). From ${first.period} to ${last.period}, collection grew from ${first.cumulative} to ${last.cumulative} records. Total added: ${growthData.totalAdded}.`;
  }, [growthData, granularity]);

  const decadeSrText = useMemo(() => {
    const lines = decades.decades.map(
      d => `${d.decade}: ${d.count} records (${d.percentage}%)`
    );
    const unknownNote =
      decades.unknownYearCount > 0
        ? ` ${decades.unknownYearCount} records have no release year.`
        : '';
    return `Decade distribution. ${lines.join('. ')}.${unknownNote}`;
  }, [decades]);

  const histogramData = useMemo(
    () => (showYears ? decades.years : decades.decades),
    [showYears, decades]
  );

  const histogramDataKey = showYears ? 'year' : 'decade';
  const histogramLabel = showYears ? 'Year' : 'Decade';

  return (
    <div className='analytics-full-width-chart'>
      {/* Growth Chart */}
      <h3>Collection Growth</h3>
      <p className='analytics-sr-only'>{growthSrText}</p>

      <div className='analytics-granularity-toggle'>
        <button
          className={`analytics-granularity-btn${granularity === 'month' ? ' analytics-granularity-btn--active' : ''}`}
          onClick={() => handleGranularityChange('month')}
          disabled={loadingGrowth}
        >
          Monthly
        </button>
        <button
          className={`analytics-granularity-btn${granularity === 'year' ? ' analytics-granularity-btn--active' : ''}`}
          onClick={() => handleGranularityChange('year')}
          disabled={loadingGrowth}
        >
          Yearly
        </button>
      </div>

      <div
        className='analytics-chart-card'
        role='img'
        aria-label={`Area chart showing cumulative collection growth over time, ${granularity}ly granularity`}
      >
        {loadingGrowth ? (
          <div className='analytics-loading'>Loading...</div>
        ) : (
          <ResponsiveContainer width='100%' height={300}>
            <AreaChart
              data={growthData.dataPoints}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
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
              />
              <YAxis
                stroke='var(--text-secondary)'
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(
                  value: number | undefined,
                  name: string | undefined
                ) => {
                  const label = name === 'cumulative' ? 'Total' : 'Added';
                  return [
                    `${Number(value ?? 0).toLocaleString()} records`,
                    label,
                  ];
                }}
              />
              <Area
                type='monotone'
                dataKey='cumulative'
                stroke='var(--accent-color)'
                fill='var(--accent-color)'
                fillOpacity={0.15}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Decade / Year Histogram */}
      <h3>{histogramLabel} Distribution</h3>
      <p className='analytics-sr-only'>{decadeSrText}</p>

      <div className='analytics-granularity-toggle'>
        <button
          className={`analytics-granularity-btn${!showYears ? ' analytics-granularity-btn--active' : ''}`}
          onClick={() => setShowYears(false)}
        >
          Decades
        </button>
        <button
          className={`analytics-granularity-btn${showYears ? ' analytics-granularity-btn--active' : ''}`}
          onClick={toggleYearView}
        >
          Years
        </button>
      </div>

      <div
        className='analytics-chart-card'
        role='img'
        aria-label={`Bar chart showing number of records per ${histogramLabel.toLowerCase()}`}
      >
        <ResponsiveContainer width='100%' height={300}>
          <BarChart
            data={histogramData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray='3 3'
              stroke='var(--border-color)'
              vertical={false}
            />
            <XAxis
              dataKey={histogramDataKey}
              stroke='var(--text-secondary)'
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke='var(--text-secondary)'
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number | undefined) => [
                `${Number(value ?? 0).toLocaleString()} records`,
                'Count',
              ]}
            />
            <Bar
              dataKey='count'
              fill='var(--accent-color)'
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default React.memo(TimelineDetailSection);
