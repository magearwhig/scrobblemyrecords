import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import MainContent from '../../../src/renderer/components/MainContent';

// Mock all page components
jest.mock('../../../src/renderer/pages/HomePage', () => {
  return function MockHomePage() {
    return <div data-testid='home-page'>Home Page</div>;
  };
});

jest.mock('../../../src/renderer/pages/CollectionPage', () => {
  return function MockCollectionPage() {
    return <div data-testid='collection-page'>Collection Page</div>;
  };
});

jest.mock('../../../src/renderer/pages/ScrobblePage', () => {
  return function MockScrobblePage() {
    return <div data-testid='scrobble-page'>Scrobble Page</div>;
  };
});

jest.mock('../../../src/renderer/pages/HistoryPage', () => {
  return function MockHistoryPage() {
    return <div data-testid='history-page'>History Page</div>;
  };
});

jest.mock('../../../src/renderer/pages/SettingsPage', () => {
  return function MockSettingsPage() {
    return <div data-testid='settings-page'>Settings Page</div>;
  };
});

jest.mock('../../../src/renderer/pages/ReleaseDetailsPage', () => {
  return function MockReleaseDetailsPage() {
    return <div data-testid='release-details-page'>Release Details Page</div>;
  };
});

describe('MainContent', () => {
  it('renders HomePage when currentPage is "home"', () => {
    render(<MainContent currentPage='home' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('renders CollectionPage when currentPage is "collection"', () => {
    render(<MainContent currentPage='collection' />);

    expect(screen.getByTestId('collection-page')).toBeInTheDocument();
    expect(screen.getByText('Collection Page')).toBeInTheDocument();
  });

  it('renders ScrobblePage when currentPage is "scrobble"', () => {
    render(<MainContent currentPage='scrobble' />);

    expect(screen.getByTestId('scrobble-page')).toBeInTheDocument();
    expect(screen.getByText('Scrobble Page')).toBeInTheDocument();
  });

  it('renders HistoryPage when currentPage is "history"', () => {
    render(<MainContent currentPage='history' />);

    expect(screen.getByTestId('history-page')).toBeInTheDocument();
    expect(screen.getByText('History Page')).toBeInTheDocument();
  });

  it('renders SettingsPage when currentPage is "settings"', () => {
    render(<MainContent currentPage='settings' />);

    expect(screen.getByTestId('settings-page')).toBeInTheDocument();
    expect(screen.getByText('Settings Page')).toBeInTheDocument();
  });

  it('renders ReleaseDetailsPage when currentPage is "release-details"', () => {
    render(<MainContent currentPage='release-details' />);

    expect(screen.getByTestId('release-details-page')).toBeInTheDocument();
    expect(screen.getByText('Release Details Page')).toBeInTheDocument();
  });

  it('renders HomePage as default when currentPage is invalid', () => {
    render(<MainContent currentPage='invalid-page' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('renders HomePage as default when currentPage is empty string', () => {
    render(<MainContent currentPage='' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('renders HomePage as default when currentPage is undefined', () => {
    render(<MainContent currentPage={undefined as any} />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('renders HomePage when currentPage is "setup" (removed page)', () => {
    // Setup page was removed - should fall through to default (HomePage)
    render(<MainContent currentPage='setup' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('only renders one page at a time', () => {
    const { rerender } = render(<MainContent currentPage='home' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    expect(screen.queryByTestId('collection-page')).not.toBeInTheDocument();

    // Change page and verify only new page is rendered
    rerender(<MainContent currentPage='collection' />);

    expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('collection-page')).toBeInTheDocument();
  });

  it('handles page switching correctly', () => {
    const { rerender } = render(<MainContent currentPage='home' />);

    expect(screen.getByTestId('home-page')).toBeInTheDocument();

    rerender(<MainContent currentPage='collection' />);
    expect(screen.getByTestId('collection-page')).toBeInTheDocument();

    rerender(<MainContent currentPage='settings' />);
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();

    rerender(<MainContent currentPage='history' />);
    expect(screen.getByTestId('history-page')).toBeInTheDocument();
  });
});
