import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import TrackDetailPage from '../../../src/renderer/pages/TrackDetailPage';
import { statsApi } from '../../../src/renderer/services/statsApi';
import { TrackDetailResponse } from '../../../src/shared/types';

// Mock recharts to avoid rendering issues in jsdom
jest.mock('recharts', () => ({
  ResponsiveContainer: ({
    children,
  }: {
    children: React.ReactNode;
    width?: string | number;
    height?: number;
  }) => <div data-testid='responsive-container'>{children}</div>,
  AreaChart: ({
    children,
  }: {
    children: React.ReactNode;
    data?: unknown[];
  }) => <div data-testid='area-chart'>{children}</div>,
  Area: () => <div data-testid='area' />,
  XAxis: () => <div data-testid='x-axis' />,
  YAxis: () => <div data-testid='y-axis' />,
  CartesianGrid: () => <div data-testid='cartesian-grid' />,
  Tooltip: () => <div data-testid='tooltip' />,
}));

// Mock statsApi
jest.mock('../../../src/renderer/services/statsApi', () => ({
  statsApi: {
    getTrackDetail: jest.fn(),
  },
  imagesApi: {},
}));

// Mock spotifyUtils
jest.mock('../../../src/renderer/utils/spotifyUtils', () => ({
  playAlbumOnSpotify: jest.fn(),
  playTrackOnSpotify: jest.fn(),
}));

const mockStatsApi = statsApi as jest.Mocked<typeof statsApi>;

describe('TrackDetailPage', () => {
  const mockTrackData: TrackDetailResponse = {
    artist: 'Radiohead',
    track: 'Everything In Its Right Place',
    totalPlayCount: 87,
    firstPlayed: 1555718400,
    lastPlayed: 1706745600,
    playTrend: [
      { period: '2024-01', count: 8 },
      { period: '2024-02', count: 12 },
    ],
    appearsOn: [
      {
        album: 'Kid A',
        artist: 'Radiohead',
        playCount: 47,
        lastPlayed: 1706745600,
        inCollection: true,
        collectionReleaseId: 456,
      },
      {
        album: 'Kid A (Deluxe Edition)',
        artist: 'Radiohead',
        playCount: 40,
        lastPlayed: 1706659200,
        inCollection: false,
      },
    ],
  };

  const selectedTrack = {
    artist: 'Radiohead',
    track: 'Everything In Its Right Place',
    album: 'Kid A',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: track selected in localStorage
    (localStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'selectedTrack') return JSON.stringify(selectedTrack);
      if (key === 'previousPage') return 'stats';
      return null;
    });

    // Default: successful API response
    mockStatsApi.getTrackDetail.mockResolvedValue({
      success: true,
      data: mockTrackData,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should show loading skeleton while fetching', () => {
    // Arrange - make the API call hang
    mockStatsApi.getTrackDetail.mockReturnValue(new Promise(() => {}));

    // Act
    render(<TrackDetailPage />);

    // Assert - back button should be visible during loading
    expect(
      screen.getByRole('button', { name: /back to stats/i })
    ).toBeInTheDocument();
  });

  it('should render track name after loading', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByText('Everything In Its Right Place')
      ).toBeInTheDocument();
    });
  });

  it('should render artist name with link', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByRole('link', {
          name: /view artist details for radiohead/i,
        })
      ).toBeInTheDocument();
    });
  });

  it('should render total play count', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/87 total plays/)).toBeInTheDocument();
    });
  });

  it('should render play trend chart', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Play Count Over Time')).toBeInTheDocument();
    });
  });

  it('should list albums the track appears on', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Appears On')).toBeInTheDocument();
      expect(screen.getByText('Kid A')).toBeInTheDocument();
      expect(screen.getByText('Kid A (Deluxe Edition)')).toBeInTheDocument();
    });
  });

  it('should show "In Collection" badge for collected albums', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      const badges = screen.getAllByText('In Collection');
      expect(badges.length).toBe(1); // Only Kid A is in collection
    });
  });

  it('should display per-album play counts in appears-on list', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/47 plays/)).toBeInTheDocument();
      expect(screen.getByText(/40 plays/)).toBeInTheDocument();
    });
  });

  it('should handle empty data gracefully', async () => {
    // Arrange
    const emptyData: TrackDetailResponse = {
      artist: 'Radiohead',
      track: 'Nonexistent Track',
      totalPlayCount: 0,
      firstPlayed: null,
      lastPlayed: null,
      playTrend: [],
      appearsOn: [],
    };
    mockStatsApi.getTrackDetail.mockResolvedValue({
      success: true,
      data: emptyData,
    });

    // Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/0 total plays/)).toBeInTheDocument();
    });
    // "Appears On" should not be rendered when empty
    expect(screen.queryByText('Appears On')).not.toBeInTheDocument();
  });

  it('should show error when no track is selected', async () => {
    // Arrange
    (localStorage.getItem as jest.Mock).mockReturnValue(null);

    // Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Track Not Found')).toBeInTheDocument();
    });
  });

  it('should show error when API fails', async () => {
    // Arrange
    mockStatsApi.getTrackDetail.mockResolvedValue({
      success: false,
      error: 'Server error',
    });

    // Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Track Not Found')).toBeInTheDocument();
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('should show error when API throws', async () => {
    // Arrange
    mockStatsApi.getTrackDetail.mockRejectedValue(new Error('Network error'));

    // Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Track Not Found')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should call getTrackDetail with correct arguments', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(mockStatsApi.getTrackDetail).toHaveBeenCalledWith(
        'Radiohead',
        'Everything In Its Right Place',
        'Kid A',
        'month'
      );
    });
  });

  it('should read selectedTrack from localStorage', () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    expect(localStorage.getItem).toHaveBeenCalledWith('selectedTrack');
  });

  it('should render external links (Spotify and Last.fm)', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /play everything in its right place on spotify/i,
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', {
          name: /view everything in its right place on last\.fm/i,
        })
      ).toBeInTheDocument();
    });
  });

  it('should handle back navigation', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<TrackDetailPage />);

    await waitFor(() => {
      expect(
        screen.getByText('Everything In Its Right Place')
      ).toBeInTheDocument();
    });

    // Act
    const backButton = screen.getByRole('button', {
      name: /back to stats/i,
    });
    await user.click(backButton);

    // Assert
    expect(window.location.hash).toBe('#stats');
  });

  it('should render first and last played dates', async () => {
    // Arrange & Act
    render(<TrackDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/first played/i)).toBeInTheDocument();
      expect(screen.getByText(/last played/i)).toBeInTheDocument();
    });
  });
});
