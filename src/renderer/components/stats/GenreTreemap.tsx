import React from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

import { GenreData } from '../../../shared/types';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';

interface GenreTreemapProps {
  /** Genre entries with normalized weights (0-1) and artist counts, sorted by weight descending */
  data: GenreData[];
  /** Number of top artists whose tags were analyzed, displayed in the description */
  totalArtists: number;
  /** When true, renders skeleton placeholders instead of treemap content */
  loading?: boolean;
}

// Multi-color palette for treemap cells, defined as CSS custom properties
// so they can be themed. Fallback hex values match the light mode defaults.
const GENRE_COLORS = [
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

/**
 * Custom content renderer for treemap cells.
 * Shows genre name and percentage for cells large enough to fit text.
 */
const CustomTreemapContent: React.FC<{
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  name?: string;
  percentage?: number;
}> = ({ x = 0, y = 0, width = 0, height = 0, index = 0, name, percentage }) => {
  const color = GENRE_COLORS[index % GENRE_COLORS.length];
  const showLabel = width > 50 && height > 30;
  const showPercentage = width > 60 && height > 45;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke='var(--card-bg)'
        strokeWidth={2}
        rx={3}
        ry={3}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showPercentage ? 6 : 0)}
          textAnchor='middle'
          dominantBaseline='central'
          fill='#ffffff'
          fontSize={width > 100 ? 13 : 11}
          fontWeight={600}
        >
          {name}
        </text>
      )}
      {showPercentage && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 12}
          textAnchor='middle'
          dominantBaseline='central'
          fill='rgba(255, 255, 255, 0.8)'
          fontSize={10}
        >
          {percentage}%
        </text>
      )}
    </g>
  );
};

/**
 * Treemap visualization showing genre distribution based on Last.fm artist tags
 */
export const GenreTreemap: React.FC<GenreTreemapProps> = ({
  data,
  totalArtists,
  loading,
}) => {
  if (loading) {
    return (
      <div
        className='genre-treemap-container'
        aria-label='Genre distribution treemap'
      >
        <div className='genre-treemap-header'>
          <h3>Your Music DNA</h3>
          <p className='genre-treemap-description'>
            Analyzing your top artists' tags...
          </p>
        </div>
        <Skeleton variant='rectangular' width='100%' height={300} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className='genre-treemap-container'
        aria-label='Genre distribution treemap'
      >
        <div className='genre-treemap-header'>
          <h3>Your Music DNA</h3>
        </div>
        <EmptyState
          title='No genre data'
          description='Scrobble some music to see your genre distribution.'
          size='small'
        />
      </div>
    );
  }

  // Transform data for recharts Treemap (needs 'value' field for sizing)
  const chartData = data.map((genre, index) => ({
    name: genre.name,
    value: genre.weight,
    percentage: Math.round(genre.weight * 100),
    artistCount: genre.artistCount,
    index,
  }));

  // Build screen-reader text
  const srText = `Your top genres: ${data
    .slice(0, 5)
    .map(g => `${g.name} (${Math.round(g.weight * 100)}%)`)
    .join(', ')}`;

  return (
    <div
      className='genre-treemap-container'
      aria-label='Genre distribution treemap'
    >
      <div className='genre-treemap-header'>
        <h3>Your Music DNA</h3>
        <p className='genre-treemap-description'>
          Genre distribution based on your top {totalArtists} artists' Last.fm
          tags.
        </p>
      </div>
      <div className='genre-treemap-chart' role='img' aria-label={srText}>
        <ResponsiveContainer width='100%' height={300}>
          <Treemap
            data={chartData}
            dataKey='value'
            nameKey='name'
            content={<CustomTreemapContent />}
            isAnimationActive={false}
          >
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
              }}
              formatter={(value, _name, props) => {
                const artistCount = props?.payload?.artistCount;
                return [
                  `${artistCount} artist${artistCount !== 1 ? 's' : ''}`,
                  String(props?.payload?.name || ''),
                ];
              }}
              labelFormatter={() => ''}
            />
          </Treemap>
        </ResponsiveContainer>
      </div>
      {/* Screen reader fallback */}
      <p className='sr-only'>{srText}</p>
    </div>
  );
};

export default GenreTreemap;
