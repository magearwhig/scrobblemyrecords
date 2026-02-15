import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import ValueEstimationSection from '../../../../src/renderer/components/collection-analytics/ValueEstimationSection';
import { collectionAnalyticsApi } from '../../../../src/renderer/services/statsApi';
import {
  CollectionValueEstimation,
  ValueScanStatus,
} from '../../../../src/shared/types';

// Mock recharts (does not render in jsdom)
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='bar-chart'>{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

// Mock the stats API
jest.mock('../../../../src/renderer/services/statsApi', () => ({
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
jest.mock('../../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockApi = collectionAnalyticsApi as jest.Mocked<
  typeof collectionAnalyticsApi
>;

function createMockEstimation(
  overrides: Partial<CollectionValueEstimation> = {}
): CollectionValueEstimation {
  return {
    totalEstimatedValue: 2500.0,
    totalLowestValue: 1800.0,
    totalHighestValue: 3200.0,
    currency: 'USD',
    itemsWithPricing: 85,
    itemsWithoutPricing: 15,
    totalItems: 100,
    averageItemValue: 25.0,
    mostValuableItems: [
      {
        releaseId: 1,
        artist: 'Radiohead',
        title: 'Kid A',
        year: 2000,
        format: ['LP', 'Album'],
        coverImage: 'https://example.com/kida.jpg',
        estimatedValue: 150.0,
        lowestPrice: 100.0,
        highestPrice: 200.0,
        numForSale: 42,
        currency: 'USD',
      },
      {
        releaseId: 2,
        artist: 'Pink Floyd',
        title: 'Dark Side of the Moon',
        year: 1973,
        format: ['LP'],
        estimatedValue: 120.0,
        numForSale: 100,
        currency: 'USD',
      },
    ],
    leastValuableItems: [],
    valueByDecade: [
      { decade: '1970s', value: 500, count: 10 },
      { decade: '2000s', value: 800, count: 20 },
    ],
    valueByFormat: [
      { format: 'LP', value: 2000, count: 60 },
      { format: 'CD', value: 500, count: 40 },
    ],
    mixedCurrencies: false,
    ...overrides,
  };
}

function createIdleScanStatus(): ValueScanStatus {
  return {
    status: 'idle',
    itemsScanned: 0,
    totalItems: 0,
    progress: 0,
  };
}

function createScanningScanStatus(): ValueScanStatus {
  return {
    status: 'scanning',
    itemsScanned: 25,
    totalItems: 100,
    progress: 25,
    currentItem: 'Radiohead - Kid A',
  };
}

describe('ValueEstimationSection', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows loading text initially', () => {
    // Arrange: getValue never resolves
    mockApi.getValue.mockReturnValue(new Promise(() => {}));

    // Act
    render(<ValueEstimationSection />);

    // Assert
    expect(screen.getByText('Loading value data...')).toBeInTheDocument();
  });

  it('shows scan button when no estimation exists', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: null,
        scanStatus: createIdleScanStatus(),
        lastScanTimestamp: null,
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Scan Collection Value' })
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Collection Value Estimation')).toBeInTheDocument();
    expect(
      screen.getByText(/Scan your collection to estimate its market value/)
    ).toBeInTheDocument();
  });

  it('shows value cards when estimation exists', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation(),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert: value summary cards are shown
    await waitFor(() => {
      expect(screen.getByText('Estimated Value (VG+)')).toBeInTheDocument();
    });
    expect(screen.getByText('Low Estimate')).toBeInTheDocument();
    expect(screen.getByText('High Estimate')).toBeInTheDocument();
    expect(screen.getByText('Items Priced')).toBeInTheDocument();

    // Check formatted currency values
    expect(screen.getByText('$2,500.00')).toBeInTheDocument();
    expect(screen.getByText('$1,800.00')).toBeInTheDocument();
    expect(screen.getByText('$3,200.00')).toBeInTheDocument();
  });

  it('shows items priced count with total', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation(),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Items Priced')).toBeInTheDocument();
    });
    // 85 / 100
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText(/\/ 100/)).toBeInTheDocument();
  });

  it('shows most valuable items list', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation(),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Most Valuable Items')).toBeInTheDocument();
    });
    expect(screen.getByText('Kid A')).toBeInTheDocument();
    expect(screen.getByText('Radiohead')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('Dark Side of the Moon')).toBeInTheDocument();
    expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
  });

  it('shows items without pricing message', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation({ itemsWithoutPricing: 15 }),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText('15 items could not be priced')
      ).toBeInTheDocument();
    });
  });

  it('shows all items priced message when none are missing', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation({ itemsWithoutPricing: 0 }),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText('All items have pricing data')
      ).toBeInTheDocument();
    });
  });

  it('shows mixed currencies note when applicable', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation({ mixedCurrencies: true }),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/mixed currencies detected/)).toBeInTheDocument();
    });
  });

  it('starts scan when button is clicked', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: null,
        scanStatus: createIdleScanStatus(),
        lastScanTimestamp: null,
        cacheAge: 0,
      },
    });
    mockApi.startValueScan.mockResolvedValue({
      success: true,
      data: { message: 'Scan started' },
    });
    mockApi.getValueScanStatus.mockResolvedValue({
      success: true,
      data: createScanningScanStatus(),
    });

    // Act
    render(<ValueEstimationSection />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Scan Collection Value' })
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: 'Scan Collection Value' })
    );

    // Assert
    expect(mockApi.startValueScan).toHaveBeenCalledTimes(1);
  });

  it('shows progress bar during scan when no estimation', async () => {
    // Arrange: getValue returns scanning status
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: null,
        scanStatus: createScanningScanStatus(),
        lastScanTimestamp: null,
        cacheAge: 0,
      },
    });
    // Prevent poll from ending
    mockApi.getValueScanStatus.mockResolvedValue({
      success: true,
      data: createScanningScanStatus(),
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert: progress text is visible
    await waitFor(() => {
      expect(
        screen.getByText(/Scanning: Radiohead - Kid A/)
      ).toBeInTheDocument();
    });

    // ProgressBar is rendered (via role)
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows rescan button when estimation exists', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation(),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Rescan Values' })
      ).toBeInTheDocument();
    });
  });

  it('renders value by decade and format chart sections', async () => {
    // Arrange
    mockApi.getValue.mockResolvedValue({
      success: true,
      data: {
        estimation: createMockEstimation(),
        scanStatus: { ...createIdleScanStatus(), status: 'completed' as const },
        lastScanTimestamp: Date.now(),
        cacheAge: 0,
      },
    });

    // Act
    render(<ValueEstimationSection />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Value by Decade')).toBeInTheDocument();
    });
    expect(screen.getByText('Value by Format')).toBeInTheDocument();

    const barCharts = screen.getAllByTestId('bar-chart');
    expect(barCharts.length).toBeGreaterThanOrEqual(2);
  });

  it('handles API error gracefully on initial load', async () => {
    // Arrange: getValue throws
    mockApi.getValue.mockRejectedValue(new Error('Network error'));

    // Act
    render(<ValueEstimationSection />);

    // Assert: falls through to no-estimation state showing the scan button
    await waitFor(() => {
      expect(
        screen.getByText('Collection Value Estimation')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: 'Scan Collection Value' })
    ).toBeInTheDocument();
  });
});
