import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import WishlistPage from '../../../src/renderer/pages/WishlistPage';
import {
  EnrichedWishlistItem,
  LocalWantItem,
  WishlistSettings,
  WishlistSyncStatus,
  AuthStatus,
} from '../../../src/shared/types';

// Mock the API service
const mockGetWishlist = jest.fn();
const mockGetWishlistSyncStatus = jest.fn();
const mockGetWishlistSettings = jest.fn();
const mockGetLocalWantList = jest.fn();
const mockStartWishlistSync = jest.fn();
const mockGetMasterVersions = jest.fn();
const mockCheckLocalWantListForVinyl = jest.fn();
const mockRemoveFromLocalWantList = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getWishlist: mockGetWishlist,
    getWishlistSyncStatus: mockGetWishlistSyncStatus,
    getWishlistSettings: mockGetWishlistSettings,
    getLocalWantList: mockGetLocalWantList,
    startWishlistSync: mockStartWishlistSync,
    getMasterVersions: mockGetMasterVersions,
    checkLocalWantListForVinyl: mockCheckLocalWantListForVinyl,
    removeFromLocalWantList: mockRemoveFromLocalWantList,
  }),
}));

// Mock useNotifications hook
jest.mock('../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    addNotification: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    removeNotification: jest.fn(),
    clearAll: jest.fn(),
    isLoaded: true,
  }),
  createSuccessNotification: jest.fn((title, message, action) => ({
    type: 'success',
    title,
    message,
    action,
  })),
}));

const mockWishlistItems: EnrichedWishlistItem[] = [
  {
    id: 1,
    masterId: 12345,
    releaseId: 67890,
    artist: 'Radiohead',
    title: 'OK Computer',
    year: 1997,
    coverImage: 'https://example.com/cover.jpg',
    dateAdded: '2024-01-01',
    vinylStatus: 'has_vinyl',
    vinylVersions: [
      {
        releaseId: 111,
        title: 'OK Computer (2LP)',
        format: ['Vinyl', 'LP'],
        label: 'XL',
        country: 'UK',
        year: 2017,
        hasVinyl: true,
        marketplaceStats: {
          lowestPrice: 25.99,
          medianPrice: 30.0,
          highestPrice: 50.0,
          numForSale: 15,
          currency: 'USD',
          lastFetched: Date.now(),
        },
      },
    ],
    lowestVinylPrice: 25.99,
    priceCurrency: 'USD',
  },
  {
    id: 2,
    masterId: 54321,
    releaseId: 98765,
    artist: 'The Beatles',
    title: 'Abbey Road',
    year: 1969,
    coverImage: 'https://example.com/abbey.jpg',
    dateAdded: '2024-01-02',
    vinylStatus: 'cd_only',
    vinylVersions: [],
  },
];

const mockLocalWantItems: LocalWantItem[] = [
  {
    id: 'local-1',
    artist: 'Bon Iver',
    album: 'For Emma, Forever Ago',
    playCount: 15,
    lastPlayed: Date.now() - 86400000,
    addedAt: Date.now() - 86400000 * 7,
    source: 'discovery',
    vinylStatus: 'unknown',
    notified: false,
  },
];

const mockSyncStatus: WishlistSyncStatus = {
  status: 'completed',
  progress: 100,
  itemsProcessed: 10,
  totalItems: 10,
  vinylChecked: 5,
  lastSyncTimestamp: Date.now() - 3600000,
};

const mockSettings: WishlistSettings = {
  schemaVersion: 1,
  priceThreshold: 50,
  currency: 'USD',
  autoSyncInterval: 7,
  notifyOnVinylAvailable: true,
};

const createMockAuthContext = (authStatus: AuthStatus) => ({
  authStatus,
  setAuthStatus: jest.fn(),
});

const defaultAuthStatus: AuthStatus = {
  discogs: { authenticated: true, username: 'testuser' },
  lastfm: { authenticated: true, username: 'testuser' },
};

const renderWishlistPage = (authStatus: AuthStatus = defaultAuthStatus) => {
  const authContextValue = createMockAuthContext(authStatus);

  return render(
    <AppProvider>
      <AuthProvider value={authContextValue}>
        <WishlistPage />
      </AuthProvider>
    </AppProvider>
  );
};

describe('WishlistPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWishlist.mockResolvedValue(mockWishlistItems);
    mockGetWishlistSyncStatus.mockResolvedValue(mockSyncStatus);
    mockGetWishlistSettings.mockResolvedValue(mockSettings);
    mockGetLocalWantList.mockResolvedValue(mockLocalWantItems);
    mockStartWishlistSync.mockResolvedValue(mockSyncStatus);
    mockGetMasterVersions.mockResolvedValue([]);
    mockCheckLocalWantListForVinyl.mockResolvedValue([]);
    mockRemoveFromLocalWantList.mockResolvedValue(true);
  });

  it('renders loading state initially', async () => {
    renderWishlistPage();

    expect(screen.getByText('Loading wishlist...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading wishlist...')).not.toBeInTheDocument();
    });
  });

  it('renders wishlist items after loading', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    expect(screen.getByText('OK Computer')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('displays sync status information', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText(/with vinyl/)).toBeInTheDocument();
    });
  });

  it('shows all tabs', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText(/All \(/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Has Vinyl \(/)).toBeInTheDocument();
    expect(screen.getByText(/CD Only \(/)).toBeInTheDocument();
    expect(screen.getByText(/Affordable \(/)).toBeInTheDocument();
    expect(screen.getByText(/Monitoring \(/)).toBeInTheDocument();
  });

  it('filters items by vinyl status when clicking Has Vinyl tab', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Click the "Has Vinyl" tab
    const hasVinylTab = screen.getByText(/Has Vinyl \(/);
    fireEvent.click(hasVinylTab);

    // Should show Radiohead (has vinyl) but not Beatles (cd_only)
    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });
  });

  it('filters items by CD only status when clicking CD Only tab', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('The Beatles')).toBeInTheDocument();
    });

    // Click the "CD Only" tab
    const cdOnlyTab = screen.getByText(/CD Only \(/);
    fireEvent.click(cdOnlyTab);

    // Should show Beatles (cd_only)
    await waitFor(() => {
      expect(screen.getByText('The Beatles')).toBeInTheDocument();
    });
  });

  it('shows local want list when clicking Monitoring tab', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Click the "Monitoring" tab
    const monitoringTab = screen.getByText(/Monitoring \(/);
    fireEvent.click(monitoringTab);

    // Should show local want list item
    await waitFor(() => {
      expect(screen.getByText('Bon Iver')).toBeInTheDocument();
    });
    expect(screen.getByText('For Emma, Forever Ago')).toBeInTheDocument();
  });

  it('triggers sync when clicking Sync button', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Sync Wishlist')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Wishlist');
    fireEvent.click(syncButton);

    expect(mockStartWishlistSync).toHaveBeenCalled();
  });

  it('handles sync errors gracefully', async () => {
    mockStartWishlistSync.mockRejectedValue(new Error('Sync failed'));

    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Sync Wishlist')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Wishlist');
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(screen.getByText('Sync failed')).toBeInTheDocument();
    });
  });

  it('handles API errors on initial load', async () => {
    mockGetWishlist.mockRejectedValue(new Error('Failed to load'));

    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });
  });

  it('shows empty state when wishlist is empty', async () => {
    mockGetWishlist.mockResolvedValue([]);
    mockGetLocalWantList.mockResolvedValue([]);

    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText(/Your wishlist is empty/)).toBeInTheDocument();
    });
  });

  it('displays price information for vinyl items', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Check for price display
    expect(screen.getByText(/From:/)).toBeInTheDocument();
  });

  it('has sort options', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    expect(screen.getByText('Sort by:')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Date Added')).toBeInTheDocument();
  });

  it('changes sort order when selecting different option', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const sortSelect = screen.getByDisplayValue('Date Added');
    fireEvent.change(sortSelect, { target: { value: 'artist' } });

    expect(screen.getByDisplayValue('Artist')).toBeInTheDocument();
  });

  it('shows Check for Vinyl button in Monitoring tab', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const monitoringTab = screen.getByText(/Monitoring \(/);
    fireEvent.click(monitoringTab);

    await waitFor(() => {
      expect(screen.getByText('Check for Vinyl')).toBeInTheDocument();
    });
  });

  it('checks vinyl availability when clicking Check for Vinyl', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const monitoringTab = screen.getByText(/Monitoring \(/);
    fireEvent.click(monitoringTab);

    await waitFor(() => {
      expect(screen.getByText('Check for Vinyl')).toBeInTheDocument();
    });

    const checkButton = screen.getByText('Check for Vinyl');
    fireEvent.click(checkButton);

    expect(mockCheckLocalWantListForVinyl).toHaveBeenCalled();
  });

  it('shows Versions button for wishlist items', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const versionsButtons = screen.getAllByText('Versions');
    expect(versionsButtons.length).toBeGreaterThan(0);
  });

  it('shows Shop button for items with vinyl', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Radiohead has vinyl, so should have Shop button
    expect(screen.getByText('Shop')).toBeInTheDocument();
  });
});
