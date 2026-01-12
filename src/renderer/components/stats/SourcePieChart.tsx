import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { SourceBreakdownItem } from '../../../shared/types';

interface SourcePieChartProps {
  data: SourceBreakdownItem[];
  loading?: boolean;
}

// Colors for the pie chart
const COLORS = ['#1db954', '#6b7280']; // Green for RecordScrobbles, gray for Other

/**
 * Pie chart showing scrobble source breakdown
 */
export const SourcePieChart: React.FC<SourcePieChartProps> = ({
  data,
  loading,
}) => {
  if (loading) {
    return (
      <div className='source-pie-chart'>
        <h3>Scrobble Sources</h3>
        <div className='source-pie-chart-loading'>Loading...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className='source-pie-chart'>
        <h3>Scrobble Sources</h3>
        <div className='source-pie-chart-empty'>No scrobble data available</div>
      </div>
    );
  }

  const totalScrobbles = data.reduce((sum, item) => sum + item.count, 0);

  // Transform data for recharts (needs name field)
  const chartData = data.map(item => ({
    name: item.source,
    value: item.count,
    percentage: item.percentage,
  }));

  return (
    <div className='source-pie-chart'>
      <div className='source-pie-chart-header'>
        <div>
          <h3>Scrobble Sources</h3>
          <p className='source-pie-chart-description'>
            Where your scrobbles are coming from. RecordScrobbles tracks
            scrobbles submitted through this app.
          </p>
        </div>
      </div>

      <div className='source-pie-chart-container'>
        <ResponsiveContainer width='100%' height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx='50%'
              cy='50%'
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey='value'
              nameKey='name'
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.name === 'RecordScrobbles' ? COLORS[0] : COLORS[1]
                  }
                />
              ))}
            </Pie>
            <Tooltip
              formatter={value => [
                `${Number(value || 0).toLocaleString()} scrobbles`,
                '',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className='source-pie-chart-legend'>
          {data.map(item => (
            <div key={item.source} className='source-pie-chart-legend-item'>
              <span
                className='source-pie-chart-legend-color'
                style={{
                  backgroundColor:
                    item.source === 'RecordScrobbles' ? COLORS[0] : COLORS[1],
                }}
              />
              <span className='source-pie-chart-legend-label'>
                {item.source}
              </span>
              <span className='source-pie-chart-legend-value'>
                {item.count.toLocaleString()} ({item.percentage}%)
              </span>
            </div>
          ))}
          <div className='source-pie-chart-total'>
            Total: {totalScrobbles.toLocaleString()} scrobbles
          </div>
        </div>
      </div>
    </div>
  );
};

export default SourcePieChart;
