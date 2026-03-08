import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { CollectionROIChart } from '../../../../src/renderer/components/stats/CollectionROIChart';
import { statsApi } from '../../../../src/renderer/services/statsApi';
import { RoiScoreItem } from '../../../../src/shared/types';

// Mock the statsApi
jest.mock('../../../../src/renderer/services/statsApi');
const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;

// IntersectionObserver is mocked globally in setupReact.ts as a no-op.
// Override it here to immediately fire the callback so lazy loading triggers.
type IOCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void;
let intersectionCallback: IOCallback;
const mockObserve = jest.fn((element: Element) => {
  // Immediately call the callback with isIntersecting=true
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

const mockRoiData: RoiScoreItem[] = [
  {
    artist: 'Radiohead',
    album: 'OK Computer',
    playCount: 200,
    medianPrice: 25.0,
    currency: 'USD',
    roiScore: 8.0,
    releaseId: 1,
    coverUrl: undefined,
  },
  {
    artist: 'Boards of Canada',
    album: 'Music Has the Right to Children',
    playCount: 150,
    medianPrice: 50.0,
    currency: 'USD',
    roiScore: 3.0,
    releaseId: 2,
    coverUrl: undefined,
  },
  {
    artist: 'Aphex Twin',
    album: 'Selected Ambient Works Volume II',
    playCount: 10,
    medianPrice: 80.0,
    currency: 'USD',
    roiScore: 0.125,
    releaseId: 3,
    coverUrl: undefined,
  },
];

describe('CollectionROIChart', () => {
  describe('Loading state', () => {
    it('should show skeleton while data is loading', () => {
      // Arrange — slow mock
      mockedStatsApi.getCollectionROI.mockImplementation(
        () => new Promise(() => {})
      );

      // Act
      render(<CollectionROIChart />);

      // Assert
      expect(screen.getByLabelText('Loading ROI data')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no data returned', async () => {
      // Arrange
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: [],
      });

      // Act
      render(<CollectionROIChart />);

      // Assert
      await screen.findByText('No collection value data available');
      expect(
        screen.getByText(
          'Run a value scan from Collection Analytics to see ROI scores.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('Data state', () => {
    it('should render header and tabs after data loads', async () => {
      // Arrange
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: mockRoiData,
      });

      // Act
      render(<CollectionROIChart />);

      // Assert
      await screen.findByText('Collection ROI');
      expect(screen.getByText('Best Value')).toBeInTheDocument();
      expect(screen.getByText('Worst Value')).toBeInTheDocument();
    });

    it('should show best value items by default (highest ROI first)', async () => {
      // Arrange
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: mockRoiData,
      });

      // Act
      render(<CollectionROIChart />);

      // Assert
      await screen.findByText('OK Computer');
      // Radiohead has highest ROI so should be rank #1
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('OK Computer');
    });

    it('should switch to worst value tab and show lowest ROI first', async () => {
      // Arrange
      const user = userEvent.setup();
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: mockRoiData,
      });

      // Act
      render(<CollectionROIChart />);
      await screen.findByText('OK Computer');
      await user.click(screen.getByRole('tab', { name: /worst value/i }));

      // Assert — Aphex Twin has lowest ROI score
      const items = screen.getAllByRole('listitem');
      expect(items[0]).toHaveTextContent('Selected Ambient Works Volume II');
    });

    it('should display play counts and prices in rows', async () => {
      // Arrange
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: mockRoiData,
      });

      // Act
      render(<CollectionROIChart />);

      // Assert
      await screen.findByText('200 plays');
      expect(screen.getByText('$25.00')).toBeInTheDocument();
    });

    it('should have accessibility aria-label on container', async () => {
      // Arrange
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: mockRoiData,
      });

      // Act
      render(<CollectionROIChart />);

      // Assert
      expect(
        screen.getByLabelText('Collection ROI leaderboard')
      ).toBeInTheDocument();
    });
  });

  describe('API call', () => {
    it('should call getCollectionROI with default limit', () => {
      // Arrange
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: [],
      });

      // Act
      render(<CollectionROIChart />);

      // Assert
      expect(mockedStatsApi.getCollectionROI).toHaveBeenCalledWith(20);
    });

    it('should pass custom limit to getCollectionROI', () => {
      // Arrange
      mockedStatsApi.getCollectionROI.mockResolvedValue({
        success: true,
        data: [],
      });

      // Act
      render(<CollectionROIChart limit={10} />);

      // Assert
      expect(mockedStatsApi.getCollectionROI).toHaveBeenCalledWith(10);
    });
  });
});
