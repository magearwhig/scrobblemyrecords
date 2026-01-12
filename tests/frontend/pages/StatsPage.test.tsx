import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import '@testing-library/jest-dom';
import { StatsPage } from '../../../src/renderer/pages/StatsPage';
import { statsApi, imagesApi } from '../../../src/renderer/services/statsApi';

// Mock the stats API
jest.mock('../../../src/renderer/services/statsApi', () => ({
  statsApi: {
    getStreaks: jest.fn(),
    getCounts: jest.fn(),
    getCollectionCoverage: jest.fn(),
    getMilestones: jest.fn(),
    getHeatmap: jest.fn(),
    getTopArtists: jest.fn(),
    getTopAlbums: jest.fn(),
    getDustyCorners: jest.fn(),
    getSourceBreakdown: jest.fn(),
    getTimeline: jest.fn(),
    getNewArtists: jest.fn(),
    getListeningHours: jest.fn(),
  },
  imagesApi: {
    batchGetAlbumCovers: jest.fn(),
    batchGetArtistImages: jest.fn(),
  },
}));

const mockStatsApi = statsApi as jest.Mocked<typeof statsApi>;
const mockImagesApi = imagesApi as jest.Mocked<typeof imagesApi>;

describe('StatsPage', () => {
  const defaultMockData = {
    streaks: {
      currentStreak: 5,
      longestStreak: 10,
    },
    counts: {
      today: 10,
      thisWeek: 50,
      thisMonth: 200,
      thisYear: 2000,
      allTime: 10000,
    },
    coverage: {
      thisMonth: 15,
      thisYear: 45,
      days30: 20,
      days90: 35,
      days365: 55,
      allTime: 75,
      albumsPlayedThisMonth: 30,
      albumsPlayedThisYear: 90,
      albumsPlayedDays30: 40,
      albumsPlayedDays90: 70,
      albumsPlayedDays365: 110,
      albumsPlayedAllTime: 150,
      totalAlbums: 200,
    },
    milestones: {
      total: 10500,
      nextMilestone: 11000,
      scrobblesToNext: 500,
      progressPercent: 95,
      history: [
        { milestone: 10000, reachedAt: Date.now() / 1000 - 86400 * 30 },
      ],
    },
    heatmap: [
      { date: '2024-01-01', count: 10 },
      { date: '2024-01-02', count: 5 },
    ],
    topArtists: [
      { artist: 'Radiohead', playCount: 150 },
      { artist: 'The Beatles', playCount: 120 },
    ],
    topAlbums: [
      {
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 50,
        lastPlayed: Date.now() / 1000,
      },
      {
        artist: 'The Beatles',
        album: 'Abbey Road',
        playCount: 45,
        lastPlayed: Date.now() / 1000 - 86400,
      },
    ],
    dustyCorners: [
      {
        artist: 'Pink Floyd',
        album: 'The Wall',
        lastPlayed: Date.now() / 1000 - 86400 * 200,
        coverUrl: 'https://example.com/wall.jpg',
        daysSincePlay: 200,
        collectionId: 12345,
      },
    ],
    sourceBreakdown: [
      { source: 'vinyl', count: 500, percentage: 50 },
      { source: 'spotify', count: 500, percentage: 50 },
    ],
    timeline: [
      { date: '2024-01', count: 100 },
      { date: '2024-02', count: 150 },
    ],
    newArtists: { count: 15 },
    listeningHours: {
      today: 2.5,
      thisWeek: 15,
      thisMonth: 62.8,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up default successful responses
    mockStatsApi.getStreaks.mockResolvedValue({
      success: true,
      data: defaultMockData.streaks,
    });
    mockStatsApi.getCounts.mockResolvedValue({
      success: true,
      data: defaultMockData.counts,
    });
    mockStatsApi.getCollectionCoverage.mockResolvedValue({
      success: true,
      data: defaultMockData.coverage,
    });
    mockStatsApi.getMilestones.mockResolvedValue({
      success: true,
      data: defaultMockData.milestones,
    });
    mockStatsApi.getHeatmap.mockResolvedValue({
      success: true,
      data: defaultMockData.heatmap,
    });
    mockStatsApi.getTopArtists.mockResolvedValue({
      success: true,
      data: defaultMockData.topArtists,
    });
    mockStatsApi.getTopAlbums.mockResolvedValue({
      success: true,
      data: defaultMockData.topAlbums,
    });
    mockStatsApi.getDustyCorners.mockResolvedValue({
      success: true,
      data: defaultMockData.dustyCorners,
    });
    mockStatsApi.getSourceBreakdown.mockResolvedValue({
      success: true,
      data: defaultMockData.sourceBreakdown,
    });
    mockStatsApi.getTimeline.mockResolvedValue({
      success: true,
      data: defaultMockData.timeline,
    });
    mockStatsApi.getNewArtists.mockResolvedValue({
      success: true,
      data: defaultMockData.newArtists,
    });
    mockStatsApi.getListeningHours.mockResolvedValue({
      success: true,
      data: defaultMockData.listeningHours,
    });
    mockImagesApi.batchGetAlbumCovers.mockResolvedValue({
      success: true,
      data: {},
    });
    mockImagesApi.batchGetArtistImages.mockResolvedValue({
      success: true,
      data: {},
    });
  });

  it('should show loading state initially', () => {
    render(<StatsPage />);
    expect(screen.getByText(/loading your stats/i)).toBeInTheDocument();
  });

  it('should render stats dashboard after loading', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();
    });
  });

  it('should display streak card', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      // The streak card is rendered with value '5'
      expect(screen.getByText('5')).toBeInTheDocument();
      // And shows the fire emoji
      const streakCard = document.querySelector('.streak-card');
      expect(streakCard).toBeInTheDocument();
    });
  });

  it('should display scrobble counts', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      // Find stat cards by their CSS class
      const statCards = document.querySelectorAll('.stat-card');
      expect(statCards.length).toBeGreaterThan(0);
    });
  });

  it('should display all time counts', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      // Check the All Time stat card is rendered (find by class + text)
      const statCards = document.querySelectorAll('.stat-card');
      expect(statCards.length).toBeGreaterThan(0);
      // The formatted count 10,000 is in a stat card value
      const allTimeValue = screen.getByText('10,000');
      expect(allTimeValue).toBeInTheDocument();
    });
  });

  it('should display new artists count', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('New Artists')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument();
    });
  });

  it('should display listening hours', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText(/62\.8h/)).toBeInTheDocument();
    });
  });

  it('should display top artists section', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Top Artists')).toBeInTheDocument();
      // Top lists section is rendered
      const topListsRow = document.querySelector('.stats-top-lists-row');
      expect(topListsRow).toBeInTheDocument();
    });
  });

  it('should display top albums', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Top Albums')).toBeInTheDocument();
      expect(screen.getByText('OK Computer')).toBeInTheDocument();
    });
  });

  it('should display collection coverage', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Collection Coverage')).toBeInTheDocument();
    });
  });

  it('should show error state on API failure', async () => {
    mockStatsApi.getStreaks.mockRejectedValue(new Error('Network error'));

    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Error Loading Stats')).toBeInTheDocument();
    });
  });

  it('should show error message from API', async () => {
    mockStatsApi.getStreaks.mockRejectedValue(new Error('Server unavailable'));

    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Server unavailable')).toBeInTheDocument();
    });
  });

  it('should have retry button on error', async () => {
    mockStatsApi.getStreaks.mockRejectedValue(new Error('Network error'));

    render(<StatsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /retry/i })
      ).toBeInTheDocument();
    });
  });

  it('should display calendar heatmap section', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText(/listening activity/i)).toBeInTheDocument();
    });
  });

  it('should call all stats APIs on load', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      expect(mockStatsApi.getStreaks).toHaveBeenCalled();
      expect(mockStatsApi.getCounts).toHaveBeenCalled();
      expect(mockStatsApi.getCollectionCoverage).toHaveBeenCalled();
      expect(mockStatsApi.getMilestones).toHaveBeenCalled();
      expect(mockStatsApi.getHeatmap).toHaveBeenCalled();
      expect(mockStatsApi.getTopArtists).toHaveBeenCalled();
      expect(mockStatsApi.getTopAlbums).toHaveBeenCalled();
      expect(mockStatsApi.getDustyCorners).toHaveBeenCalled();
      expect(mockStatsApi.getSourceBreakdown).toHaveBeenCalled();
      expect(mockStatsApi.getTimeline).toHaveBeenCalled();
      expect(mockStatsApi.getNewArtists).toHaveBeenCalled();
      expect(mockStatsApi.getListeningHours).toHaveBeenCalled();
    });
  });

  it('should handle failed image enrichment gracefully', async () => {
    mockImagesApi.batchGetArtistImages.mockRejectedValue(
      new Error('Image fetch failed')
    );
    mockImagesApi.batchGetAlbumCovers.mockRejectedValue(
      new Error('Image fetch failed')
    );

    render(<StatsPage />);

    // Should still render the page despite image errors
    await waitFor(() => {
      expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();
      // Top artists section still renders
      expect(screen.getByText('Top Artists')).toBeInTheDocument();
    });
  });

  it('should enrich artists with images when available', async () => {
    mockImagesApi.batchGetArtistImages.mockResolvedValue({
      success: true,
      data: { radiohead: 'https://example.com/radiohead.jpg' },
    });

    render(<StatsPage />);

    await waitFor(() => {
      expect(mockImagesApi.batchGetArtistImages).toHaveBeenCalled();
    });
  });

  it('should enrich albums with cover images when available', async () => {
    mockImagesApi.batchGetAlbumCovers.mockResolvedValue({
      success: true,
      data: { 'radiohead|ok computer': 'https://example.com/ok-computer.jpg' },
    });

    render(<StatsPage />);

    await waitFor(() => {
      expect(mockImagesApi.batchGetAlbumCovers).toHaveBeenCalled();
    });
  });

  it('should handle empty data gracefully', async () => {
    mockStatsApi.getTopArtists.mockResolvedValue({ success: true, data: [] });
    mockStatsApi.getTopAlbums.mockResolvedValue({ success: true, data: [] });

    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();
    });
  });
});
