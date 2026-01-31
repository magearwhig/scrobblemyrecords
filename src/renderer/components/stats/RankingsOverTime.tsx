import React, { useEffect, useState, useCallback } from 'react';

import { RankingsOverTimeResponse } from '../../../shared/types';
import { statsApi } from '../../services/statsApi';

import { RankingsRace } from './RankingsRace';
import './RankingsOverTime.css';

type RankingType = 'tracks' | 'artists' | 'albums';
type TimeRange = 'all' | '1year' | '6months' | '3months';

export const RankingsOverTime: React.FC = () => {
  const [activeTab, setActiveTab] = useState<RankingType>('artists');
  const [topN, setTopN] = useState<number>(10);
  const [timeRange, setTimeRange] = useState<TimeRange>('1year');
  const [data, setData] = useState<RankingsOverTimeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate date range based on time range selector
  const getDateRange = useCallback((): {
    startDate?: number;
    endDate?: number;
  } => {
    const now = Date.now();
    switch (timeRange) {
      case '3months':
        return { startDate: now - 90 * 24 * 60 * 60 * 1000, endDate: now };
      case '6months':
        return { startDate: now - 180 * 24 * 60 * 60 * 1000, endDate: now };
      case '1year':
        return { startDate: now - 365 * 24 * 60 * 60 * 1000, endDate: now };
      case 'all':
        return {}; // No date filter - truly all time
    }
  }, [timeRange]);

  // Fetch rankings data
  const fetchRankings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const dateRange = getDateRange();

      const response = await statsApi.getRankingsOverTime(
        activeTab,
        topN,
        dateRange.startDate,
        dateRange.endDate
      );

      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || 'Failed to load rankings data');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, topN, getDateRange, timeRange]);

  // Fetch data when tab or topN changes
  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  // Handle tab change
  const handleTabChange = useCallback((type: RankingType) => {
    setActiveTab(type);
  }, []);

  // Handle topN change
  const handleTopNChange = (e: { target: { value: string } }) => {
    setTopN(parseInt(e.target.value, 10));
  };

  // Handle time range change
  const handleTimeRangeChange = (e: { target: { value: string } }) => {
    setTimeRange(e.target.value as TimeRange);
  };

  return (
    <div className='rankings-over-time'>
      <div className='rankings-over-time-header'>
        <h2>Rankings Over Time</h2>
        <p className='rankings-over-time-subtitle'>
          Watch how your top {activeTab} have evolved over time
        </p>
      </div>

      {/* Tabs */}
      <div className='rankings-over-time-tabs'>
        <button
          className={`rankings-tab ${activeTab === 'artists' ? 'rankings-tab-active' : ''}`}
          onClick={() => handleTabChange('artists')}
        >
          Top Artists
        </button>
        <button
          className={`rankings-tab ${activeTab === 'albums' ? 'rankings-tab-active' : ''}`}
          onClick={() => handleTabChange('albums')}
        >
          Top Albums
        </button>
        <button
          className={`rankings-tab ${activeTab === 'tracks' ? 'rankings-tab-active' : ''}`}
          onClick={() => handleTabChange('tracks')}
        >
          Top Tracks
        </button>
      </div>

      {/* Controls */}
      <div className='rankings-over-time-controls'>
        <div className='rankings-control-group'>
          <label htmlFor='timeRange-select'>Time period:</label>
          <select
            id='timeRange-select'
            value={timeRange}
            onChange={handleTimeRangeChange}
            className='rankings-select'
          >
            <option value='3months'>Last 3 months</option>
            <option value='6months'>Last 6 months</option>
            <option value='1year'>Last year</option>
            <option value='all'>All time</option>
          </select>
        </div>

        <div className='rankings-control-group'>
          <label htmlFor='topN-select'>Show top:</label>
          <select
            id='topN-select'
            value={topN}
            onChange={handleTopNChange}
            className='rankings-select'
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={20}>20</option>
          </select>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className='rankings-over-time-loading'>
          <div className='rankings-spinner' />
          <p>Loading rankings data...</p>
        </div>
      )}

      {error && (
        <div className='rankings-over-time-error'>
          <p>{error}</p>
          <button onClick={fetchRankings} className='rankings-retry-button'>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <RankingsRace
          key={`${timeRange}-${activeTab}-${topN}`}
          snapshots={data.snapshots}
          type={data.type}
          topN={data.topN}
        />
      )}
    </div>
  );
};

export default RankingsOverTime;
