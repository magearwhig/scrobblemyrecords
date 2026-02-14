import React, { useState, useEffect } from 'react';

import CollectionPage from '../pages/CollectionPage';
import DiscardPilePage from '../pages/DiscardPilePage';
import DiscoveryPage from '../pages/DiscoveryPage';
import HistoryPage from '../pages/HistoryPage';
import HomePage from '../pages/HomePage';
import MarketplacePage from '../pages/MarketplacePage';
import ReleaseDetailsPage from '../pages/ReleaseDetailsPage';
import ScrobblePage from '../pages/ScrobblePage';
import SettingsPage from '../pages/SettingsPage';
import StatsPage from '../pages/StatsPage';
import WhatToPlayPage from '../pages/WhatToPlayPage';
import WrappedPage from '../pages/WrappedPage';
import { ROUTES } from '../routes';

interface MainContentProps {
  currentPage: string;
}

const MainContent: React.FC<MainContentProps> = ({ currentPage }) => {
  // Track a unique key to force remount of ReleaseDetailsPage when navigating to it
  const [releaseKey, setReleaseKey] = useState<string>('0');

  useEffect(() => {
    // When navigating to release-details, generate a new key to force remount
    // Use timestamp to always get a fresh key, ensuring the page reloads
    if (currentPage === ROUTES.RELEASE_DETAILS) {
      setReleaseKey(`release-${Date.now()}`);
    }
  }, [currentPage]);

  const renderPage = () => {
    switch (currentPage) {
      case ROUTES.HOME:
        return <HomePage />;
      case ROUTES.COLLECTION:
        return <CollectionPage />;
      case ROUTES.SCROBBLE:
        return <ScrobblePage />;
      case ROUTES.HISTORY:
        return <HistoryPage />;
      case ROUTES.SETTINGS:
        return <SettingsPage />;
      case ROUTES.RELEASE_DETAILS:
        // Use key to force remount when a different release is selected
        return <ReleaseDetailsPage key={releaseKey} />;
      case ROUTES.MARKETPLACE:
        return <MarketplacePage />;
      case ROUTES.WHAT_TO_PLAY:
        return <WhatToPlayPage />;
      case ROUTES.DISCOVERY:
        return <DiscoveryPage />;
      case ROUTES.STATS:
        return <StatsPage />;
      case ROUTES.DISCARD_PILE:
        return <DiscardPilePage />;
      case ROUTES.WRAPPED:
        return <WrappedPage />;
      default:
        return <HomePage />;
    }
  };

  return <>{renderPage()}</>;
};

export default MainContent;
