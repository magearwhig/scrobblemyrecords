import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import { AlbumArcBucket } from '../../../shared/types';
import { statsApi } from '../../services/statsApi';
import { createLogger } from '../../utils/logger';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Skeleton';
import './AlbumListeningArc.css';

const logger = createLogger('AlbumListeningArc');

interface AlbumListeningArcProps {
  artist: string;
  album: string;
}

/**
 * Format YYYY-MM to a human-readable label (e.g. "Jan '23")
 */
function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  });
}

/**
 * Format YYYY-MM to a full readable tooltip label
 */
function formatTooltipLabel(period: string): string {
  const [year, month] = period.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Area chart showing monthly play counts over an album's lifetime.
 * Fetches its own data from the stats API.
 */
export const AlbumListeningArc: React.FC<AlbumListeningArcProps> = ({
  artist,
  album,
}) => {
  const [data, setData] = useState<AlbumArcBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!artist || !album) return;

    setLoading(true);
    setData([]);

    statsApi
      .getAlbumListeningArc(artist, album)
      .then(res => {
        if (res.success && res.data) {
          setData(res.data);
        }
      })
      .catch(err => {
        logger.error('Failed to load album listening arc', {
          artist,
          album,
          err,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [artist, album]);

  if (loading) {
    return (
      <div className='album-arc-container'>
        <p className='album-arc-label'>Listening Arc</p>
        <Skeleton variant='rectangular' width='100%' height={140} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className='album-arc-container'>
        <p className='album-arc-label'>Listening Arc</p>
        <EmptyState
          title='No play history found'
          description='Scrobble this album to see your listening arc.'
          size='small'
        />
      </div>
    );
  }

  const totalPlays = data.reduce((sum, d) => sum + d.playCount, 0);

  // Reduce X-axis tick density for larger datasets
  const tickEvery = data.length > 24 ? 6 : data.length > 12 ? 3 : 1;
  const xTicks = data.filter((_, i) => i % tickEvery === 0).map(d => d.period);

  return (
    <div className='album-arc-container' aria-label='Album listening arc chart'>
      <div className='album-arc-header'>
        <p className='album-arc-label'>Listening Arc</p>
        <p className='album-arc-total'>
          {totalPlays.toLocaleString()} total plays
        </p>
      </div>
      <div className='album-arc-chart'>
        <ResponsiveContainer width='100%' height={140}>
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id='albumArcGradient' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='5%'
                  stopColor='var(--accent-primary, #d4a24e)'
                  stopOpacity={0.3}
                />
                <stop
                  offset='95%'
                  stopColor='var(--accent-primary, #d4a24e)'
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray='3 3'
              stroke='var(--border-color)'
              vertical={false}
            />
            <XAxis
              dataKey='period'
              ticks={xTicks}
              tickFormatter={formatPeriodLabel}
              stroke='var(--text-secondary)'
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke='var(--text-secondary)'
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
              }}
              labelFormatter={formatTooltipLabel}
              formatter={(value: number | undefined) => [
                `${(value ?? 0).toLocaleString()} plays`,
                'Plays',
              ]}
            />
            <Area
              type='monotone'
              dataKey='playCount'
              stroke='var(--accent-primary, #d4a24e)'
              strokeWidth={2}
              fillOpacity={1}
              fill='url(#albumArcGradient)'
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AlbumListeningArc;
