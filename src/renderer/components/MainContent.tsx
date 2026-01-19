import React, { useState, useEffect } from 'react';

import CollectionPage from '../pages/CollectionPage';
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

interface MainContentProps {
  currentPage: string;
}

const MainContent: React.FC<MainContentProps> = ({ currentPage }) => {
  // Track a unique key to force remount of ReleaseDetailsPage when navigating to it
  const [releaseKey, setReleaseKey] = useState<string>('0');

  useEffect(() => {
    // When navigating to release-details, generate a new key to force remount
    // Use timestamp to always get a fresh key, ensuring the page reloads
    if (currentPage === 'release-details') {
      setReleaseKey(`release-${Date.now()}`);
    }
  }, [currentPage]);

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'collection':
        return <CollectionPage />;
      case 'scrobble':
        return <ScrobblePage />;
      case 'history':
        return <HistoryPage />;
      case 'settings':
        return <SettingsPage />;
      case 'release-details':
        // Use key to force remount when a different release is selected
        return <ReleaseDetailsPage key={releaseKey} />;
      case 'suggestions':
        return <SuggestionsPage />;
      case 'discovery':
        return <DiscoveryPage />;
      case 'stats':
        return <StatsPage />;
      case 'wishlist':
        return <WishlistPage />;
      case 'releases':
        return <NewReleasesPage />;
      case 'sellers':
        return <SellersPage />;
      case 'seller-matches':
        return <SellerMatchesPage />;
      default:
        return <HomePage />;
    }
  };

  return <>{renderPage()}</>;
};

export default MainContent;
