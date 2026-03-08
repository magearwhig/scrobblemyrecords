import { render, screen } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { AlbumListeningArc } from '../../../../src/renderer/components/stats/AlbumListeningArc';
import { statsApi } from '../../../../src/renderer/services/statsApi';
import { AlbumArcBucket } from '../../../../src/shared/types';

// Mock the statsApi
jest.mock('../../../../src/renderer/services/statsApi');
const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='responsive-container'>{children}</div>
  ),
  AreaChart: ({
    children,
    data,
  }: {
    children?: React.ReactNode;
    data?: unknown[];
  }) => (
    <div data-testid='area-chart' data-points={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: () => <div data-testid='area' />,
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  CartesianGrid: () => <div data-testid='cartesian-grid' />,
  Tooltip: () => <div data-testid='tooltip' />,
}));

const mockArcData: AlbumArcBucket[] = [
  { period: '2022-01', playCount: 5, trackCount: 3 },
  { period: '2022-02', playCount: 12, trackCount: 5 },
  { period: '2022-03', playCount: 8, trackCount: 4 },
  { period: '2022-06', playCount: 2, trackCount: 2 },
];

describe('AlbumListeningArc', () => {
  const defaultProps = {
    artist: 'Radiohead',
    album: 'OK Computer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading state', () => {
    it('should show skeleton while data is loading', () => {
      // Arrange — never-resolving promise keeps loading state active
      mockedStatsApi.getAlbumListeningArc.mockImplementation(
        () => new Promise(() => {})
      );

      // Act
      render(<AlbumListeningArc {...defaultProps} />);

      // Assert — skeleton renders with the label
      expect(screen.getByText('Listening Arc')).toBeInTheDocument();
      // The chart should NOT be in the DOM during loading
      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('should show empty state when no arc data returned', async () => {
      // Arrange
      mockedStatsApi.getAlbumListeningArc.mockResolvedValue({
        success: true,
        data: [],
      });

      // Act
      render(<AlbumListeningArc {...defaultProps} />);

      // Assert
      await screen.findByText('No play history found');
      expect(
        screen.getByText('Scrobble this album to see your listening arc.')
      ).toBeInTheDocument();
      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    });
  });

  describe('Data state', () => {
    it('should render the chart when data is loaded', async () => {
      // Arrange
      mockedStatsApi.getAlbumListeningArc.mockResolvedValue({
        success: true,
        data: mockArcData,
      });

      // Act
      render(<AlbumListeningArc {...defaultProps} />);

      // Assert
      await screen.findByTestId('area-chart');
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('should display the total play count', async () => {
      // Arrange
      mockedStatsApi.getAlbumListeningArc.mockResolvedValue({
        success: true,
        data: mockArcData,
      });

      // Act
      render(<AlbumListeningArc {...defaultProps} />);

      // Assert — total plays = 5+12+8+2 = 27
      await screen.findByText('27 total plays');
    });

    it('should have accessibility aria-label on container', async () => {
      // Arrange
      mockedStatsApi.getAlbumListeningArc.mockResolvedValue({
        success: true,
        data: mockArcData,
      });

      // Act
      render(<AlbumListeningArc {...defaultProps} />);

      // Assert
      await screen.findByLabelText('Album listening arc chart');
    });

    it('should pass arc data to chart', async () => {
      // Arrange
      mockedStatsApi.getAlbumListeningArc.mockResolvedValue({
        success: true,
        data: mockArcData,
      });

      // Act
      render(<AlbumListeningArc {...defaultProps} />);

      // Assert
      const chart = await screen.findByTestId('area-chart');
      const dataAttr = chart.getAttribute('data-points');
      expect(dataAttr).not.toBeNull();
      const parsed = JSON.parse(dataAttr!);
      expect(parsed).toHaveLength(4);
      expect(parsed[0].period).toBe('2022-01');
      expect(parsed[1].playCount).toBe(12);
    });
  });

  describe('API call', () => {
    it('should call getAlbumListeningArc with correct artist and album', () => {
      // Arrange
      mockedStatsApi.getAlbumListeningArc.mockResolvedValue({
        success: true,
        data: mockArcData,
      });

      // Act
      render(<AlbumListeningArc artist='Radiohead' album='OK Computer' />);

      // Assert
      expect(mockedStatsApi.getAlbumListeningArc).toHaveBeenCalledWith(
        'Radiohead',
        'OK Computer'
      );
    });

    it('should re-fetch when artist or album prop changes', async () => {
      // Arrange
      mockedStatsApi.getAlbumListeningArc.mockResolvedValue({
        success: true,
        data: mockArcData,
      });

      // Act
      const { rerender } = render(
        <AlbumListeningArc artist='Radiohead' album='OK Computer' />
      );
      await screen.findByTestId('area-chart');

      rerender(
        <AlbumListeningArc
          artist='Boards of Canada'
          album='Music Has the Right to Children'
        />
      );

      // Assert
      expect(mockedStatsApi.getAlbumListeningArc).toHaveBeenCalledTimes(2);
      expect(mockedStatsApi.getAlbumListeningArc).toHaveBeenLastCalledWith(
        'Boards of Canada',
        'Music Has the Right to Children'
      );
    });
  });
});
