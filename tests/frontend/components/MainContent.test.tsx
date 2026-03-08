import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import MainContent from '../../../src/renderer/components/MainContent';

// Mock all page components
// Use __esModule + default for compatibility with React.lazy dynamic imports
jest.mock('../../../src/renderer/pages/HomePage', () => {
  return function MockHomePage() {
    return <div data-testid='home-page'>Home Page</div>;
  };
});

jest.mock('../../../src/renderer/pages/CollectionPage', () => ({
  __esModule: true,
  default: function MockCollectionPage() {
    return <div data-testid='collection-page'>Collection Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/ScrobblePage', () => ({
  __esModule: true,
  default: function MockScrobblePage() {
    return <div data-testid='scrobble-page'>Scrobble Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/HistoryPage', () => ({
  __esModule: true,
  default: function MockHistoryPage() {
    return <div data-testid='history-page'>History Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/SettingsPage', () => ({
  __esModule: true,
  default: function MockSettingsPage() {
    return <div data-testid='settings-page'>Settings Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/ReleaseDetailsPage', () => ({
  __esModule: true,
  default: function MockReleaseDetailsPage() {
    return <div data-testid='release-details-page'>Release Details Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/ArtistDetailPage', () => ({
  __esModule: true,
  default: function MockArtistDetailPage() {
    return <div data-testid='artist-detail-page'>Artist Detail Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/TrackDetailPage', () => ({
  __esModule: true,
  default: function MockTrackDetailPage() {
    return <div data-testid='track-detail-page'>Track Detail Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/CollectionAnalyticsPage', () => ({
  __esModule: true,
  default: function MockCollectionAnalyticsPage() {
    return (
      <div data-testid='collection-analytics-page'>
        Collection Analytics Page
      </div>
    );
  },
}));

jest.mock('../../../src/renderer/pages/DiscardPilePage', () => ({
  __esModule: true,
  default: function MockDiscardPilePage() {
    return <div data-testid='discard-pile-page'>Discard Pile Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/DiscoveryPage', () => ({
  __esModule: true,
  default: function MockDiscoveryPage() {
    return <div data-testid='discovery-page'>Discovery Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/MarketplacePage', () => ({
  __esModule: true,
  default: function MockMarketplacePage() {
    return <div data-testid='marketplace-page'>Marketplace Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/RecommendationsPage', () => ({
  __esModule: true,
  default: function MockRecommendationsPage() {
    return <div data-testid='recommendations-page'>Recommendations Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/StatsPage', () => ({
  __esModule: true,
  default: function MockStatsPage() {
    return <div data-testid='stats-page'>Stats Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/WhatToPlayPage', () => ({
  __esModule: true,
  default: function MockWhatToPlayPage() {
    return <div data-testid='what-to-play-page'>What To Play Page</div>;
  },
}));

jest.mock('../../../src/renderer/pages/WrappedPage', () => ({
  __esModule: true,
  default: function MockWrappedPage() {
    return <div data-testid='wrapped-page'>Wrapped Page</div>;
  },
}));

describe('MainContent', () => {
  it('renders HomePage when currentPage is "home"', async () => {
    render(<MainContent currentPage='home' />);

    // HomePage is statically imported, available immediately
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('renders CollectionPage when currentPage is "collection"', async () => {
    render(<MainContent currentPage='collection' />);

    expect(await screen.findByTestId('collection-page')).toBeInTheDocument();
  });

  it('renders ScrobblePage when currentPage is "scrobble"', async () => {
    render(<MainContent currentPage='scrobble' />);

    expect(await screen.findByTestId('scrobble-page')).toBeInTheDocument();
  });

  it('renders HistoryPage when currentPage is "history"', async () => {
    render(<MainContent currentPage='history' />);

    expect(await screen.findByTestId('history-page')).toBeInTheDocument();
  });

  it('renders SettingsPage when currentPage is "settings"', async () => {
    render(<MainContent currentPage='settings' />);

    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();
  });

  it('renders ReleaseDetailsPage when currentPage is "release-details"', async () => {
    render(<MainContent currentPage='release-details' />);

    expect(
      await screen.findByTestId('release-details-page')
    ).toBeInTheDocument();
  });

  it('renders HomePage as default when currentPage is invalid', async () => {
    render(<MainContent currentPage='invalid-page' />);

    // Default case returns HomePage (statically imported)
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('renders HomePage as default when currentPage is empty string', async () => {
    render(<MainContent currentPage='' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('renders HomePage as default when currentPage is undefined', async () => {
    render(<MainContent currentPage={undefined as any} />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('renders HomePage when currentPage is "setup" (removed page)', async () => {
    render(<MainContent currentPage='setup' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  it('only renders one page at a time', async () => {
    const { rerender } = render(<MainContent currentPage='home' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-page')).not.toBeInTheDocument();

    // Change page and verify only new page is rendered
    rerender(<MainContent currentPage='collection' />);

    expect(await screen.findByTestId('collection-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    });
  });

  it('handles page switching correctly', async () => {
    const { rerender } = render(<MainContent currentPage='home' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();

    rerender(<MainContent currentPage='collection' />);
    expect(await screen.findByTestId('collection-page')).toBeInTheDocument();

    rerender(<MainContent currentPage='settings' />);
    expect(await screen.findByTestId('settings-page')).toBeInTheDocument();

    rerender(<MainContent currentPage='history' />);
    expect(await screen.findByTestId('history-page')).toBeInTheDocument();
  });
});
