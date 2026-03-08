import React, { Suspense, useState, useEffect } from 'react';

import HomePage from '../pages/HomePage';
import { ROUTES } from '../routes';

// Lazy-load all pages except HomePage (default route, should load instantly)
const ArtistDetailPage = React.lazy(() => import('../pages/ArtistDetailPage'));
const CollectionAnalyticsPage = React.lazy(
  () => import('../pages/CollectionAnalyticsPage')
);
const CollectionPage = React.lazy(() => import('../pages/CollectionPage'));
const DiscardPilePage = React.lazy(() => import('../pages/DiscardPilePage'));
const DiscoveryPage = React.lazy(() => import('../pages/DiscoveryPage'));
const HistoryPage = React.lazy(() => import('../pages/HistoryPage'));
const MarketplacePage = React.lazy(() => import('../pages/MarketplacePage'));
const RecommendationsPage = React.lazy(
  () => import('../pages/RecommendationsPage')
);
const ReleaseDetailsPage = React.lazy(
  () => import('../pages/ReleaseDetailsPage')
);
const ScrobblePage = React.lazy(() => import('../pages/ScrobblePage'));
const SettingsPage = React.lazy(() => import('../pages/SettingsPage'));
const StatsPage = React.lazy(() => import('../pages/StatsPage'));
const TrackDetailPage = React.lazy(() => import('../pages/TrackDetailPage'));
const WhatToPlayPage = React.lazy(() => import('../pages/WhatToPlayPage'));
const WrappedPage = React.lazy(() => import('../pages/WrappedPage'));

const PageLoadingFallback: React.FC = () => (
  <div className='page-loading-fallback'>
    <div className='spinner' />
  </div>
);

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
      case ROUTES.COLLECTION_ANALYTICS:
        return <CollectionAnalyticsPage />;
      case ROUTES.WRAPPED:
        return <WrappedPage />;
      case ROUTES.ARTIST_DETAIL:
        return <ArtistDetailPage key={artistKey} />;
      case ROUTES.TRACK_DETAIL:
        return <TrackDetailPage key={trackKey} />;
      case ROUTES.RECOMMENDATIONS:
        return <RecommendationsPage />;
      default:
        return <HomePage />;
    }
  };

  return <Suspense fallback={<PageLoadingFallback />}>{renderPage()}</Suspense>;
};

export default MainContent;
