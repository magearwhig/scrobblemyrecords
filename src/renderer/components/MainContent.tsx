import React, { useState, useEffect } from 'react';

import ArtistDetailPage from '../pages/ArtistDetailPage';
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
import TrackDetailPage from '../pages/TrackDetailPage';
import WhatToPlayPage from '../pages/WhatToPlayPage';
import WrappedPage from '../pages/WrappedPage';
import { ROUTES } from '../routes';

interface MainContentProps {
  currentPage: string;
}

const MainContent: React.FC<MainContentProps> = ({ currentPage }) => {
  // Track unique keys to force remount of detail pages when navigating to them
  const [releaseKey, setReleaseKey] = useState<string>('0');
  const [artistKey, setArtistKey] = useState<string>('0');
  const [trackKey, setTrackKey] = useState<string>('0');

  useEffect(() => {
    // When navigating to detail pages, generate a new key to force remount
    // Use timestamp to always get a fresh key, ensuring the page reloads
    if (currentPage === ROUTES.RELEASE_DETAILS) {
      setReleaseKey(`release-${Date.now()}`);
    } else if (currentPage === ROUTES.ARTIST_DETAIL) {
      setArtistKey(`artist-${Date.now()}`);
    } else if (currentPage === ROUTES.TRACK_DETAIL) {
      setTrackKey(`track-${Date.now()}`);
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
      case ROUTES.ARTIST_DETAIL:
        return <ArtistDetailPage key={artistKey} />;
      case ROUTES.TRACK_DETAIL:
        return <TrackDetailPage key={trackKey} />;
      default:
        return <HomePage />;
    }
  };

  return <>{renderPage()}</>;
};

export default MainContent;
