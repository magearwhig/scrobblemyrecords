import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { StatDetailsModal } from '../../../../src/renderer/components/dashboard/StatDetailsModal';
import { statsApi } from '../../../../src/renderer/services/statsApi';

// Mock the statsApi
jest.mock('../../../../src/renderer/services/statsApi');

const mockedStatsApi = statsApi as jest.Mocked<typeof statsApi>;

describe('StatDetailsModal', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('new-artists stat type', () => {
    it('should not render when isOpen is false', () => {
      render(
        <StatDetailsModal
          isOpen={false}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      expect(
        screen.queryByText('New Artists This Month')
      ).not.toBeInTheDocument();
    });

    it('should render title when open', async () => {
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: true,
        data: [],
      });

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      expect(screen.getByText('New Artists This Month')).toBeInTheDocument();
    });

    it('should show empty state when no new artists', async () => {
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: true,
        data: [],
      });

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText('No new artists discovered this month yet.')
        ).toBeInTheDocument();
      });
    });

    it('should display list of new artists with details', async () => {
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: true,
        data: [
          {
            artist: 'The Beatles',
            firstPlayed: Date.now(),
            playCount: 5,
          },
          {
            artist: 'Pink Floyd',
            firstPlayed: Date.now() - 86400000, // 1 day ago
            playCount: 3,
          },
        ],
      });

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      await waitFor(() => {
        expect(screen.getByText('The Beatles')).toBeInTheDocument();
        expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
      });

      expect(screen.getByText('5 plays')).toBeInTheDocument();
      expect(screen.getByText('3 plays')).toBeInTheDocument();
    });

    it('should display singular "play" for 1 play', async () => {
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: true,
        data: [
          {
            artist: 'Solo Artist',
            firstPlayed: Date.now(),
            playCount: 1,
          },
        ],
      });

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      await waitFor(() => {
        expect(screen.getByText('1 play')).toBeInTheDocument();
      });
    });

    it('should show error message on API failure', async () => {
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: false,
        error: 'Failed to fetch data',
      });

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to fetch data')).toBeInTheDocument();
      });
    });

    it('should show retry button on error', async () => {
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching', () => {
      mockedStatsApi.getNewArtistsDetails.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve({ success: true, data: [] }), 100)
          )
      );

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      // Modal should have loading class applied
      const modal = screen.getByRole('dialog');
      expect(modal).toHaveClass('modal--loading');
    });

    it('should fetch data when modal opens', async () => {
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: true,
        data: [],
      });

      const { rerender } = render(
        <StatDetailsModal
          isOpen={false}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      expect(mockedStatsApi.getNewArtistsDetails).not.toHaveBeenCalled();

      rerender(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      await waitFor(() => {
        expect(mockedStatsApi.getNewArtistsDetails).toHaveBeenCalledTimes(1);
      });
    });

    it('should display relative time for first played', async () => {
      const now = Date.now();
      mockedStatsApi.getNewArtistsDetails.mockResolvedValue({
        success: true,
        data: [
          {
            artist: 'Recent Artist',
            firstPlayed: now,
            playCount: 2,
          },
        ],
      });

      render(
        <StatDetailsModal
          isOpen={true}
          onClose={mockOnClose}
          statType='new-artists'
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/First played/)).toBeInTheDocument();
      });
    });
  });
});
