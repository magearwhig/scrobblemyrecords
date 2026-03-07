import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

import { FormatBreakdown } from '../../../shared/types';

interface FormatDetailSectionProps {
  formats: FormatBreakdown;
}

const CHART_COLORS = [
  'var(--chart-color-1, #d4a24e)',
  'var(--chart-color-2, #1e90ff)',
  'var(--chart-color-3, #ff6b6b)',
  'var(--chart-color-4, #ffd43b)',
  'var(--chart-color-5, #a855f7)',
  'var(--chart-color-6, #f97316)',
  'var(--chart-color-7, #06b6d4)',
  'var(--chart-color-8, #ec4899)',
];

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  color: 'var(--text-primary)',
};

const FormatDetailSection: React.FC<FormatDetailSectionProps> = ({
  formats,
}) => {
  const chartData = useMemo(
    () =>
      formats.categories.map(cat => ({
        name: cat.name,
        value: cat.count,
        percentage: cat.percentage,
      })),
    [formats.categories]
  );

  const srText = useMemo(() => {
    const lines = formats.categories.map(
      cat => `${cat.name}: ${cat.count} records (${cat.percentage}%)`
    );
    return `Format distribution across ${formats.totalItems} items. ${lines.join('. ')}.`;
  }, [formats]);

  return (
    <div className='analytics-full-width-chart'>
      <h3>Format Distribution</h3>
      <p className='analytics-sr-only'>{srText}</p>

      <div
        className='analytics-chart-card'
        role='img'
        aria-label='Donut chart showing format distribution across your collection'
      >
        <ResponsiveContainer width='100%' height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx='50%'
              cy='50%'
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey='value'
              nameKey='name'
              labelLine={false}
            >
              {chartData.map((_entry, index) => (
                <Cell
                  key={`format-cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(
                value: number | undefined,
                name: string | undefined
              ) => [
                `${Number(value ?? 0).toLocaleString()} records`,
                name ?? '',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className='analytics-detail-list'>
        {formats.categories.map((cat, index) => (
          <li key={cat.name} className='analytics-detail-item'>
            <span className='analytics-detail-name'>
              <span
                className='analytics-chart-legend-swatch'
                style={{
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                }}
              />
              {cat.name}
            </span>
            <span className='analytics-detail-count'>
              {cat.count.toLocaleString()} ({cat.percentage}%)
            </span>
            {cat.examples.length > 0 && (
              <span className='analytics-detail-variants'>
                {cat.examples
                  .slice(0, 3)
                  .map(ex => `${ex.artist} - ${ex.title}`)
                  .join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default React.memo(FormatDetailSection);
