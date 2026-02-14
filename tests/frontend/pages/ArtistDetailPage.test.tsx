import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import ArtistDetailPage from '../../../src/renderer/pages/ArtistDetailPage';
import { statsApi, imagesApi } from '../../../src/renderer/services/statsApi';
import { ArtistDetailResponse } from '../../../src/shared/types';

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

// Mock statsApi and imagesApi
jest.mock('../../../src/renderer/services/statsApi', () => ({
  statsApi: {
    getArtistDetail: jest.fn(),
  },
  imagesApi: {
    getArtistImage: jest.fn(),
  },
}));

// Mock spotifyUtils
jest.mock('../../../src/renderer/utils/spotifyUtils', () => ({
  playAlbumOnSpotify: jest.fn(),
  playTrackOnSpotify: jest.fn(),
}));

const mockStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const mockImagesApi = imagesApi as jest.Mocked<typeof imagesApi>;

describe('ArtistDetailPage', () => {
  const mockArtistData: ArtistDetailResponse = {
    artist: 'Radiohead',
    totalPlayCount: 1247,
    firstPlayed: 1553040000,
    lastPlayed: 1706745600,
    periodCounts: {
      thisWeek: 12,
      thisMonth: 47,
      thisYear: 312,
      allTime: 1247,
    },
    playTrend: [
      { period: '2024-01', count: 35 },
      { period: '2024-02', count: 42 },
    ],
    topTracks: [
      {
        track: 'Everything In Its Right Place',
        album: 'Kid A',
        playCount: 87,
        lastPlayed: 1706745600,
      },
      {
        track: 'Idioteque',
        album: 'Kid A',
        playCount: 63,
        lastPlayed: 1706659200,
      },
    ],
    albums: [
      {
        album: 'Kid A',
        playCount: 150,
        lastPlayed: 1706745600,
        inCollection: true,
        collectionReleaseId: 456,
      },
      {
        album: 'OK Computer',
        playCount: 120,
        lastPlayed: 1706659200,
        inCollection: false,
      },
    ],
    imageUrl: 'https://example.com/radiohead.jpg',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: artist selected in localStorage
    (localStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === 'selectedArtist') return 'Radiohead';
      if (key === 'previousPage') return 'stats';
      return null;
    });

    // Default: successful API responses
    mockStatsApi.getArtistDetail.mockResolvedValue({
      success: true,
      data: mockArtistData,
    });

    mockImagesApi.getArtistImage.mockResolvedValue({
      success: true,
      data: { url: 'https://example.com/radiohead.jpg', source: 'lastfm' },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should show loading skeleton while fetching', () => {
    // Arrange - make the API call hang
    mockStatsApi.getArtistDetail.mockReturnValue(new Promise(() => {}));

    // Act
    render(<ArtistDetailPage />);

    // Assert - should see back link and skeletons
    expect(
      screen.getByRole('button', { name: /back to stats/i })
    ).toBeInTheDocument();
  });

  it('should render artist name after loading', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });
  });

  it('should render total play count', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText(/1,247 total scrobbles/)).toBeInTheDocument();
    });
  });

  it('should render artist image when available', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      const img = screen.getByAltText('Radiohead');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/radiohead.jpg');
    });
  });

  it('should render image placeholder when no image is available', async () => {
    // Arrange
    mockImagesApi.getArtistImage.mockResolvedValue({
      success: true,
      data: { url: null, source: null },
    });

    // Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });
    // No img element should be present; placeholder div should be
    expect(screen.queryByAltText('Radiohead')).not.toBeInTheDocument();
  });

  it('should render play trend chart', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Play Count Over Time')).toBeInTheDocument();
    });
  });

  it('should list top tracks', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Top Tracks')).toBeInTheDocument();
      expect(
        screen.getByText('Everything In Its Right Place')
      ).toBeInTheDocument();
      expect(screen.getByText('Idioteque')).toBeInTheDocument();
    });
  });

  it('should display track play counts', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('87')).toBeInTheDocument();
      expect(screen.getByText('63')).toBeInTheDocument();
    });
  });

  it('should list albums', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Albums')).toBeInTheDocument();
      expect(screen.getByText('Kid A')).toBeInTheDocument();
      expect(screen.getByText('OK Computer')).toBeInTheDocument();
    });
  });

  it('should show "In Collection" badge for collected albums', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      const badges = screen.getAllByText('In Collection');
      expect(badges.length).toBe(1); // Only Kid A is in collection
    });
  });

  it('should render period counts in Listening Stats section', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Listening Stats')).toBeInTheDocument();
      expect(screen.getByText('This Week')).toBeInTheDocument();
      expect(screen.getByText('This Month')).toBeInTheDocument();
      expect(screen.getByText('This Year')).toBeInTheDocument();
      expect(screen.getByText('All Time')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('47')).toBeInTheDocument();
      expect(screen.getByText('312')).toBeInTheDocument();
      expect(screen.getByText('1,247')).toBeInTheDocument();
    });
  });

  it('should render external links', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /search radiohead on spotify/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /view radiohead on last\.fm/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: /search radiohead on discogs/i })
      ).toBeInTheDocument();
    });
  });

  it('should handle empty data gracefully', async () => {
    // Arrange
    const emptyData: ArtistDetailResponse = {
      artist: 'Unknown Artist',
      totalPlayCount: 0,
      firstPlayed: null,
      lastPlayed: null,
      periodCounts: { thisWeek: 0, thisMonth: 0, thisYear: 0, allTime: 0 },
      playTrend: [],
      topTracks: [],
      albums: [],
    };
    mockStatsApi.getArtistDetail.mockResolvedValue({
      success: true,
      data: emptyData,
    });

    // Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Unknown Artist')).toBeInTheDocument();
      expect(screen.getByText('No track data available.')).toBeInTheDocument();
      expect(screen.getByText('No album data available.')).toBeInTheDocument();
    });
  });

  it('should show error state when no artist is selected', async () => {
    // Arrange
    (localStorage.getItem as jest.Mock).mockReturnValue(null);

    // Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Could not load artist')).toBeInTheDocument();
      expect(screen.getByText(/no artist selected/i)).toBeInTheDocument();
    });
  });

  it('should show error state when API fails', async () => {
    // Arrange
    mockStatsApi.getArtistDetail.mockResolvedValue({
      success: false,
      error: 'Server error',
    });

    // Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Could not load artist')).toBeInTheDocument();
    });
  });

  it('should show error state when API throws', async () => {
    // Arrange
    mockStatsApi.getArtistDetail.mockRejectedValue(new Error('Network error'));

    // Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(screen.getByText('Could not load artist')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('should call getArtistDetail with correct arguments', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    await waitFor(() => {
      expect(mockStatsApi.getArtistDetail).toHaveBeenCalledWith(
        'Radiohead',
        'month'
      );
    });
  });

  it('should read selectedArtist from localStorage', async () => {
    // Arrange & Act
    render(<ArtistDetailPage />);

    // Assert
    expect(localStorage.getItem).toHaveBeenCalledWith('selectedArtist');
  });

  it('should handle back navigation', async () => {
    // Arrange
    const user = userEvent.setup();
    render(<ArtistDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Radiohead')).toBeInTheDocument();
    });

    // Act
    const backButton = screen.getByRole('button', {
      name: /back to stats/i,
    });
    await user.click(backButton);

    // Assert
    expect(window.location.hash).toBe('#stats');
  });
});
