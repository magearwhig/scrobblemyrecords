import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { TasteDriftChart } from '../../../../src/renderer/components/stats/TasteDriftChart';
import { statsApi } from '../../../../src/renderer/services/statsApi';
import { TasteDriftResult } from '../../../../src/shared/types';

// Mock the statsApi
jest.mock('../../../../src/renderer/services/statsApi');
const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  LineChart: ({
    children,
    data,
  }: {
    children?: React.ReactNode;
    data?: unknown[];
  }) => (
    <div data-testid='line-chart' data-points={JSON.stringify(data?.length)}>
      {children}
    </div>
  ),
  Line: ({ dataKey }: { dataKey: string }) => (
    <div data-testid={`line-${dataKey}`} />
  ),
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  CartesianGrid: () => <div data-testid='cartesian-grid' />,
  Tooltip: () => <div data-testid='tooltip' />,
  Legend: () => <div data-testid='legend' />,
}));

// IntersectionObserver is mocked in setupReact.ts as a no-op.
// Override here to immediately trigger the callback so lazy loading fires.
type IOCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void;
let intersectionCallback: IOCallback;
const mockObserve = jest.fn((element: Element) => {
  intersectionCallback(
    [
      {
        isIntersecting: true,
        target: element,
      } as unknown as IntersectionObserverEntry,
    ],
    {} as IntersectionObserver
  );
});
const mockDisconnect = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  global.IntersectionObserver = jest.fn((cb: IOCallback) => {
    intersectionCallback = cb;
    return {
      observe: mockObserve,
      disconnect: mockDisconnect,
      unobserve: jest.fn(),
      root: null,
      rootMargin: '',
      thresholds: [],
      takeRecords: () => [],
    } as unknown as IntersectionObserver;
  }) as unknown as typeof IntersectionObserver;
});

const mockTasteDriftResult: TasteDriftResult = {
  snapshots: [
    {
      period: '2022-Q1',
      genres: [
        { name: 'rock', weight: 0.4, playCount: 100 },
        { name: 'electronic', weight: 0.3, playCount: 75 },
        { name: 'indie', weight: 0.2, playCount: 50 },
        { name: 'jazz', weight: 0.1, playCount: 25 },
      ],
    },
    {
      period: '2022-Q2',
      genres: [
        { name: 'rock', weight: 0.35, playCount: 90 },
        { name: 'electronic', weight: 0.4, playCount: 100 },
        { name: 'indie', weight: 0.15, playCount: 40 },
        { name: 'jazz', weight: 0.1, playCount: 25 },
      ],
    },
    {
      period: '2022-Q3',
      genres: [
        { name: 'rock', weight: 0.3, playCount: 80 },
        { name: 'electronic', weight: 0.45, playCount: 110 },
        { name: 'indie', weight: 0.15, playCount: 40 },
        { name: 'jazz', weight: 0.1, playCount: 25 },
      ],
    },
  ],
  totalQuarters: 3,
  topGenresOverall: ['electronic', 'rock', 'indie', 'jazz'],
};

describe('TasteDriftChart', () => {
  describe('Loading state', () => {
    it('should show skeleton while data is loading', () => {
      // Arrange — never-resolving promise keeps loading active
      mockedStatsApi.getTasteDrift.mockImplementation(
        () => new Promise(() => {})
      );

      // Act
      render(<TasteDriftChart />);

      // Assert
      expect(screen.getByText('Taste Drift')).toBeInTheDocument();
      expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when not enough data', async () => {
      // Arrange — only one snapshot is not enough for a drift
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: true,
        data: {
          snapshots: [mockTasteDriftResult.snapshots[0]],
          totalQuarters: 1,
          topGenresOverall: ['rock'],
        },
      });

      // Act
      render(<TasteDriftChart />);

      // Assert
      await screen.findByText('Not enough listening history');
      expect(
        screen.getByText('Keep scrobbling to see your taste drift over time!')
      ).toBeInTheDocument();
    });

    it('should show empty state when no result returned', async () => {
      // Arrange
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: false,
      });

      // Act
      render(<TasteDriftChart />);

      // Assert
      await screen.findByText('Not enough listening history');
    });
  });

  describe('Data state', () => {
    it('should render chart header with title and description', async () => {
      // Arrange
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: true,
        data: mockTasteDriftResult,
      });

      // Act
      render(<TasteDriftChart />);

      // Assert
      await screen.findByText('Taste Drift');
      expect(
        screen.getByText(
          'How your genre preferences have shifted over time, by quarter.'
        )
      ).toBeInTheDocument();
    });

    it('should render a line for each top genre', async () => {
      // Arrange
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: true,
        data: mockTasteDriftResult,
      });

      // Act
      render(<TasteDriftChart />);

      // Assert — one Line per topGenresOverall entry
      await screen.findByTestId('line-electronic');
      expect(screen.getByTestId('line-rock')).toBeInTheDocument();
      expect(screen.getByTestId('line-indie')).toBeInTheDocument();
      expect(screen.getByTestId('line-jazz')).toBeInTheDocument();
    });

    it('should render the line chart with correct snapshot count', async () => {
      // Arrange
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: true,
        data: mockTasteDriftResult,
      });

      // Act
      render(<TasteDriftChart />);

      // Assert
      const chart = await screen.findByTestId('line-chart');
      expect(chart.getAttribute('data-points')).toBe('3');
    });

    it('should have accessibility aria-label on container', async () => {
      // Arrange
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: true,
        data: mockTasteDriftResult,
      });

      // Act
      render(<TasteDriftChart />);

      // Assert
      await screen.findByLabelText('Taste drift over time chart');
    });
  });

  describe('API call', () => {
    it('should call getTasteDrift on intersection', () => {
      // Arrange
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: true,
        data: mockTasteDriftResult,
      });

      // Act
      render(<TasteDriftChart />);

      // Assert
      expect(mockedStatsApi.getTasteDrift).toHaveBeenCalledTimes(1);
      expect(mockedStatsApi.getTasteDrift).toHaveBeenCalledWith();
    });

    it('should only call getTasteDrift once even if observer fires multiple times', () => {
      // Arrange
      mockedStatsApi.getTasteDrift.mockResolvedValue({
        success: true,
        data: mockTasteDriftResult,
      });
      const element = document.createElement('div');

      // Act
      render(<TasteDriftChart />);
      // Simulate a second intersection event
      if (intersectionCallback) {
        intersectionCallback(
          [
            {
              isIntersecting: true,
              target: element,
            } as unknown as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver
        );
      }

      // Assert
      expect(mockedStatsApi.getTasteDrift).toHaveBeenCalledTimes(1);
    });
  });
});
