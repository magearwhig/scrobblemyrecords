import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { RankingsOverTime } from '../../../../src/renderer/components/stats/RankingsOverTime';
import { statsApi } from '../../../../src/renderer/services/statsApi';

// Mock the statsApi
jest.mock('../../../../src/renderer/services/statsApi');

const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;

describe('RankingsOverTime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRankingsData = {
    snapshots: [
      {
        period: '2024-01',
        timestamp: 1704067200000,
        rankings: [
          { name: 'Artist 1', count: 10, rank: 1 },
          { name: 'Artist 2', count: 5, rank: 2 },
        ],
      },
      {
        period: '2024-02',
        timestamp: 1706745600000,
        rankings: [
          { name: 'Artist 2', count: 12, rank: 1 },
          { name: 'Artist 1', count: 11, rank: 2 },
        ],
      },
    ],
    type: 'artists' as const,
    topN: 10,
  };

  describe('Initial render', () => {
    it('should render the component with title', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      expect(screen.getByText('Rankings Over Time')).toBeInTheDocument();
      expect(
        screen.getByText(/Watch how your top.*have evolved over time/i)
      ).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      mockedStatsApi.getRankingsOverTime.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () => resolve({ success: true, data: mockRankingsData }),
              100
            )
          )
      );

      render(<RankingsOverTime />);

      expect(screen.getByText('Loading rankings data...')).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('should render all tab buttons', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      expect(screen.getByText('Top Artists')).toBeInTheDocument();
      expect(screen.getByText('Top Albums')).toBeInTheDocument();
      expect(screen.getByText('Top Tracks')).toBeInTheDocument();
    });

    it('should highlight active tab', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      await waitFor(() => {
        const artistsTab = screen.getByText('Top Artists');
        expect(artistsTab).toHaveClass('rankings-tab-active');
      });
    });

    it('should switch tabs when clicked', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      const albumsTab = screen.getByText('Top Albums');
      fireEvent.click(albumsTab);

      await waitFor(() => {
        expect(mockedStatsApi.getRankingsOverTime).toHaveBeenCalledWith(
          'albums',
          expect.any(Number),
          expect.any(Number),
          expect.any(Number)
        );
      });
    });
  });

  describe('Controls', () => {
    it('should render time period selector', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      expect(screen.getByText('Time period:')).toBeInTheDocument();
      expect(screen.getByText('Last year')).toBeInTheDocument();
    });

    it('should render topN selector', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      expect(screen.getByText('Show top:')).toBeInTheDocument();
      const select = screen.getByLabelText('Show top:');
      expect(select).toHaveTextContent('10');
    });

    it('should fetch new data when time range changes', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      await waitFor(() => {
        expect(mockedStatsApi.getRankingsOverTime).toHaveBeenCalledTimes(1);
      });

      const timeRangeSelect = screen.getByLabelText('Time period:');
      fireEvent.change(timeRangeSelect, { target: { value: 'all' } });

      await waitFor(() => {
        expect(mockedStatsApi.getRankingsOverTime).toHaveBeenCalledTimes(2);
      });
    });

    it('should fetch new data when topN changes', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: true,
        data: mockRankingsData,
      });

      render(<RankingsOverTime />);

      await waitFor(() => {
        expect(mockedStatsApi.getRankingsOverTime).toHaveBeenCalledTimes(1);
      });

      const topNSelect = screen.getByLabelText('Show top:');
      fireEvent.change(topNSelect, { target: { value: '20' } });

      await waitFor(() => {
        expect(mockedStatsApi.getRankingsOverTime).toHaveBeenCalledTimes(2);
        expect(mockedStatsApi.getRankingsOverTime).toHaveBeenCalledWith(
          'artists',
          20,
          expect.any(Number),
          expect.any(Number)
        );
      });
    });
  });

  describe('Error handling', () => {
    it('should display error message on failure', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: false,
        error: 'Failed to load data',
      });

      render(<RankingsOverTime />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load data')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      mockedStatsApi.getRankingsOverTime.mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      render(<RankingsOverTime />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should retry fetching data when retry button clicked', async () => {
      mockedStatsApi.getRankingsOverTime
        .mockResolvedValueOnce({
          success: false,
          error: 'Network error',
        })
        .mockResolvedValueOnce({
          success: true,
          data: mockRankingsData,
        });

      render(<RankingsOverTime />);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(mockedStatsApi.getRankingsOverTime).toHaveBeenCalledTimes(2);
      });
    });
  });
});
