import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { ToastProvider } from '../../../src/renderer/context/ToastContext';
import SellerMatchesPage from '../../../src/renderer/pages/SellerMatchesPage';
import {
  SellerMatch,
  MonitoredSeller,
  AlbumPlayCountResponse,
} from '../../../src/shared/types';

// Mock API service
const mockGetSellerMatchesWithCacheInfo = jest.fn();
const mockGetSellers = jest.fn();
const mockMarkMatchAsSeen = jest.fn();
const mockVerifyMatch = jest.fn();
const mockGetAlbumPlayCounts = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getSellerMatchesWithCacheInfo: mockGetSellerMatchesWithCacheInfo,
    getSellers: mockGetSellers,
    markMatchAsSeen: mockMarkMatchAsSeen,
    verifyMatch: mockVerifyMatch,
    getAlbumPlayCounts: mockGetAlbumPlayCounts,
  }),
}));

// Mock MatchCard component
jest.mock('../../../src/renderer/components/MatchCard', () => {
  return function MockMatchCard({
    match,
    onMarkAsSeen,
    onVerify,
    markingAsSeen,
    verifying,
    playCount,
  }: {
    match: SellerMatch;
    formatPrice: (p: number, c: string) => string;
    formatRelativeTime: (t: number) => string;
    getSellerDisplayName: (id: string) => string;
    onMarkAsSeen: (id: string) => void;
    onVerify: (id: string) => void;
    markingAsSeen: boolean;
    verifying: boolean;
    playCount?: number;
    lastPlayed?: number | null;
  }) {
    return (
      <div data-testid={`match-card-${match.id}`}>
        <span>
          {match.artist} - {match.title}
        </span>
        <span data-testid={`match-price-${match.id}`}>${match.price}</span>
        <span data-testid={`match-seller-${match.id}`}>{match.sellerId}</span>
        {match.status === 'sold' && <span>SOLD</span>}
        {playCount !== undefined && <span>{playCount} plays</span>}
        <button onClick={() => onMarkAsSeen(match.id)} disabled={markingAsSeen}>
          Mark Seen
        </button>
        <button onClick={() => onVerify(match.id)} disabled={verifying}>
          Verify
        </button>
      </div>
    );
  };
});

// Mock Skeleton
jest.mock('../../../src/renderer/components/ui/Skeleton', () => ({
  AlbumCardSkeleton: ({ count }: { count: number }) => (
    <div data-testid='skeleton-loader'>Loading {count} items...</div>
  ),
}));

// Mock logger
jest.mock('../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockMatches: SellerMatch[] = [
  {
    id: 'match-1',
    sellerId: 'vinylshop',
    releaseId: 123,
    masterId: 456,
    artist: 'Radiohead',
    title: 'OK Computer',
    format: ['Vinyl', 'LP'],
    condition: 'Near Mint (NM or M-)',
    price: 29.99,
    currency: 'USD',
    listingUrl: 'https://discogs.com/sell/item/1',
    listingId: 1001,
    dateFound: Date.now() - 86400000,
    notified: true,
    status: 'active',
  },
  {
    id: 'match-2',
    sellerId: 'recordstore',
    releaseId: 789,
    artist: 'The Beatles',
    title: 'Abbey Road',
    format: ['Vinyl', 'LP'],
    condition: 'Very Good Plus (VG+)',
    price: 45.0,
    currency: 'USD',
    listingUrl: 'https://discogs.com/sell/item/2',
    listingId: 1002,
    dateFound: Date.now() - 172800000,
    notified: true,
    status: 'active',
  },
  {
    id: 'match-3',
    sellerId: 'vinylshop',
    releaseId: 321,
    artist: 'Pink Floyd',
    title: 'Dark Side of the Moon',
    format: ['Vinyl', 'LP'],
    condition: 'Very Good (VG)',
    price: 55.0,
    currency: 'USD',
    listingUrl: 'https://discogs.com/sell/item/3',
    listingId: 1003,
    dateFound: Date.now() - 259200000,
    notified: true,
    status: 'sold',
  },
];

const mockSellers: MonitoredSeller[] = [
  {
    username: 'vinylshop',
    displayName: 'Local Vinyl Shop',
    addedAt: Date.now() - 604800000,
    matchCount: 2,
  },
  {
    username: 'recordstore',
    displayName: 'Downtown Records',
    addedAt: Date.now() - 1209600000,
    matchCount: 1,
  },
];

const mockCacheInfo = {
  lastUpdated: Date.now() - 3600000,
  oldestScanAge: 7200000,
  nextScanDue: 0,
};

const mockPlayCountResponse: AlbumPlayCountResponse = {
  results: [
    {
      artist: 'Radiohead',
      title: 'OK Computer',
      playCount: 42,
      lastPlayed: Date.now() / 1000 - 86400,
      matchType: 'exact',
    },
    {
      artist: 'The Beatles',
      title: 'Abbey Road',
      playCount: 15,
      lastPlayed: null,
      matchType: 'fuzzy',
    },
  ],
};

const renderSellerMatchesPage = () => {
  return render(
    <AppProvider>
      <ToastProvider>
        <SellerMatchesPage />
      </ToastProvider>
    </AppProvider>
  );
};

describe('SellerMatchesPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    mockGetSellerMatchesWithCacheInfo.mockResolvedValue({
      matches: mockMatches,
      cacheInfo: mockCacheInfo,
    });
    mockGetSellers.mockResolvedValue(mockSellers);
    mockGetAlbumPlayCounts.mockResolvedValue(mockPlayCountResponse);
  });

  it('renders loading state initially', () => {
    renderSellerMatchesPage();

    expect(screen.getByText('Wishlist Matches')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('renders matches after loading', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('match-card-match-2')).toBeInTheDocument();
  });

  it('hides sold matches by default', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    // Sold match should not be visible by default
    expect(screen.queryByTestId('match-card-match-3')).not.toBeInTheDocument();
  });

  it('has Show Sold toggle checkbox', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    const showSoldCheckbox = screen.getByRole('checkbox');
    expect(showSoldCheckbox).toBeInTheDocument();
    expect(showSoldCheckbox).not.toBeChecked();
  });

  it('shows item count in description', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Showing 2 items found at your monitored sellers/)
      ).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    mockGetSellerMatchesWithCacheInfo.mockRejectedValue(
      new Error('Failed to load')
    );

    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });

    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('retries loading when clicking Try Again', async () => {
    mockGetSellerMatchesWithCacheInfo.mockRejectedValueOnce(
      new Error('Failed to load')
    );
    mockGetSellerMatchesWithCacheInfo.mockResolvedValueOnce({
      matches: mockMatches,
      cacheInfo: mockCacheInfo,
    });

    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Try Again'));

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });
  });

  it('shows empty state when no matches', async () => {
    mockGetSellerMatchesWithCacheInfo.mockResolvedValue({
      matches: [],
      cacheInfo: mockCacheInfo,
    });

    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByText('No Matches Found')).toBeInTheDocument();
    });
  });

  it('shows cache info banner', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByText(/Data from/)).toBeInTheDocument();
    });
  });

  it('shows seller filter dropdown', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    expect(screen.getByText('All Sellers')).toBeInTheDocument();
    expect(screen.getByText('Local Vinyl Shop')).toBeInTheDocument();
    expect(screen.getByText('Downtown Records')).toBeInTheDocument();
  });

  it('has seller filter options available', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    // Verify both sellers appear as filter options
    const options = screen.getAllByRole('option');
    const sellerOptions = options.map(o => o.textContent);
    expect(sellerOptions).toContain('All Sellers');
    expect(sellerOptions).toContain('Local Vinyl Shop');
    expect(sellerOptions).toContain('Downtown Records');
  });

  it('shows sort options', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Newest First')).toBeInTheDocument();
  });

  it('marks match as seen', async () => {
    mockMarkMatchAsSeen.mockResolvedValue(undefined);

    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    const markSeenButtons = screen.getAllByText('Mark Seen');
    await user.click(markSeenButtons[0]);

    expect(mockMarkMatchAsSeen).toHaveBeenCalledWith('match-1');
  });

  it('verifies a match listing', async () => {
    mockVerifyMatch.mockResolvedValue({
      updated: true,
      status: 'active',
    });
    // Mock reload after verify
    mockGetSellerMatchesWithCacheInfo.mockResolvedValue({
      matches: mockMatches,
      cacheInfo: mockCacheInfo,
    });

    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    const verifyButtons = screen.getAllByText('Verify');
    await user.click(verifyButtons[0]);

    expect(mockVerifyMatch).toHaveBeenCalledWith('match-1');
  });

  it('shows Back to Sellers button when not embedded', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(screen.getByTestId('match-card-match-1')).toBeInTheDocument();
    });

    const backButton = screen.getByText(/Back to Sellers/);
    expect(backButton).toBeInTheDocument();
  });

  it('fetches play counts for matches', async () => {
    renderSellerMatchesPage();

    await waitFor(() => {
      expect(mockGetAlbumPlayCounts).toHaveBeenCalled();
    });
  });
});
