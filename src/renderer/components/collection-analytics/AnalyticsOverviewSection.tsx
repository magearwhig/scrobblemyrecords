import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';

import { CollectionAnalyticsOverview } from '../../../shared/types';

interface AnalyticsOverviewSectionProps {
  overview: CollectionAnalyticsOverview;
}

const CHART_COLORS = [
  'var(--chart-color-1, #1db954)',
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

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  color: 'var(--text-primary)',
};

const AnalyticsOverviewSection: React.FC<AnalyticsOverviewSectionProps> = ({
  overview,
}) => {
  const { summary, formats, labels, decades, growth } = overview;

  const formatChartData = useMemo(
    () =>
      formats.categories.map(cat => ({
        name: cat.name,
        value: cat.count,
        percentage: cat.percentage,
      })),
    [formats.categories]
  );

  const topLabels = useMemo(() => labels.labels.slice(0, 10), [labels.labels]);

  const decadeData = useMemo(() => decades.decades, [decades.decades]);

  const growthData = useMemo(() => growth.dataPoints, [growth.dataPoints]);

  return (
    <div className='analytics-overview-section'>
      {/* Summary Cards */}
      <div className='analytics-summary-cards'>
        <div className='analytics-summary-card'>
          <span className='analytics-summary-card-label'>Total Records</span>
          <span className='analytics-summary-card-value'>
            {summary.totalItems.toLocaleString()}
          </span>
        </div>
        <div className='analytics-summary-card'>
          <span className='analytics-summary-card-label'>Total Artists</span>
          <span className='analytics-summary-card-value'>
            {summary.totalArtists.toLocaleString()}
          </span>
        </div>
        <div className='analytics-summary-card'>
          <span className='analytics-summary-card-label'>Total Labels</span>
          <span className='analytics-summary-card-value'>
            {summary.totalLabels.toLocaleString()}
          </span>
        </div>
        <div className='analytics-summary-card'>
          <span className='analytics-summary-card-label'>Avg Release Year</span>
          <span className='analytics-summary-card-value'>
            {summary.averageReleaseYear ?? 'N/A'}
          </span>
        </div>
      </div>

      {/* Chart Row: Format Donut + Top Labels */}
      <div className='analytics-chart-row'>
        {/* Format Donut */}
        <div className='analytics-chart-half'>
          <h3>Format Breakdown</h3>
          <p className='analytics-sr-only'>
            Donut chart showing record format distribution across{' '}
            {formats.totalItems} items.
          </p>
          <ResponsiveContainer width='100%' height={250}>
            <PieChart>
              <Pie
                data={formatChartData}
                cx='50%'
                cy='50%'
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                dataKey='value'
                nameKey='name'
                labelLine={false}
              >
                {formatChartData.map((_entry, index) => (
                  <Cell
                    key={`format-cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => [
                  `${Number(value || 0).toLocaleString()} records`,
                  String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className='analytics-chart-legend'>
            {formatChartData.map((entry, index) => (
              <div key={entry.name} className='analytics-chart-legend-item'>
                <span
                  className='analytics-chart-legend-swatch'
                  style={{
                    backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                  }}
                />
                <span className='analytics-chart-legend-label'>
                  {entry.name}
                </span>
                <span className='analytics-chart-legend-value'>
                  {entry.value.toLocaleString()} ({entry.percentage}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Labels Bar */}
        <div className='analytics-chart-half'>
          <h3>Top Labels</h3>
          <p className='analytics-sr-only'>
            Horizontal bar chart showing top 10 record labels out of{' '}
            {labels.totalLabels} total labels.
          </p>
          <ResponsiveContainer width='100%' height={300}>
            <BarChart
              data={topLabels}
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
                dataKey='name'
                width={120}
                stroke='var(--text-secondary)'
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ width: 110 }}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={value => [
                  `${Number(value || 0).toLocaleString()} records`,
                  'Count',
                ]}
              />
              <Bar dataKey='count' radius={[0, 4, 4, 0]}>
                {topLabels.map((_entry, index) => (
                  <Cell
                    key={`label-cell-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Decade Distribution */}
      <div className='analytics-chart-full'>
        <h3>Decade Distribution</h3>
        <p className='analytics-sr-only'>
          Bar chart showing number of records per decade.
          {decades.unknownYearCount > 0 &&
            ` ${decades.unknownYearCount} records have no release year.`}
        </p>
        <ResponsiveContainer width='100%' height={280}>
          <BarChart
            data={decadeData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              strokeDasharray='3 3'
              stroke='var(--border-color)'
              vertical={false}
            />
            <XAxis
              dataKey='decade'
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
              formatter={value => [
                `${Number(value || 0).toLocaleString()} records`,
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

      {/* Collection Growth */}
      <div className='analytics-chart-full'>
        <h3>Collection Growth</h3>
        <p className='analytics-sr-only'>
          Area chart showing cumulative collection growth over time with{' '}
          {growth.totalAdded} total records added.
        </p>
        <ResponsiveContainer width='100%' height={280}>
          <AreaChart
            data={growthData}
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
              formatter={(value, name) => {
                const label = name === 'cumulative' ? 'Total' : 'Added';
                return [
                  `${Number(value || 0).toLocaleString()} records`,
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
      </div>
    </div>
  );
};

export default React.memo(AnalyticsOverviewSection);
