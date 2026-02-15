import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import DiscardPilePage from '../../../src/renderer/pages/DiscardPilePage';
import {
  AuthStatus,
  DiscardPileItem,
  DiscardPileStats,
  DiscardReason,
  DiscardStatus,
} from '../../../src/shared/types';

// Mock API service
const mockGetDiscardPile = jest.fn();
const mockGetDiscardPileStats = jest.fn();
const mockRemoveFromDiscardPile = jest.fn();
const mockUpdateDiscardPileItem = jest.fn();
const mockMarkDiscardItemSold = jest.fn();
const mockMarkDiscardItemListed = jest.fn();
const mockMarkDiscardItemTradedIn = jest.fn();
const mockBulkMarkDiscardItemsTradedIn = jest.fn();
const mockRefreshDiscardPileValues = jest.fn();
const mockGetJobStatuses = jest.fn();
const mockGetMarketplaceStats = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getDiscardPile: mockGetDiscardPile,
    getDiscardPileStats: mockGetDiscardPileStats,
    removeFromDiscardPile: mockRemoveFromDiscardPile,
    updateDiscardPileItem: mockUpdateDiscardPileItem,
    markDiscardItemSold: mockMarkDiscardItemSold,
    markDiscardItemListed: mockMarkDiscardItemListed,
    markDiscardItemTradedIn: mockMarkDiscardItemTradedIn,
    bulkMarkDiscardItemsTradedIn: mockBulkMarkDiscardItemsTradedIn,
    refreshDiscardPileValues: mockRefreshDiscardPileValues,
    getJobStatuses: mockGetJobStatuses,
    getMarketplaceStats: mockGetMarketplaceStats,
  }),
}));

// Mock child components
jest.mock('../../../src/renderer/components/discard/DiscardFilterBar', () => {
  return function MockDiscardFilterBar({
    activeTab,
    onTabChange,
    sortBy,
    onSortChange,
    searchQuery,
    onSearchChange,
  }: {
    items: DiscardPileItem[];
    activeTab: string;
    onTabChange: (tab: string) => void;
    sortBy: string;
    onSortChange: (sort: string) => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
  }) {
    return (
      <div data-testid='filter-bar'>
        <button onClick={() => onTabChange('all')}>All</button>
        <button onClick={() => onTabChange('marked')}>Marked</button>
        <button onClick={() => onTabChange('listed')}>Listed</button>
        <button onClick={() => onTabChange('history')}>History</button>
        <button onClick={() => onTabChange('orphaned')}>Orphaned</button>
        <select
          data-testid='sort-select'
          value={sortBy}
          onChange={e => onSortChange(e.target.value)}
        >
          <option value='date'>Date</option>
          <option value='artist'>Artist</option>
        </select>
        <input
          data-testid='search-input'
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder='Search...'
        />
      </div>
    );
  };
});

jest.mock('../../../src/renderer/components/discard/DiscardItemCard', () => {
  return function MockDiscardItemCard({
    item,
    selectionMode,
    selected,
    onEdit,
    onSold,
    onListed,
    onTradedIn,
    onRemove,
    onToggleSelect,
  }: {
    item: DiscardPileItem;
    selected: boolean;
    selectionMode: boolean;
    onEdit: (item: DiscardPileItem) => void;
    onSold: (item: DiscardPileItem) => void;
    onListed: (item: DiscardPileItem) => void;
    onTradedIn: (item: DiscardPileItem) => void;
    onRemove: (item: DiscardPileItem) => void;
    onToggleSelect: (id: string) => void;
    formatCurrency: (v: number | undefined, c: string) => string;
    formatDate: (t: number) => string;
  }) {
    return (
      <div data-testid={`discard-item-${item.id}`}>
        <span>
          {item.artist} - {item.title}
        </span>
        <span>{item.status}</span>
        {selectionMode && (
          <input
            type='checkbox'
            checked={selected}
            onChange={() => onToggleSelect(item.id)}
          />
        )}
        <button onClick={() => onEdit(item)}>Edit</button>
        <button onClick={() => onSold(item)}>Sold</button>
        <button onClick={() => onListed(item)}>Listed</button>
        <button onClick={() => onTradedIn(item)}>Traded In</button>
        <button onClick={() => onRemove(item)}>Remove</button>
      </div>
    );
  };
});

jest.mock('../../../src/renderer/components/discard/DiscardStatsBar', () => {
  return function MockDiscardStatsBar({
    stats,
  }: {
    stats: DiscardPileStats;
    filteredItems: DiscardPileItem[];
    formatCurrency: (v: number | undefined, c: string) => string;
  }) {
    return (
      <div data-testid='stats-bar'>
        <span>Total: {stats.totalItems}</span>
      </div>
    );
  };
});

jest.mock(
  '../../../src/renderer/components/discard/DiscardTradedInModal',
  () => {
    return function MockDiscardTradedInModal({
      isOpen,
      items,
      onConfirm,
      onClose,
    }: {
      isOpen: boolean;
      items: DiscardPileItem[];
      onConfirm: () => void;
      onClose: () => void;
    }) {
      return isOpen ? (
        <div data-testid='traded-in-modal'>
          <span>{items.length} items to trade in</span>
          <button onClick={onConfirm}>Confirm Trade In</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      ) : null;
    };
  }
);

// Mock useNotifications
const mockAddNotification = jest.fn();
jest.mock('../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({
    addNotification: mockAddNotification,
    notifications: [],
    unreadCount: 0,
  }),
  createSuccessNotification: jest.fn((title: string, message: string) => ({
    type: 'success',
    title,
    message,
  })),
}));

// Mock useDiscardPileSelection
jest.mock('../../../src/renderer/hooks/useDiscardPileSelection', () => ({
  useDiscardPileSelection: () => ({
    selectedIds: new Set<string>(),
    selectionMode: false,
    toggleSelectionMode: jest.fn(),
    toggleSelect: jest.fn(),
    clearSelection: jest.fn(),
    selectedItems: jest.fn(() => []),
  }),
}));

// Mock UI components
jest.mock('../../../src/renderer/components/ui', () => ({
  Modal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
    onClose: () => void;
    size?: string;
  }) =>
    isOpen ? (
      <div data-testid='modal'>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='modal-footer'>{children}</div>
  ),
}));

jest.mock('../../../src/renderer/components/ui/Skeleton', () => ({
  ListItemSkeleton: ({ count }: { count: number }) => (
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

const createDiscardItem = (
  overrides: Partial<DiscardPileItem> = {}
): DiscardPileItem => ({
  id: 'item-1',
  collectionItemId: 12345,
  releaseId: 67890,
  artist: 'Radiohead',
  title: 'OK Computer',
  coverImage: 'https://example.com/cover.jpg',
  format: ['Vinyl', 'LP'],
  year: 1997,
  reason: 'selling' as DiscardReason,
  addedAt: Date.now() - 86400000,
  status: 'marked' as DiscardStatus,
  statusChangedAt: Date.now() - 86400000,
  estimatedValue: 25.0,
  currency: 'USD',
  orphaned: false,
  ...overrides,
});

const mockItems: DiscardPileItem[] = [
  createDiscardItem({
    id: 'item-1',
    artist: 'Radiohead',
    title: 'OK Computer',
  }),
  createDiscardItem({
    id: 'item-2',
    artist: 'The Beatles',
    title: 'Abbey Road',
    status: 'listed',
    marketplaceUrl: 'https://discogs.com/sell/item/123',
  }),
  createDiscardItem({
    id: 'item-3',
    artist: 'Pink Floyd',
    title: 'The Wall',
    status: 'sold',
    actualSalePrice: 30.0,
  }),
];

const mockStats: DiscardPileStats = {
  totalItems: 3,
  byStatus: {
    marked: 1,
    listed: 1,
    sold: 1,
    gifted: 0,
    removed: 0,
    traded_in: 0,
  },
  byReason: {
    selling: 3,
    duplicate: 0,
    damaged: 0,
    upgrade: 0,
    not_listening: 0,
    gift: 0,
    other: 0,
  },
  totalEstimatedValue: 75.0,
  totalActualSales: 30.0,
  currency: 'USD',
};

const defaultAuthStatus: AuthStatus = {
  discogs: { authenticated: true, username: 'testuser' },
  lastfm: { authenticated: true, username: 'testuser' },
};

const unauthenticatedStatus: AuthStatus = {
  discogs: { authenticated: false },
  lastfm: { authenticated: false },
};

const renderDiscardPilePage = (authStatus: AuthStatus = defaultAuthStatus) => {
  return render(
    <AppProvider>
      <AuthProvider value={{ authStatus, setAuthStatus: jest.fn() }}>
        <DiscardPilePage />
      </AuthProvider>
    </AppProvider>
  );
};

describe('DiscardPilePage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    mockGetDiscardPile.mockResolvedValue(mockItems);
    mockGetDiscardPileStats.mockResolvedValue(mockStats);
  });

  it('renders page title', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByText('Discard Pile')).toBeInTheDocument();
    });
  });

  it('renders loading state initially', () => {
    renderDiscardPilePage();

    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('renders items after loading', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByTestId('discard-item-item-1')).toBeInTheDocument();
    });

    // By default "all" tab shows non-terminal items (not sold/gifted/removed/traded_in)
    expect(screen.getByTestId('discard-item-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('discard-item-item-2')).toBeInTheDocument();
    // Sold items are history, excluded from "all" tab
    expect(screen.queryByTestId('discard-item-item-3')).not.toBeInTheDocument();
  });

  it('shows unauthenticated state when not connected', () => {
    renderDiscardPilePage(unauthenticatedStatus);

    expect(
      screen.getByText(/Please connect your Discogs account/)
    ).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    mockGetDiscardPile.mockRejectedValue(
      new Error('Failed to load discard pile data')
    );

    renderDiscardPilePage();

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load discard pile data')
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('retries loading when clicking Retry', async () => {
    mockGetDiscardPile.mockRejectedValueOnce(new Error('Network error'));
    mockGetDiscardPile.mockResolvedValueOnce(mockItems);

    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('discard-item-item-1')).toBeInTheDocument();
    });
  });

  it('shows stats bar when stats are loaded', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByTestId('stats-bar')).toBeInTheDocument();
    });

    expect(screen.getByText('Total: 3')).toBeInTheDocument();
  });

  it('shows page description', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(
        screen.getByText(/Track records you want to sell, gift, or remove/)
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when no items match current tab', async () => {
    mockGetDiscardPile.mockResolvedValue([]);

    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByText(/No active items/)).toBeInTheDocument();
    });
  });

  it('shows Refresh Marketplace Values button', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(
        screen.getByText('Refresh Marketplace Values')
      ).toBeInTheDocument();
    });
  });

  it('shows Select Items button', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByText('Select Items')).toBeInTheDocument();
    });
  });

  it('shows filter bar', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    });
  });

  it('filters to history tab to show sold items', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByTestId('filter-bar')).toBeInTheDocument();
    });

    await user.click(screen.getByText('History'));

    // After switching to History tab, only sold/gifted/removed/traded_in items show
    await waitFor(() => {
      expect(screen.getByTestId('discard-item-item-3')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('discard-item-item-1')).not.toBeInTheDocument();
  });

  it('has search input in filter bar', async () => {
    renderDiscardPilePage();

    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  it('renders Refresh Marketplace Values button with empty list', async () => {
    mockGetDiscardPile.mockResolvedValue([]);

    renderDiscardPilePage();

    await waitFor(() => {
      expect(
        screen.getByText('Refresh Marketplace Values')
      ).toBeInTheDocument();
    });
  });
});
