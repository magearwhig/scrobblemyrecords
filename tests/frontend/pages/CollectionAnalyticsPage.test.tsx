import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import CollectionAnalyticsPage from '../../../src/renderer/pages/CollectionAnalyticsPage';
import { collectionAnalyticsApi } from '../../../src/renderer/services/statsApi';
import { CollectionAnalyticsOverview } from '../../../src/shared/types';

// Mock recharts (does not render in jsdom)
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='pie-chart'>{children}</div>
  ),
  Pie: () => null,
  Cell: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='bar-chart'>{children}</div>
  ),
  Bar: () => null,
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='area-chart'>{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

// Mock the stats API
jest.mock('../../../src/renderer/services/statsApi', () => ({
  collectionAnalyticsApi: {
    getOverview: jest.fn(),
    getValue: jest.fn(),
    startValueScan: jest.fn(),
    getValueScanStatus: jest.fn(),
    getFormats: jest.fn(),
    getLabels: jest.fn(),
    getDecades: jest.fn(),
    getGrowth: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockCollectionAnalyticsApi = collectionAnalyticsApi as jest.Mocked<
  typeof collectionAnalyticsApi
>;

function createMockOverview(): CollectionAnalyticsOverview {
  return {
    summary: {
      totalItems: 100,
      totalArtists: 50,
      totalLabels: 30,
      oldestRelease: { year: 1960, artist: 'Beatles', title: 'Abbey Road' },
      newestRelease: {
        year: 2024,
        artist: 'Modern Artist',
        title: 'New Album',
      },
      oldestAddition: {
        date: '2020-01-01',
        artist: 'First Add',
        title: 'First',
      },
      newestAddition: {
        date: '2024-12-01',
        artist: 'Last Add',
        title: 'Latest',
      },
      averageReleaseYear: 1990,
      ratedCount: 25,
      averageRating: 4.2,
    },
    formats: {
      categories: [
        { name: 'LP (12")', count: 60, percentage: 60, examples: [] },
        { name: 'CD', count: 30, percentage: 30, examples: [] },
        { name: '7" Single', count: 10, percentage: 10, examples: [] },
      ],
      totalItems: 100,
    },
    labels: {
      labels: [
        {
          name: 'Blue Note',
          count: 15,
          percentage: 15,
          variants: ['Blue Note', 'Blue Note Records'],
        },
        { name: 'Warp', count: 10, percentage: 10, variants: ['Warp Records'] },
      ],
      totalLabels: 30,
      totalItems: 100,
    },
    decades: {
      decades: [
        { decade: '1960s', startYear: 1960, count: 10, percentage: 10 },
        { decade: '1990s', startYear: 1990, count: 40, percentage: 40 },
        { decade: '2000s', startYear: 2000, count: 30, percentage: 30 },
      ],
      years: [
        { year: 1965, count: 5 },
        { year: 1995, count: 20 },
      ],
      unknownYearCount: 5,
    },
    growth: {
      dataPoints: [
        { period: '2020-01', added: 10, cumulative: 10 },
        { period: '2020-06', added: 20, cumulative: 30 },
      ],
      granularity: 'month',
      totalAdded: 100,
    },
  };
}

function createEmptyOverview(): CollectionAnalyticsOverview {
  return {
    summary: {
      totalItems: 0,
      totalArtists: 0,
      totalLabels: 0,
      oldestRelease: null,
      newestRelease: null,
      oldestAddition: null,
      newestAddition: null,
      averageReleaseYear: null,
      ratedCount: 0,
      averageRating: null,
    },
    formats: { categories: [], totalItems: 0 },
    labels: { labels: [], totalLabels: 0, totalItems: 0 },
    decades: { decades: [], years: [], unknownYearCount: 0 },
    growth: { dataPoints: [], granularity: 'month', totalAdded: 0 },
  };
}

const renderWithAuth = (
  ui: React.ReactElement,
  authOverrides: {
    discogs?: { authenticated: boolean };
    lastfm?: { authenticated: boolean };
  } = {}
) => {
  const authValue = {
    authStatus: {
      discogs: { authenticated: true, ...authOverrides.discogs },
      lastfm: { authenticated: true, ...authOverrides.lastfm },
    },
    setAuthStatus: jest.fn(),
  };
  return render(<AuthProvider value={authValue}>{ui}</AuthProvider>);
};

describe('CollectionAnalyticsPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();
    // Reset hash
    window.location.hash = '';
  });

  it('renders loading state with skeleton elements', () => {
    // Arrange: API never resolves so loading stays true
    mockCollectionAnalyticsApi.getOverview.mockReturnValue(
      new Promise(() => {})
    );

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert: heading is present, disabled tab buttons visible, and skeleton loading
    expect(
      screen.getByRole('heading', { level: 1, name: 'Collection Analytics' })
    ).toBeInTheDocument();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(5);
    tabs.forEach(tab => {
      expect(tab).toBeDisabled();
    });

    const loadingContainer = document.querySelector('.analytics-loading');
    expect(loadingContainer).toBeInTheDocument();
  });

  it('renders error state when API fails', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: false,
      error: 'Something went wrong',
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Error Loading Analytics')).toBeInTheDocument();
    });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders error state when API throws', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockRejectedValue(
      new Error('Network error')
    );

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Error Loading Analytics')).toBeInTheDocument();
    });
    expect(
      screen.getByText('Failed to load collection analytics')
    ).toBeInTheDocument();
  });

  it('renders empty collection state when totalItems is 0', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: createEmptyOverview(),
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('No Collection Data')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        'Add records to your Discogs collection to see analytics.'
      )
    ).toBeInTheDocument();
  });

  it('renders error state when API returns success but no data', async () => {
    // Arrange: response.success is true but data is null, which triggers
    // the else branch setting the error to 'Failed to load analytics'
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: null as unknown as CollectionAnalyticsOverview,
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert: since data is null, the code enters the error branch
    await waitFor(() => {
      expect(screen.getByText('Error Loading Analytics')).toBeInTheDocument();
    });
    expect(screen.getByText('Failed to load analytics')).toBeInTheDocument();
  });

  it('shows connect message when Discogs is not authenticated', () => {
    // Arrange & Act
    renderWithAuth(<CollectionAnalyticsPage />, {
      discogs: { authenticated: false },
    });

    // Assert
    expect(screen.getByText('Connect Discogs')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Connect your Discogs account to see collection analytics.'
      )
    ).toBeInTheDocument();
    // Should NOT call the API when not authenticated
    expect(mockCollectionAnalyticsApi.getOverview).not.toHaveBeenCalled();
  });

  it('renders tab navigation with all five tabs', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: createMockOverview(),
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert
    await waitFor(() => {
      const tablist = screen.getByRole('tablist');
      expect(tablist).toBeInTheDocument();
    });

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Value' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Formats' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Labels' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Timeline' })).toBeInTheDocument();
  });

  it('defaults to the Overview tab', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: createMockOverview(),
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert
    await waitFor(() => {
      const overviewTab = screen.getByRole('tab', { name: 'Overview' });
      expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('switches tabs when a different tab is clicked', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: createMockOverview(),
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Formats' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Formats' }));

    // Assert
    expect(screen.getByRole('tab', { name: 'Formats' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
  });

  it('renders overview content by default', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: createMockOverview(),
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert: check for overview section content (summary cards)
    await waitFor(() => {
      expect(screen.getByText('Total Records')).toBeInTheDocument();
    });
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('Total Artists')).toBeInTheDocument();
  });

  it('renders the tabpanel with correct role', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: createMockOverview(),
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    // Assert
    await waitFor(() => {
      const tabpanel = screen.getByRole('tabpanel');
      expect(tabpanel).toBeInTheDocument();
    });
  });

  it('renders the formats tab content when Formats tab is clicked', async () => {
    // Arrange
    mockCollectionAnalyticsApi.getOverview.mockResolvedValue({
      success: true,
      data: createMockOverview(),
    });

    // Act
    renderWithAuth(<CollectionAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Formats' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Formats' }));

    // Assert: Format Detail Section renders
    await waitFor(() => {
      expect(screen.getByText('Format Distribution')).toBeInTheDocument();
    });
  });
});
