import React, { useCallback, useEffect, useState } from 'react';

import { DashboardData, MilestoneInfo } from '../../shared/types';
import {
  ConnectionStatus,
  DashboardStatCard,
  MonthlyHighlights,
  QuickActionsGrid,
  RecentAlbums,
} from '../components/dashboard';
import { CalendarHeatmap } from '../components/stats/CalendarHeatmap';
import { MilestoneProgress } from '../components/stats/MilestoneProgress';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';
import { getTimezoneOffset } from '../utils/dateUtils';

const HomePage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state } = useApp();

  // Navigation helper using hash-based routing
  const navigate = useCallback((path: string) => {
    window.location.hash = path.startsWith('/') ? path.slice(1) : path;
  }, []);

  const [serverStatus, setServerStatus] = useState<
    'checking' | 'connected' | 'error'
  >('checking');
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(
    null
  );
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<
    Array<{ date: string; count: number }>
  >([]);
  const [milestoneData, setMilestoneData] = useState<MilestoneInfo | null>(
    null
  );
  const [secondaryDataLoaded, setSecondaryDataLoaded] = useState(false);

  // Check server connection and load auth status
  useEffect(() => {
    checkServerAndAuth();
  }, [state.serverUrl]);

  // Load dashboard data when server is connected and we have auth
  useEffect(() => {
    if (serverStatus === 'connected') {
      loadDashboardData();
    }
  }, [
    serverStatus,
    authStatus.discogs.authenticated,
    authStatus.lastfm.authenticated,
  ]);

  // Load secondary data (heatmap, milestones) after dashboard renders - non-blocking
  useEffect(() => {
    if (dashboardData && !secondaryDataLoaded) {
      loadSecondaryData();
    }
  }, [dashboardData, secondaryDataLoaded]);

  const checkServerAndAuth = async () => {
    try {
      setServerStatus('checking');
      const api = getApiService(state.serverUrl);

      // Check server health
      await api.healthCheck();
      setServerStatus('connected');

      // Get auth status
      const status = await api.getAuthStatus();
      setAuthStatus(status);
    } catch {
      setServerStatus('error');
    }
  };

  const loadDashboardData = async () => {
    try {
      setDashboardLoading(true);
      setDashboardError(null);
      setSecondaryDataLoaded(false);
      const api = getApiService(state.serverUrl);

      // Load only critical dashboard data first for fast initial render
      const dashboard = await api.getDashboard();
      setDashboardData(dashboard);
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : 'Failed to load dashboard'
      );
    } finally {
      setDashboardLoading(false);
    }
  };

  // Load secondary data (heatmap, milestones) non-blocking after dashboard renders
  const loadSecondaryData = async () => {
    const api = getApiService(state.serverUrl);

    // Load heatmap and milestones in parallel, but don't block on failures
    const [heatmap, milestones] = await Promise.all([
      loadHeatmapData(api),
      loadMilestoneData(api),
    ]);

    setHeatmapData(heatmap);
    setMilestoneData(milestones);
    setSecondaryDataLoaded(true);
  };

  const loadHeatmapData = async (
    api: ReturnType<typeof getApiService>
  ): Promise<Array<{ date: string; count: number }>> => {
    try {
      // Use correct endpoint path: /stats/heatmap (not /stats/calendar-heatmap)
      const response = await api['api'].get('/stats/heatmap');
      return response.data.data || [];
    } catch {
      return [];
    }
  };

  const loadMilestoneData = async (
    api: ReturnType<typeof getApiService>
  ): Promise<MilestoneInfo | null> => {
    try {
      const response = await api['api'].get('/stats/milestones');
      return response.data.data || null;
    } catch {
      return null;
    }
  };

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return n.toLocaleString();
  };

  // Determine if user has completed onboarding
  const isOnboarded =
    authStatus.discogs.authenticated && authStatus.lastfm.authenticated;

  // If not onboarded, show the onboarding view
  if (!isOnboarded && serverStatus === 'connected') {
    return (
      <div className='dashboard'>
        <ConnectionStatus
          authStatus={authStatus}
          serverConnected={true}
          isLoading={false}
        />

        <div className='dashboard-empty'>
          <div className='dashboard-empty-icon'>🎵</div>
          <h2>Welcome to RecordScrobbles</h2>
          <p>
            Connect your Discogs and Last.fm accounts to start tracking your
            vinyl listening habits.
          </p>
          <button
            type='button'
            className='btn'
            onClick={() => navigate('/settings')}
          >
            Connect Accounts
          </button>
        </div>

        <div className='dashboard-section'>
          <h3 className='dashboard-section-header'>How It Works</h3>
          <div className='dashboard-highlights-grid'>
            <div className='dashboard-highlights-column'>
              <h4 className='dashboard-highlights-title'>1. Connect</h4>
              <p className='dashboard-section-subtitle'>
                Link your Discogs collection and Last.fm profile.
              </p>
            </div>
            <div className='dashboard-highlights-column'>
              <h4 className='dashboard-highlights-title'>2. Scrobble</h4>
              <p className='dashboard-section-subtitle'>
                Select albums from your collection to log what you&apos;re
                listening to.
              </p>
            </div>
            <div className='dashboard-highlights-column'>
              <h4 className='dashboard-highlights-title'>3. Discover</h4>
              <p className='dashboard-section-subtitle'>
                Get insights about your listening habits and discover patterns.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (dashboardLoading) {
    return (
      <div className='dashboard'>
        <div className='dashboard-loading'>
          <div className='dashboard-loading-spinner' />
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (dashboardError) {
    return (
      <div className='dashboard'>
        <div className='dashboard-error'>
          <div className='dashboard-error-icon'>⚠️</div>
          <h2>Unable to load dashboard</h2>
          <p>{dashboardError}</p>
          <button type='button' className='btn' onClick={loadDashboardData}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const quickStats = dashboardData?.quickStats;

  return (
    <div className='dashboard'>
      {/* Connection Status (collapsed when all connected) */}
      <ConnectionStatus
        authStatus={authStatus}
        serverConnected={serverStatus === 'connected'}
        isLoading={serverStatus === 'checking'}
      />

      {/* Quick Stats Row */}
      {quickStats && (
        <div className='dashboard-stats-row'>
          <DashboardStatCard
            icon='🔥'
            value={quickStats.currentStreak}
            label='Day Streak'
            subValue={
              quickStats.longestStreak > quickStats.currentStreak
                ? `Best: ${quickStats.longestStreak}`
                : undefined
            }
            onClick={() => navigate('/stats')}
          />
          <DashboardStatCard
            icon='📊'
            value={formatNumber(quickStats.scrobblesThisMonth)}
            label='This Month'
            subValue={`Avg: ${formatNumber(quickStats.averageMonthlyScrobbles)}`}
          />
          <DashboardStatCard
            icon='🎤'
            value={quickStats.newArtistsThisMonth}
            label='New Artists'
            subValue='This month'
          />
          <DashboardStatCard
            icon='📀'
            value={`${quickStats.collectionCoverageThisMonth}%`}
            label='Collection Played'
            subValue='This month'
          />
          <DashboardStatCard
            icon='⏱️'
            value={`${quickStats.listeningHoursThisMonth}h`}
            label='Listening Time'
            subValue='This month'
          />
          <DashboardStatCard
            icon='🎯'
            value={formatNumber(quickStats.totalScrobbles)}
            label='All Time'
            subValue={
              quickStats.nextMilestone
                ? `Next: ${formatNumber(quickStats.nextMilestone)}`
                : undefined
            }
            onClick={() => navigate('/stats')}
          />
        </div>
      )}

      {/* Quick Actions */}
      {dashboardData?.quickActions && (
        <QuickActionsGrid actions={dashboardData.quickActions} />
      )}

      {/* Main Content Grid */}
      <div className='dashboard-grid'>
        {/* Recent Albums */}
        {dashboardData?.recentAlbums &&
          dashboardData.recentAlbums.length > 0 && (
            <RecentAlbums
              albums={dashboardData.recentAlbums}
              timezone={getTimezoneOffset()}
            />
          )}

        {/* Monthly Highlights */}
        {((dashboardData?.monthlyTopArtists &&
          dashboardData.monthlyTopArtists.length > 0) ||
          (dashboardData?.monthlyTopAlbums &&
            dashboardData.monthlyTopAlbums.length > 0)) && (
          <MonthlyHighlights
            artists={dashboardData.monthlyTopArtists || []}
            albums={dashboardData.monthlyTopAlbums || []}
          />
        )}

        {/* Calendar Heatmap */}
        {heatmapData.length > 0 && (
          <div className='dashboard-section dashboard-grid-full'>
            <CalendarHeatmap
              data={heatmapData}
              year={new Date().getFullYear()}
            />
          </div>
        )}

        {/* Milestone Progress */}
        {milestoneData && (
          <div className='dashboard-section dashboard-grid-full'>
            <MilestoneProgress milestones={milestoneData} />
          </div>
        )}
      </div>

      {/* Empty state if no data */}
      {!dashboardData?.recentAlbums?.length &&
        !dashboardData?.monthlyTopArtists?.length &&
        !heatmapData.length && (
          <div className='dashboard-empty'>
            <div className='dashboard-empty-icon'>📻</div>
            <h2>No listening data yet</h2>
            <p>
              Start scrobbling your vinyl collection to see your listening
              activity here.
            </p>
            <button
              type='button'
              className='btn'
              onClick={() => navigate('/collection')}
            >
              Browse Collection
            </button>
          </div>
        )}
    </div>
  );
};

export default HomePage;
