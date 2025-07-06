import React from 'react';
import HomePage from '../pages/HomePage';
import SetupPage from '../pages/SetupPage';
import CollectionPage from '../pages/CollectionPage';
import ScrobblePage from '../pages/ScrobblePage';
import HistoryPage from '../pages/HistoryPage';
import SettingsPage from '../pages/SettingsPage';
import ReleaseDetailsPage from '../pages/ReleaseDetailsPage';

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