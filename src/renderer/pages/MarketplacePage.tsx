import React, { useState, useEffect } from 'react';

import './MarketplacePage.page.css';

import MissingAlbumsContainer from '../components/marketplace/MissingAlbumsContainer';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useTabKeyNavigation } from '../hooks/useTabKeyNavigation';
import { ROUTES, navigate } from '../routes';
import { getApiService } from '../services/api';
import { getTabFromUrl } from '../utils/tabUtils';

import NewReleasesPage from './NewReleasesPage';
import SellerMatchesPage from './SellerMatchesPage';
import SellersPage from './SellersPage';
import WishlistPage from './WishlistPage';

type MarketplaceTab =
  | 'wishlist'
  | 'new-releases'
  | 'sellers'
  | 'matches'
  | 'missing-albums';

const VALID_TABS: MarketplaceTab[] = [
  'wishlist',
  'new-releases',
  'sellers',
  'matches',
  'missing-albums',
];

const TAB_LABELS: Record<MarketplaceTab, string> = {
  wishlist: 'Wishlist',
  'new-releases': 'New Releases',
  sellers: 'Local Sellers',
  matches: 'Seller Matches',
  'missing-albums': 'Missing Albums',
};

const MarketplacePage: React.FC = () => {
  const { state } = useApp();
  const { authStatus, setAuthStatus } = useAuth();
  const handleTabKeyDown = useTabKeyNavigation();
  const [authChecked, setAuthChecked] = useState(false);
  const api = getApiService(state.serverUrl);
  const [activeTab, setActiveTab] = useState<MarketplaceTab>(
    () => getTabFromUrl(VALID_TABS, 'wishlist') as MarketplaceTab
  );

  // Check auth status on mount if not authenticated (handles page refresh)
  useEffect(() => {
    if (!authStatus.discogs.authenticated && !authChecked) {
      setAuthChecked(true);
      api
        .getAuthStatus()
        .then(setAuthStatus)
        .catch(() => {});
    }
  }, [authStatus.discogs.authenticated, authChecked, setAuthStatus]);

  // Sync active tab when the URL hash changes (e.g., redirects, back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const tab = getTabFromUrl(VALID_TABS, 'wishlist') as MarketplaceTab;
      setActiveTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleTabChange = (tab: MarketplaceTab) => {
    setActiveTab(tab);
    // Preserve any extra query params (like seller filter)
    const hash = window.location.hash;
    const queryStart = hash.indexOf('?');
    const existingParams =
      queryStart !== -1
        ? new URLSearchParams(hash.substring(queryStart))
        : new URLSearchParams();
    existingParams.set('tab', tab);
    // Remove seller param when not on matches tab
    if (tab !== 'matches') {
      existingParams.delete('seller');
    }
    navigate(ROUTES.MARKETPLACE, Object.fromEntries(existingParams));
  };

  if (!authStatus.discogs.authenticated) {
    return (
      <div className='marketplace-page'>
        <h1>Marketplace</h1>
        <div className='card'>
          <p className='text-secondary'>
            Please connect to Discogs to access the Marketplace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='marketplace-page'>
      <h1>Marketplace</h1>
      <p className='page-description'>Find, track, and buy vinyl records.</p>

      <div className='tabs' role='tablist' aria-label='Marketplace sections'>
        {VALID_TABS.map(tab => (
          <button
            key={tab}
            role='tab'
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => handleTabChange(tab)}
            onKeyDown={handleTabKeyDown}
            aria-selected={activeTab === tab}
            aria-controls={`marketplace-panel-${tab}`}
            aria-label={TAB_LABELS[tab]}
            tabIndex={activeTab === tab ? 0 : -1}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div
        className='marketplace-tab-content'
        role='tabpanel'
        id={`marketplace-panel-${activeTab}`}
      >
        {activeTab === 'wishlist' && <WishlistPage embedded />}
        {activeTab === 'new-releases' && <NewReleasesPage embedded />}
        {activeTab === 'sellers' && <SellersPage embedded />}
        {activeTab === 'matches' && <SellerMatchesPage embedded />}
        {activeTab === 'missing-albums' && <MissingAlbumsContainer />}
      </div>
    </div>
  );
};

export default MarketplacePage;
