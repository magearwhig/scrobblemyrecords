import { AlertTriangle, Disc3, TrendingUp } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

import './CollectionAnalyticsPage.page.css';

import { CollectionAnalyticsOverview } from '../../shared/types';
import AnalyticsOverviewSection from '../components/collection-analytics/AnalyticsOverviewSection';
import FormatDetailSection from '../components/collection-analytics/FormatDetailSection';
import LabelDetailSection from '../components/collection-analytics/LabelDetailSection';
import TimelineDetailSection from '../components/collection-analytics/TimelineDetailSection';
import ValueEstimationSection from '../components/collection-analytics/ValueEstimationSection';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useAuth } from '../context/AuthContext';
import { useTabKeyNavigation } from '../hooks/useTabKeyNavigation';
import { navigate } from '../routes';
import { collectionAnalyticsApi } from '../services/statsApi';
import { createLogger } from '../utils/logger';
import { getTabFromUrl } from '../utils/tabUtils';

const log = createLogger('CollectionAnalyticsPage');

type TabId = 'overview' | 'value' | 'formats' | 'labels' | 'timeline';

const VALID_TABS: TabId[] = [
  'overview',
  'value',
  'formats',
  'labels',
  'timeline',
];

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  value: 'Value',
  formats: 'Formats',
  labels: 'Labels',
  timeline: 'Timeline',
};

const CollectionAnalyticsPage: React.FC = () => {
  const { authStatus } = useAuth();
  const handleTabKeyDown = useTabKeyNavigation();
  const [activeTab, setActiveTab] = useState<TabId>(
    () => getTabFromUrl(VALID_TABS, 'overview') as TabId
  );
  const [overview, setOverview] = useState<CollectionAnalyticsOverview | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync active tab when the URL hash changes (e.g., back/forward navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const tab = getTabFromUrl(VALID_TABS, 'overview') as TabId;
      setActiveTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await collectionAnalyticsApi.getOverview();
      if (response.success && response.data) {
        setOverview(response.data);
      } else {
        setError(response.error || 'Failed to load analytics');
      }
    } catch (err) {
      log.error('Failed to fetch collection analytics', err);
      setError('Failed to load collection analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus.discogs.authenticated) {
      fetchOverview();
    }
  }, [authStatus.discogs.authenticated, fetchOverview]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab === 'overview') {
      navigate('collection-analytics');
    } else {
      navigate('collection-analytics', { tab });
    }
  }, []);

  if (!authStatus.discogs.authenticated) {
    return (
      <div className='collection-analytics-page'>
        <h1>Collection Analytics</h1>
        <EmptyState
          icon={<TrendingUp size={48} aria-hidden='true' />}
          title='Connect Discogs'
          description='Connect your Discogs account to see collection analytics.'
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className='collection-analytics-page'>
        <h1>Collection Analytics</h1>
        <div className='analytics-tabs' role='tablist'>
          {VALID_TABS.map(tab => (
            <button key={tab} className='analytics-tab' role='tab' disabled>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div className='analytics-loading'>
          <Skeleton width='100%' height={120} />
          <Skeleton width='100%' height={300} />
          <Skeleton width='100%' height={300} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='collection-analytics-page'>
        <h1>Collection Analytics</h1>
        <EmptyState
          icon={<AlertTriangle size={48} aria-hidden='true' />}
          title='Error Loading Analytics'
          description={error}
        />
      </div>
    );
  }

  if (!overview || overview.summary.totalItems === 0) {
    return (
      <div className='collection-analytics-page'>
        <h1>Collection Analytics</h1>
        <EmptyState
          icon={<Disc3 size={48} aria-hidden='true' />}
          title='No Collection Data'
          description='Add records to your Discogs collection to see analytics.'
        />
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <AnalyticsOverviewSection overview={overview} />;
      case 'value':
        return <ValueEstimationSection />;
      case 'formats':
        return <FormatDetailSection formats={overview.formats} />;
      case 'labels':
        return <LabelDetailSection labels={overview.labels} />;
      case 'timeline':
        return (
          <TimelineDetailSection
            growth={overview.growth}
            decades={overview.decades}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className='collection-analytics-page'>
      <h1>Collection Analytics</h1>
      <div
        className='analytics-tabs'
        role='tablist'
        aria-label='Collection analytics sections'
      >
        {VALID_TABS.map(tab => (
          <button
            key={tab}
            className={`analytics-tab ${activeTab === tab ? 'analytics-tab--active' : ''}`}
            role='tab'
            aria-selected={activeTab === tab}
            aria-controls={`tabpanel-${tab}`}
            onClick={() => handleTabChange(tab)}
            onKeyDown={handleTabKeyDown}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div
        className='analytics-tab-content'
        role='tabpanel'
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {renderTabContent()}
      </div>
    </div>
  );
};

export default CollectionAnalyticsPage;
