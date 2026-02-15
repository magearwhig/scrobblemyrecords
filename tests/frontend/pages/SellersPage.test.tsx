import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { ToastProvider } from '../../../src/renderer/context/ToastContext';
import SellersPage from '../../../src/renderer/pages/SellersPage';
import { MonitoredSeller, SellerScanStatus } from '../../../src/shared/types';

// Mock API service
const mockGetSellers = jest.fn();
const mockGetSellerScanStatus = jest.fn();
const mockGetReleaseCacheStats = jest.fn();
const mockGetWishlist = jest.fn();
const mockGetLocalWantList = jest.fn();
const mockAddSeller = jest.fn();
const mockRemoveSeller = jest.fn();
const mockTriggerSellerScan = jest.fn();
const mockRefreshReleaseCache = jest.fn();
const mockGetSellerSettings = jest.fn();
const mockGetSellerMatches = jest.fn();
const mockMarkMatchAsNotified = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getSellers: mockGetSellers,
    getSellerScanStatus: mockGetSellerScanStatus,
    getReleaseCacheStats: mockGetReleaseCacheStats,
    getWishlist: mockGetWishlist,
    getLocalWantList: mockGetLocalWantList,
    addSeller: mockAddSeller,
    removeSeller: mockRemoveSeller,
    triggerSellerScan: mockTriggerSellerScan,
    refreshReleaseCache: mockRefreshReleaseCache,
    getSellerSettings: mockGetSellerSettings,
    getSellerMatches: mockGetSellerMatches,
    markMatchAsNotified: mockMarkMatchAsNotified,
  }),
}));

// Mock SellerCard component
jest.mock('../../../src/renderer/components/SellerCard', () => {
  return function MockSellerCard({
    seller,
    onRemove,
    removing,
  }: {
    seller: MonitoredSeller;
    formatRelativeTime: (t: number) => string;
    onRemove: (username: string) => void;
    removing: boolean;
  }) {
    return (
      <div data-testid={`seller-card-${seller.username}`}>
        <span>{seller.displayName}</span>
        <span>{seller.username}</span>
        <button onClick={() => onRemove(seller.username)} disabled={removing}>
          Remove
        </button>
      </div>
    );
  };
});

// Mock useNotifications hook
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
  createInfoNotification: jest.fn((title: string, message: string) => ({
    type: 'info',
    title,
    message,
  })),
}));

// Mock useConfirmModal hook
const mockConfirmAction = jest.fn();
jest.mock('../../../src/renderer/hooks/useConfirmModal', () => ({
  useConfirmModal: () => [mockConfirmAction, null],
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

jest.mock('../../../src/renderer/components/ui/ProgressBar', () => ({
  ProgressBar: ({
    value,
  }: {
    value: number;
    size?: string;
    animated?: boolean;
  }) => (
    <div data-testid='progress-bar' role='progressbar' aria-valuenow={value} />
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

const mockSellers: MonitoredSeller[] = [
  {
    username: 'vinylshop',
    displayName: 'Local Vinyl Shop',
    addedAt: Date.now() - 604800000,
    lastScanned: Date.now() - 86400000,
    inventorySize: 5000,
    matchCount: 3,
  },
  {
    username: 'recordstore',
    displayName: 'Downtown Records',
    addedAt: Date.now() - 1209600000,
    lastScanned: Date.now() - 172800000,
    inventorySize: 2000,
    matchCount: 1,
  },
];

const idleScanStatus: SellerScanStatus = {
  status: 'idle',
  sellersScanned: 0,
  totalSellers: 0,
  progress: 0,
  newMatches: 0,
};

const mockCacheStats = {
  totalReleases: 1500,
  totalMasters: 200,
  lastUpdated: Date.now() - 86400000,
  staleMasters: 10,
};

const renderSellersPage = () => {
  return render(
    <AppProvider>
      <ToastProvider>
        <SellersPage />
      </ToastProvider>
    </AppProvider>
  );
};

describe('SellersPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    mockGetSellers.mockResolvedValue(mockSellers);
    mockGetSellerScanStatus.mockResolvedValue(idleScanStatus);
    mockGetReleaseCacheStats.mockResolvedValue(mockCacheStats);
    mockGetWishlist.mockResolvedValue([{ id: 1 }]); // Non-empty wishlist
    mockGetLocalWantList.mockResolvedValue([]);
  });

  it('renders loading state initially', () => {
    renderSellersPage();

    expect(screen.getByText('Local Sellers')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('renders sellers after loading', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByTestId('seller-card-vinylshop')).toBeInTheDocument();
    });

    expect(screen.getByTestId('seller-card-recordstore')).toBeInTheDocument();
  });

  it('shows page title and description', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Local Sellers')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Track inventories of local record shops/)
      ).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    mockGetSellers.mockRejectedValue(new Error('Network error'));

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('retries loading when clicking Try Again', async () => {
    mockGetSellers.mockRejectedValueOnce(new Error('Network error'));
    mockGetSellers.mockResolvedValueOnce(mockSellers);

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Try Again'));

    await waitFor(() => {
      expect(screen.getByTestId('seller-card-vinylshop')).toBeInTheDocument();
    });
  });

  it('shows empty state when no sellers', async () => {
    mockGetSellers.mockResolvedValue([]);

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('No Sellers Added')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Add local record shops by their Discogs username/)
    ).toBeInTheDocument();
  });

  it('shows wishlist empty state when no wishlist items', async () => {
    mockGetWishlist.mockResolvedValue([]);
    mockGetLocalWantList.mockResolvedValue([]);

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Sync Wishlist First')).toBeInTheDocument();
    });
  });

  it('shows Add Seller button', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('+ Add Seller')).toBeInTheDocument();
    });
  });

  it('opens Add Seller modal when clicking + Add Seller', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('+ Add Seller')).toBeInTheDocument();
    });

    await user.click(screen.getByText('+ Add Seller'));

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByText('Add Local Seller')).toBeInTheDocument();
  });

  it('shows scan buttons', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Check for New')).toBeInTheDocument();
    });

    expect(screen.getByText('Full Inventory Refresh')).toBeInTheDocument();
  });

  it('shows cache stats card', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Release Matching Cache')).toBeInTheDocument();
    });

    expect(screen.getByText('200')).toBeInTheDocument(); // Masters
    expect(screen.getByText('1,500')).toBeInTheDocument(); // Releases
  });

  it('shows stale masters count when available', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    expect(screen.getByText('Stale (30+ days)')).toBeInTheDocument();
  });

  it('shows cache empty warning when cache has no masters', async () => {
    mockGetReleaseCacheStats.mockResolvedValue({
      ...mockCacheStats,
      totalMasters: 0,
      totalReleases: 0,
    });

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText(/Cache is empty/)).toBeInTheDocument();
    });
  });

  it('shows Build/Refresh Cache button', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Build/Refresh Cache')).toBeInTheDocument();
    });
  });

  it('shows scan progress when scanning', async () => {
    const scanningStatus: SellerScanStatus = {
      status: 'scanning',
      currentSeller: 'vinylshop',
      sellersScanned: 1,
      totalSellers: 2,
      currentPage: 3,
      totalPages: 10,
      progress: 30,
      newMatches: 0,
    };
    mockGetSellerScanStatus.mockResolvedValue(scanningStatus);

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText(/Scanning vinylshop/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
  });

  it('shows completed scan info', async () => {
    const completedStatus: SellerScanStatus = {
      status: 'completed',
      sellersScanned: 2,
      totalSellers: 2,
      progress: 100,
      newMatches: 3,
      lastScanTimestamp: Date.now() - 3600000,
    };
    mockGetSellerScanStatus.mockResolvedValue(completedStatus);

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText(/Last scan:/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Found 3 new matches/)).toBeInTheDocument();
  });

  it('shows scan error status', async () => {
    const errorStatus: SellerScanStatus = {
      status: 'error',
      sellersScanned: 1,
      totalSellers: 2,
      progress: 50,
      newMatches: 0,
      error: 'Rate limited by Discogs API',
    };
    mockGetSellerScanStatus.mockResolvedValue(errorStatus);

    renderSellersPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Scan error: Rate limited by Discogs API/)
      ).toBeInTheDocument();
    });
  });

  it('shows View All Matches button when sellers have matches', async () => {
    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('View All Matches')).toBeInTheDocument();
    });
  });

  it('triggers scan when clicking Check for New', async () => {
    mockTriggerSellerScan.mockResolvedValue(idleScanStatus);

    renderSellersPage();

    await waitFor(() => {
      expect(screen.getByText('Check for New')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Check for New'));

    expect(mockTriggerSellerScan).toHaveBeenCalledWith(false);
  });
});
