import React, { useState, useEffect } from 'react';

import CollectionPage from '../pages/CollectionPage';
import DiscardPilePage from '../pages/DiscardPilePage';
import DiscoveryPage from '../pages/DiscoveryPage';
import HistoryPage from '../pages/HistoryPage';
import HomePage from '../pages/HomePage';
import NewReleasesPage from '../pages/NewReleasesPage';
import ReleaseDetailsPage from '../pages/ReleaseDetailsPage';
import ScrobblePage from '../pages/ScrobblePage';
import SellerMatchesPage from '../pages/SellerMatchesPage';
import SellersPage from '../pages/SellersPage';
import SettingsPage from '../pages/SettingsPage';
import StatsPage from '../pages/StatsPage';
import SuggestionsPage from '../pages/SuggestionsPage';
import WishlistPage from '../pages/WishlistPage';
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
      case ROUTES.SUGGESTIONS:
        return <SuggestionsPage />;
      case ROUTES.DISCOVERY:
        return <DiscoveryPage />;
      case ROUTES.STATS:
        return <StatsPage />;
      case ROUTES.WISHLIST:
        return <WishlistPage />;
      case ROUTES.RELEASES:
        return <NewReleasesPage />;
      case ROUTES.SELLERS:
        return <SellersPage />;
      case ROUTES.SELLER_MATCHES:
        return <SellerMatchesPage />;
      case ROUTES.DISCARD_PILE:
        return <DiscardPilePage />;
      default:
        return <HomePage />;
    }
  };

  return <>{renderPage()}</>;
};

export default MainContent;
