import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';

import { LabelDistribution } from '../../../shared/types';

interface LabelDetailSectionProps {
  labels: LabelDistribution;
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

const LabelDetailSection: React.FC<LabelDetailSectionProps> = ({ labels }) => {
  const topLabels = useMemo(() => labels.labels.slice(0, 20), [labels.labels]);

  const srText = useMemo(() => {
    const top5 = labels.labels
      .slice(0, 5)
      .map(l => `${l.name}: ${l.count} records (${l.percentage}%)`);
    return `Label distribution across ${labels.totalItems} items from ${labels.totalLabels} labels. Top labels: ${top5.join('. ')}.`;
  }, [labels]);

  return (
    <div className='analytics-full-width-chart'>
      <h3>Label Distribution</h3>
      <p className='analytics-sr-only'>{srText}</p>

      <div
        className='analytics-chart-card'
        role='img'
        aria-label='Horizontal bar chart showing top 20 record labels in your collection'
      >
        <ResponsiveContainer
          width='100%'
          height={Math.max(400, topLabels.length * 28)}
        >
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
              width={140}
              stroke='var(--text-secondary)'
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tick={{ width: 130 }}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(
                value: number | undefined,
                _name: string | undefined,
                props
              ) => {
                const variants = (props?.payload as Record<string, string[]>)
                  ?.variants;
                const lines: string[] = [
                  `${Number(value ?? 0).toLocaleString()} records`,
                ];
                if (variants && variants.length > 0) {
                  lines.push(`Variants: ${variants.join(', ')}`);
                }
                return [lines.join('\n'), 'Count'];
              }}
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

      <ul className='analytics-detail-list'>
        {labels.labels.map(label => (
          <li key={label.name} className='analytics-detail-item'>
            <span className='analytics-detail-name'>
              {label.name === '' ? 'Not On Label' : label.name}
            </span>
            <span className='analytics-detail-count'>
              {label.count.toLocaleString()} ({label.percentage}%)
            </span>
            {label.variants.length > 0 && (
              <span className='analytics-detail-variants'>
                {label.variants.join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default React.memo(LabelDetailSection);
