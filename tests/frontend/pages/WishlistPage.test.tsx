import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import WishlistPage from '../../../src/renderer/pages/WishlistPage';
import {
  AlbumPlayCountResult,
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
const mockGetAlbumPlayCounts = jest.fn();

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
    getAlbumPlayCounts: mockGetAlbumPlayCounts,
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
  let user: ReturnType<typeof userEvent.setup>;

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
    mockGetAlbumPlayCounts.mockResolvedValue({ results: [] });
    user = userEvent.setup();
  });

  it('renders loading state initially', async () => {
    renderWishlistPage();

    expect(document.querySelector('.skeleton-album-card')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        document.querySelector('.skeleton-album-card')
      ).not.toBeInTheDocument();
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
    await user.click(hasVinylTab);

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
    await user.click(cdOnlyTab);

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
    await user.click(monitoringTab);

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
    await user.click(syncButton);

    expect(mockStartWishlistSync).toHaveBeenCalled();
  });

  it('handles sync errors gracefully', async () => {
    mockStartWishlistSync.mockRejectedValue(new Error('Sync failed'));

    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Sync Wishlist')).toBeInTheDocument();
    });

    const syncButton = screen.getByText('Sync Wishlist');
    await user.click(syncButton);

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
    await user.selectOptions(sortSelect, 'artist');

    expect(screen.getByDisplayValue('Artist')).toBeInTheDocument();
  });

  it('shows Check for Vinyl button in Monitoring tab', async () => {
    renderWishlistPage();

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    const monitoringTab = screen.getByText(/Monitoring \(/);
    await user.click(monitoringTab);

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
    await user.click(monitoringTab);

    await waitFor(() => {
      expect(screen.getByText('Check for Vinyl')).toBeInTheDocument();
    });

    const checkButton = screen.getByText('Check for Vinyl');
    await user.click(checkButton);

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

  describe('Scrobbles Sort', () => {
    const scrobbleSortItems: EnrichedWishlistItem[] = [
      {
        id: 10,
        masterId: 100,
        releaseId: 1000,
        artist: 'Low Plays',
        title: 'Rarely Listened',
        dateAdded: '2025-01-01T00:00:00Z',
        vinylStatus: 'unknown',
        vinylVersions: [],
      },
      {
        id: 11,
        masterId: 110,
        releaseId: 1100,
        artist: 'High Plays',
        title: 'Fan Favorite',
        dateAdded: '2025-01-02T00:00:00Z',
        vinylStatus: 'unknown',
        vinylVersions: [],
      },
      {
        id: 12,
        masterId: 120,
        releaseId: 1200,
        artist: 'Mid Plays',
        title: 'Moderate Listen',
        dateAdded: '2025-01-03T00:00:00Z',
        vinylStatus: 'unknown',
        vinylVersions: [],
      },
    ];

    const scrobblePlayCounts: AlbumPlayCountResult[] = [
      {
        artist: 'Low Plays',
        title: 'Rarely Listened',
        playCount: 5,
        lastPlayed: null,
        matchType: 'exact',
      },
      {
        artist: 'High Plays',
        title: 'Fan Favorite',
        playCount: 100,
        lastPlayed: null,
        matchType: 'exact',
      },
      {
        artist: 'Mid Plays',
        title: 'Moderate Listen',
        playCount: 50,
        lastPlayed: null,
        matchType: 'exact',
      },
    ];

    it('sorts items by play count descending when scrobbles sort is selected', async () => {
      mockGetWishlist.mockResolvedValue(scrobbleSortItems);
      mockGetLocalWantList.mockResolvedValue([]);
      mockGetAlbumPlayCounts.mockResolvedValue({ results: scrobblePlayCounts });

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Low Plays')).toBeInTheDocument();
      });

      // Select scrobbles sort
      const sortSelect = screen.getByDisplayValue('Date Added');
      await user.selectOptions(sortSelect, 'scrobbles');

      // Get all artist elements in order to verify sort
      await waitFor(() => {
        const artistElements = screen.getAllByText(/Plays$/);
        expect(artistElements[0]).toHaveTextContent('High Plays');
        expect(artistElements[1]).toHaveTextContent('Mid Plays');
        expect(artistElements[2]).toHaveTextContent('Low Plays');
      });
    });

    it('uses date added as secondary sort when scrobble counts are equal', async () => {
      const equalPlayItems: EnrichedWishlistItem[] = [
        {
          id: 20,
          masterId: 200,
          releaseId: 2000,
          artist: 'Artist Older',
          title: 'Older Album',
          dateAdded: '2025-01-01T00:00:00Z',
          vinylStatus: 'unknown',
          vinylVersions: [],
        },
        {
          id: 21,
          masterId: 210,
          releaseId: 2100,
          artist: 'Artist Newer',
          title: 'Newer Album',
          dateAdded: '2025-06-15T00:00:00Z',
          vinylStatus: 'unknown',
          vinylVersions: [],
        },
      ];

      const equalPlayCounts: AlbumPlayCountResult[] = [
        {
          artist: 'Artist Older',
          title: 'Older Album',
          playCount: 10,
          lastPlayed: null,
          matchType: 'exact',
        },
        {
          artist: 'Artist Newer',
          title: 'Newer Album',
          playCount: 10,
          lastPlayed: null,
          matchType: 'exact',
        },
      ];

      mockGetWishlist.mockResolvedValue(equalPlayItems);
      mockGetLocalWantList.mockResolvedValue([]);
      mockGetAlbumPlayCounts.mockResolvedValue({ results: equalPlayCounts });

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Artist Older')).toBeInTheDocument();
      });

      const sortSelect = screen.getByDisplayValue('Date Added');
      await user.selectOptions(sortSelect, 'scrobbles');

      // Equal play counts -> newer date first (secondary sort by date descending)
      await waitFor(() => {
        const cards = screen.getAllByText(/Artist (Older|Newer)/);
        expect(cards[0]).toHaveTextContent('Artist Newer');
        expect(cards[1]).toHaveTextContent('Artist Older');
      });
    });
  });

  describe('Monitored Toggle', () => {
    it('shows "Include monitored" toggle when local want items exist', async () => {
      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      expect(screen.getByText(/Include monitored/)).toBeInTheDocument();
    });

    it('does not show "Include monitored" toggle when no local want items exist', async () => {
      mockGetLocalWantList.mockResolvedValue([]);

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      expect(screen.queryByText(/Include monitored/)).not.toBeInTheDocument();
    });

    it('merges monitored items into All tab when toggle is checked', async () => {
      // Use a unique local item that doesn't overlap with wishlist items
      const uniqueLocalItems: LocalWantItem[] = [
        {
          id: 'local-merge',
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
      mockGetLocalWantList.mockResolvedValue(uniqueLocalItems);
      // Return results matching all albums so they get cached and avoid infinite re-fetch loop
      mockGetAlbumPlayCounts.mockResolvedValue({
        results: [
          {
            artist: 'Radiohead',
            title: 'OK Computer',
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
          },
          {
            artist: 'The Beatles',
            title: 'Abbey Road',
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
          },
          {
            artist: 'Bon Iver',
            title: 'For Emma, Forever Ago',
            playCount: 15,
            lastPlayed: null,
            matchType: 'exact' as const,
          },
        ],
      });

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      // Initially the local item should not be merged in All tab
      expect(screen.queryByText('Bon Iver')).not.toBeInTheDocument();

      // Toggle include monitored checkbox
      const toggle = screen.getByRole('checkbox');
      await user.click(toggle);

      // Now the local item should appear in the list (as artist name)
      await waitFor(
        () => {
          expect(screen.getByText('Bon Iver')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('hides monitored items when toggle is unchecked', async () => {
      const uniqueLocalItems: LocalWantItem[] = [
        {
          id: 'local-hide',
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
      mockGetLocalWantList.mockResolvedValue(uniqueLocalItems);
      // Return results matching all albums so they get cached
      mockGetAlbumPlayCounts.mockResolvedValue({
        results: [
          {
            artist: 'Radiohead',
            title: 'OK Computer',
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
          },
          {
            artist: 'The Beatles',
            title: 'Abbey Road',
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
          },
          {
            artist: 'Bon Iver',
            title: 'For Emma, Forever Ago',
            playCount: 15,
            lastPlayed: null,
            matchType: 'exact' as const,
          },
        ],
      });

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      const toggle = screen.getByRole('checkbox');

      // Check the toggle
      await user.click(toggle);
      await waitFor(
        () => {
          expect(screen.getByText('Bon Iver')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Uncheck the toggle
      await user.click(toggle);
      await waitFor(() => {
        expect(screen.queryByText('Bon Iver')).not.toBeInTheDocument();
      });
    });
  });

  describe('Deduplication', () => {
    it('does not duplicate items that are in both wishlist and monitored list', async () => {
      // Create a local item that matches an existing wishlist item
      const duplicateLocalItems: LocalWantItem[] = [
        {
          id: 'local-dup',
          artist: 'Radiohead',
          album: 'OK Computer',
          playCount: 20,
          lastPlayed: Date.now(),
          addedAt: Date.now(),
          source: 'discovery',
          vinylStatus: 'unknown',
          notified: false,
        },
      ];

      mockGetLocalWantList.mockResolvedValue(duplicateLocalItems);
      // Return results matching all albums so they get cached and avoid re-fetch loop
      mockGetAlbumPlayCounts.mockResolvedValue({
        results: [
          {
            artist: 'Radiohead',
            title: 'OK Computer',
            playCount: 20,
            lastPlayed: null,
            matchType: 'exact' as const,
          },
          {
            artist: 'The Beatles',
            title: 'Abbey Road',
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
          },
        ],
      });

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      // Turn on the monitored toggle
      const toggle = screen.getByRole('checkbox');
      await user.click(toggle);

      // Should only show one instance of OK Computer, not two
      await waitFor(() => {
        const okComputerElements = screen.getAllByText('OK Computer');
        expect(okComputerElements).toHaveLength(1);
      });
    });

    it('deduplicates case-insensitively', async () => {
      const caseVariantItems: LocalWantItem[] = [
        {
          id: 'local-case',
          artist: 'radiohead',
          album: 'ok computer',
          playCount: 5,
          lastPlayed: Date.now(),
          addedAt: Date.now(),
          source: 'discovery',
          vinylStatus: 'unknown',
          notified: false,
        },
      ];

      mockGetLocalWantList.mockResolvedValue(caseVariantItems);
      // Return results matching all albums so they get cached
      mockGetAlbumPlayCounts.mockResolvedValue({
        results: [
          {
            artist: 'Radiohead',
            title: 'OK Computer',
            playCount: 5,
            lastPlayed: null,
            matchType: 'exact' as const,
          },
          {
            artist: 'The Beatles',
            title: 'Abbey Road',
            playCount: 0,
            lastPlayed: null,
            matchType: 'none' as const,
          },
        ],
      });

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      const toggle = screen.getByRole('checkbox');
      await user.click(toggle);

      // Should still only show one instance (discogs version with proper casing)
      await waitFor(() => {
        const okComputerElements = screen.getAllByText('OK Computer');
        expect(okComputerElements).toHaveLength(1);
      });
    });
  });

  describe('Naming Conventions', () => {
    it('shows "Monitoring" tab label (not "Wanted")', async () => {
      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText(/Monitoring \(/)).toBeInTheDocument();
      });

      // Ensure the old "Wanted" naming is not present
      const allButtons = screen.getAllByRole('button');
      const wantedTab = allButtons.find(btn =>
        /Wanted/.test(btn.textContent || '')
      );
      expect(wantedTab).toBeUndefined();
    });

    it('shows correct empty state text for monitoring tab', async () => {
      mockGetLocalWantList.mockResolvedValue([]);

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText(/Monitoring \(0\)/)).toBeInTheDocument();
      });

      const monitoringTab = screen.getByText(/Monitoring \(0\)/);
      await user.click(monitoringTab);

      await waitFor(() => {
        expect(
          screen.getByText(/No albums being monitored/)
        ).toBeInTheDocument();
      });
      expect(
        screen.getByText(/Use Discovery to find albums/)
      ).toBeInTheDocument();
    });

    it('shows correct empty state text when wishlist is empty', async () => {
      mockGetWishlist.mockResolvedValue([]);
      mockGetLocalWantList.mockResolvedValue([]);

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText(/Your wishlist is empty/)).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Sync to load items from Discogs/)
      ).toBeInTheDocument();
    });
  });

  describe('Play Count Display', () => {
    it('displays play count badge on cards when play count > 0', async () => {
      const playCountResults: AlbumPlayCountResult[] = [
        {
          artist: 'Radiohead',
          title: 'OK Computer',
          playCount: 42,
          lastPlayed: 1700000000,
          matchType: 'exact',
        },
        {
          artist: 'The Beatles',
          title: 'Abbey Road',
          playCount: 0,
          lastPlayed: null,
          matchType: 'none',
        },
      ];

      mockGetAlbumPlayCounts.mockResolvedValue({ results: playCountResults });

      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      // The WishlistItemCard receives playCount prop and renders the badge
      // We check for the play count badge element
      await waitFor(() => {
        const playBadges = document.querySelectorAll('.album-play-count-badge');
        // At least Radiohead's card should have a play count badge
        expect(playBadges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('fetches play counts for all wishlist items on load', async () => {
      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      expect(mockGetAlbumPlayCounts).toHaveBeenCalled();
      const callArgs = mockGetAlbumPlayCounts.mock.calls[0][0];
      expect(callArgs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artist: 'Radiohead',
            title: 'OK Computer',
          }),
          expect.objectContaining({
            artist: 'The Beatles',
            title: 'Abbey Road',
          }),
        ])
      );
    });

    it('displays play count on monitoring tab cards when play count > 0', async () => {
      renderWishlistPage();

      await waitFor(() => {
        expect(screen.getByText('Radiohead')).toBeInTheDocument();
      });

      const monitoringTab = screen.getByText(/Monitoring \(/);
      await user.click(monitoringTab);

      await waitFor(() => {
        expect(screen.getByText('Bon Iver')).toBeInTheDocument();
      });

      // The mock local item has playCount: 15
      expect(screen.getByText('15 plays')).toBeInTheDocument();
    });
  });
});
