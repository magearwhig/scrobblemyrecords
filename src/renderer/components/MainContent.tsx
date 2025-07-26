import React from 'react';

import CollectionPage from '../pages/CollectionPage';
import HistoryPage from '../pages/HistoryPage';
import HomePage from '../pages/HomePage';
import ReleaseDetailsPage from '../pages/ReleaseDetailsPage';
import ScrobblePage from '../pages/ScrobblePage';
import SettingsPage from '../pages/SettingsPage';
import SetupPage from '../pages/SetupPage';

interface MainContentProps {
  currentPage: string;
}

const MainContent: React.FC<MainContentProps> = ({ currentPage }) => {
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'setup':
        return <SetupPage />;
      case 'collection':
        return <CollectionPage />;
      case 'scrobble':
        return <ScrobblePage />;
      case 'history':
        return <HistoryPage />;
      case 'settings':
        return <SettingsPage />;
      case 'release-details':
        return <ReleaseDetailsPage />;
      default:
        return <HomePage />;
    }
  };

  return <>{renderPage()}</>;
};

export default MainContent;
