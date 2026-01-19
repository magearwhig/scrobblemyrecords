import React, { useState, useEffect } from 'react';

import {
  SettingsConnectionsSection,
  SettingsIntegrationsSection,
  SettingsMappingsSection,
  SettingsFiltersSection,
  SettingsWishlistSection,
  SettingsBackupSection,
} from '../components/settings';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { getApiService } from '../services/api';

type SettingsTab =
  | 'connections'
  | 'integrations'
  | 'mappings'
  | 'filters'
  | 'wishlist'
  | 'backup';

interface TabConfig {
  id: SettingsTab;
  label: string;
  icon: string;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'connections',
    label: 'Connections',
    icon: '🔗',
    description: 'Discogs & Last.fm accounts',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: '🔌',
    description: 'Sync & AI connections',
  },
  {
    id: 'mappings',
    label: 'Mappings',
    icon: '🔄',
    description: 'Artist & album name mappings',
  },
  {
    id: 'filters',
    label: 'Filters',
    icon: '👁️',
    description: 'Hidden items',
  },
  {
    id: 'wishlist',
    label: 'Wishlist',
    icon: '💿',
    description: 'Wishlist & sellers',
  },
  {
    id: 'backup',
    label: 'Backup',
    icon: '💾',
    description: 'Export & restore',
  },
];

// Helper to parse tab from URL hash query params
const getTabFromUrl = (): SettingsTab | null => {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;

  const queryString = hash.slice(queryIndex + 1);
  const params = new URLSearchParams(queryString);
  const tab = params.get('tab');

  if (tab && TABS.some(t => t.id === tab)) {
    return tab as SettingsTab;
  }
  return null;
};

const SettingsPage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();

  // Initialize with URL tab param or default to 'connections'
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    return getTabFromUrl() || 'connections';
  });

  // Badge counts for tabs
  const [mappingsCount, setMappingsCount] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);

  const api = getApiService(state.serverUrl);

  // Listen for hash changes to handle tab parameter
  useEffect(() => {
    const handleHashChange = () => {
      const tabFromUrl = getTabFromUrl();
      if (tabFromUrl) {
        setActiveTab(tabFromUrl);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Load badge counts
  useEffect(() => {
    const loadCounts = async () => {
      try {
        // Load mappings count
        const mappingsData = await api.getArtistMappings();
        const [discoveryAlbums, discoveryArtists, mbidMappings] =
          await Promise.all([
            api.getDiscoveryAlbumMappings(),
            api.getDiscoveryArtistMappings(),
            api.getArtistMbidMappings(),
          ]);
        setMappingsCount(
          mappingsData.stats.totalMappings +
            discoveryAlbums.length +
            discoveryArtists.length +
            mbidMappings.mappings.length
        );

        // Load hidden counts
        const [hiddenAlbums, hiddenArtists] = await Promise.all([
          api.getHiddenAlbums(),
          api.getHiddenArtists(),
        ]);
        setHiddenCount(hiddenAlbums.length + hiddenArtists.length);
      } catch (error) {
        console.warn('Failed to load settings counts:', error);
      }
    };

    loadCounts();
  }, [api, authStatus.discogs.authenticated]);

  const getBadgeCount = (tabId: SettingsTab): number | null => {
    switch (tabId) {
      case 'mappings':
        return mappingsCount > 0 ? mappingsCount : null;
      case 'filters':
        return hiddenCount > 0 ? hiddenCount : null;
      default:
        return null;
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'connections':
        return <SettingsConnectionsSection api={api} />;
      case 'integrations':
        return <SettingsIntegrationsSection api={api} />;
      case 'mappings':
        return <SettingsMappingsSection api={api} />;
      case 'filters':
        return <SettingsFiltersSection api={api} />;
      case 'wishlist':
        return <SettingsWishlistSection api={api} />;
      case 'backup':
        return <SettingsBackupSection api={api} />;
      default:
        return null;
    }
  };

  return (
    <div className='settings-page'>
      {/* Header */}
      <div className='settings-header-card'>
        <h1>Settings</h1>
        <p className='settings-page-description'>
          Configure your connections, integrations, mappings, and preferences
        </p>
      </div>

      {/* Tab Navigation */}
      <div className='settings-tabs-container'>
        <div className='settings-tabs'>
          {TABS.map(tab => {
            const badgeCount = getBadgeCount(tab.id);
            return (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className='settings-tab-icon'>{tab.icon}</span>
                <span className='settings-tab-label'>{tab.label}</span>
                {badgeCount !== null && (
                  <span className='settings-tab-badge'>{badgeCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className='settings-tab-content'>{renderTabContent()}</div>
    </div>
  );
};

export default SettingsPage;
