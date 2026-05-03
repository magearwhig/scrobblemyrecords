import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { ToastProvider } from '../../../src/renderer/context/ToastContext';
import WebsitesPage from '../../../src/renderer/pages/WebsitesPage';
import {
  MonitoredWebsite,
  WebsiteItem,
  WebsiteMonitoringSettings,
  WebsiteScanStatus,
} from '../../../src/shared/types';

// Mock API service — MUST include EVERY method WebsitesPage calls or render
// will fail silently with TypeError when calling an undefined function.
const mockGetWebsites = jest.fn();
const mockGetWebsiteItems = jest.fn();
const mockGetWebsiteScanStatus = jest.fn();
const mockGetWebsiteSettings = jest.fn();
const mockGetOllamaStatus = jest.fn();
const mockAddWebsite = jest.fn();
const mockUpdateWebsite = jest.fn();
const mockRemoveWebsite = jest.fn();
const mockPreviewWebsite = jest.fn();
const mockScanWebsites = jest.fn();
const mockScanSingleWebsite = jest.fn();
const mockCancelWebsiteScan = jest.fn();
const mockMarkWebsiteItemSeen = jest.fn();
const mockDismissWebsiteItem = jest.fn();
const mockUpdateWebsiteSettings = jest.fn();
const mockGetWebsiteSuggestions = jest.fn();
const mockGetWishlistArtistOptions = jest.fn();
const mockGetArtistWebsiteUrls = jest.fn();
const mockBulkMarkWebsiteItemsSeen = jest.fn();
const mockBulkDismissWebsiteItems = jest.fn();

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getWebsites: mockGetWebsites,
    getWebsiteItems: mockGetWebsiteItems,
    getWebsiteScanStatus: mockGetWebsiteScanStatus,
    getWebsiteSettings: mockGetWebsiteSettings,
    getOllamaStatus: mockGetOllamaStatus,
    addWebsite: mockAddWebsite,
    updateWebsite: mockUpdateWebsite,
    removeWebsite: mockRemoveWebsite,
    previewWebsite: mockPreviewWebsite,
    scanWebsites: mockScanWebsites,
    scanSingleWebsite: mockScanSingleWebsite,
    cancelWebsiteScan: mockCancelWebsiteScan,
    markWebsiteItemSeen: mockMarkWebsiteItemSeen,
    dismissWebsiteItem: mockDismissWebsiteItem,
    updateWebsiteSettings: mockUpdateWebsiteSettings,
    getWebsiteSuggestions: mockGetWebsiteSuggestions,
    getWishlistArtistOptions: mockGetWishlistArtistOptions,
    getArtistWebsiteUrls: mockGetArtistWebsiteUrls,
    bulkMarkWebsiteItemsSeen: mockBulkMarkWebsiteItemsSeen,
    bulkDismissWebsiteItems: mockBulkDismissWebsiteItems,
  }),
}));

const mockConfirmAction = jest.fn().mockResolvedValue(true);
jest.mock('../../../src/renderer/hooks/useConfirmModal', () => ({
  useConfirmModal: () => [mockConfirmAction, null],
}));

jest.mock('../../../src/renderer/components/ui/Modal', () => ({
  Modal: ({
    isOpen,
    children,
    title,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    title: string;
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
  ProgressBar: ({ value }: { value: number }) => (
    <div data-testid='progress-bar' role='progressbar' aria-valuenow={value} />
  ),
}));

jest.mock('../../../src/renderer/components/ui/Skeleton', () => ({
  ListItemSkeleton: ({ count }: { count: number }) => (
    <div data-testid='skeleton-loader'>Loading {count} items...</div>
  ),
}));

const buildWebsite = (
  partial: Partial<MonitoredWebsite> = {}
): MonitoredWebsite => ({
  id: 'w1',
  name: 'Indie Store',
  url: 'https://indie.example.com',
  useOllama: true,
  enabled: true,
  addedAt: Date.now(),
  ...partial,
});

const buildItem = (partial: Partial<WebsiteItem> = {}): WebsiteItem => ({
  id: 'item-1',
  websiteId: 'w1',
  title: 'Cool Album',
  artist: 'Cool Artist',
  price: 30,
  format: 'LP',
  extractedAt: Date.now(),
  confidence: 0.85,
  status: 'new',
  ...partial,
});

const idleStatus: WebsiteScanStatus = { status: 'idle' };

const settings: WebsiteMonitoringSettings = {
  schemaVersion: 1,
  ollamaModel: 'mistral',
  ollamaEnabled: true,
  fetchTimeoutMs: 15000,
  maxBytes: 500 * 1024,
};

const renderPage = () =>
  render(
    <AppProvider>
      <ToastProvider>
        <WebsitesPage />
      </ToastProvider>
    </AppProvider>
  );

describe('WebsitesPage', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    user = userEvent.setup();

    mockGetWebsites.mockResolvedValue([buildWebsite()]);
    mockGetWebsiteItems.mockResolvedValue([buildItem()]);
    mockGetWebsiteScanStatus.mockResolvedValue(idleStatus);
    mockGetWebsiteSettings.mockResolvedValue(settings);
    mockGetWebsiteSuggestions.mockResolvedValue([]);
    mockGetWishlistArtistOptions.mockResolvedValue([]);
    mockGetArtistWebsiteUrls.mockResolvedValue([]);
    mockBulkMarkWebsiteItemsSeen.mockResolvedValue({ updated: 0, missing: [] });
    mockBulkDismissWebsiteItems.mockResolvedValue({ updated: 0, missing: [] });
    mockGetOllamaStatus.mockResolvedValue({
      available: true,
      model: 'mistral',
    });
    mockAddWebsite.mockResolvedValue(buildWebsite({ id: 'w-new' }));
    mockUpdateWebsite.mockResolvedValue(buildWebsite());
    mockRemoveWebsite.mockResolvedValue(undefined);
    mockPreviewWebsite.mockResolvedValue({
      items: [buildItem()],
      ollamaAvailable: true,
    });
    mockScanWebsites.mockResolvedValue({
      ...idleStatus,
      status: 'scanning',
    });
    mockScanSingleWebsite.mockResolvedValue({
      ...idleStatus,
      status: 'scanning',
    });
    mockCancelWebsiteScan.mockResolvedValue({ cancelled: true });
    mockMarkWebsiteItemSeen.mockResolvedValue(undefined);
    mockDismissWebsiteItem.mockResolvedValue(undefined);
    mockUpdateWebsiteSettings.mockResolvedValue(settings);
  });

  it('renders skeleton while loading', () => {
    renderPage();
    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('loads and renders monitored websites', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Indie Store').length).toBeGreaterThan(0);
    });
    expect(mockGetWebsites).toHaveBeenCalled();
    expect(mockGetWebsiteItems).toHaveBeenCalled();
    expect(mockGetWebsiteScanStatus).toHaveBeenCalled();
    expect(mockGetWebsiteSettings).toHaveBeenCalled();
    expect(mockGetOllamaStatus).toHaveBeenCalled();
  });

  it('renders extracted items', async () => {
    renderPage();
    await waitFor(() => {
      expect(document.body.textContent || '').toContain('Cool Album');
    });
    expect(document.body.textContent || '').toContain('Cool Artist');
  });

  it('shows empty state when no websites monitored', async () => {
    mockGetWebsites.mockResolvedValue([]);
    mockGetWebsiteItems.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No websites monitored/i)).toBeInTheDocument();
    });
  });

  it('shows error state when API fails', async () => {
    mockGetWebsites.mockRejectedValue(new Error('Network down'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Network down/)).toBeInTheDocument();
    });
  });

  it('handles getOllamaStatus failure gracefully', async () => {
    mockGetOllamaStatus.mockRejectedValue(new Error('Ollama timeout'));
    renderPage();

    // Page must still render normally — ollama errors are caught in the
    // Promise.all chain and surfaced as an "available: false" status
    await waitFor(() => {
      expect(screen.getAllByText('Indie Store').length).toBeGreaterThan(0);
    });
  });

  it('shows ollama unavailable indicator', async () => {
    mockGetOllamaStatus.mockResolvedValue({
      available: false,
      error: 'Connection refused',
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Indie Store').length).toBeGreaterThan(0);
    });

    // Page should display some indicator that Ollama is unavailable
    expect(document.body.textContent || '').toMatch(/Ollama/i);
  });

  it('shows scan progress when scanning', async () => {
    const scanningStatus: WebsiteScanStatus = {
      status: 'scanning',
      currentWebsiteName: 'Indie Store',
      totalWebsites: 1,
      processedWebsites: 0,
      itemsFound: 0,
      ollamaAvailable: true,
    };
    mockGetWebsiteScanStatus.mockResolvedValue(scanningStatus);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('progress-bar')).toBeInTheDocument();
    });
  });

  it('shows error scan status with detail', async () => {
    const errorStatus: WebsiteScanStatus = {
      status: 'error',
      error: 'Page fetch timeout',
    };
    mockGetWebsiteScanStatus.mockResolvedValue(errorStatus);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Page fetch timeout/i)).toBeInTheDocument();
    });
  });

  it('opens add-website modal when clicking Add button', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getAllByText('Indie Store').length).toBeGreaterThan(0);
    });

    const buttons = screen.getAllByRole('button');
    const addBtn = buttons.find(b => /add website/i.test(b.textContent || ''));
    expect(addBtn).toBeDefined();
    await user.click(addBtn!);

    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('does not pollute API mock state across tests (regression: shared array bug)', async () => {
    const { unmount } = renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Indie Store').length).toBeGreaterThan(0);
    });
    unmount();

    // Fresh data — should not see prior data
    mockGetWebsites.mockResolvedValue([
      buildWebsite({ id: 'w-other', name: 'Different Site' }),
    ]);
    mockGetWebsiteItems.mockResolvedValue([]);
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Different Site').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Indie Store')).not.toBeInTheDocument();
  });
});
