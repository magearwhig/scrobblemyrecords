import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { StatsPage } from '../../../src/renderer/pages/StatsPage';
import { statsApi, imagesApi } from '../../../src/renderer/services/statsApi';

// Mock useCollectionLookup hook
jest.mock('../../../src/renderer/hooks/useCollectionLookup', () => ({
  useCollectionLookup: () => ({
    collectionMap: new Map(),
    collectionArtistCounts: new Map(),
    collectionArtistCovers: new Map(),
    loading: false,
    collection: [],
  }),
}));

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
    getTopTracks: jest.fn(),
    getTopLabels: jest.fn(),
    getDustyCorners: jest.fn(),
    getSourceBreakdown: jest.fn(),
    getTimeline: jest.fn(),
    getNewArtists: jest.fn(),
    getListeningHours: jest.fn(),
    getRankingsOverTime: jest.fn(),
    getCollectionROI: jest.fn(),
    getTasteDrift: jest.fn(),
    getOnThisDay: jest.fn(),
    getGenreDistribution: jest.fn(),
    getHourlyDistribution: jest.fn(),
    getDayOfWeekDistribution: jest.fn(),
  },
  imagesApi: {
    batchGetAlbumCovers: jest.fn(),
    batchGetArtistImages: jest.fn(),
  },
}));

// Mock the main API service (unresolved history summary for the album note)
const mockGetUnresolvedHistorySummary = jest.fn();
jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => ({
    getUnresolvedHistorySummary: mockGetUnresolvedHistorySummary,
  }),
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
    topTracks: [
      {
        artist: 'Radiohead',
        album: 'OK Computer',
        track: 'Paranoid Android',
        playCount: 25,
        lastPlayed: Date.now() / 1000,
      },
      {
        artist: 'The Beatles',
        album: 'Abbey Road',
        track: 'Come Together',
        playCount: 22,
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
    rankingsOverTime: {
      snapshots: [
        {
          period: '2024-01',
          timestamp: Date.now() - 86400000 * 60,
          rankings: [
            { name: 'Radiohead', count: 100, rank: 1 },
            { name: 'The Beatles', count: 80, rank: 2 },
          ],
        },
        {
          period: '2024-02',
          timestamp: Date.now() - 86400000 * 30,
          rankings: [
            { name: 'Radiohead', count: 150, rank: 1 },
            { name: 'The Beatles', count: 120, rank: 2 },
          ],
        },
      ],
      type: 'artists' as const,
      topN: 10,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUnresolvedHistorySummary.mockResolvedValue({ unresolvedCount: 0 });

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
    mockStatsApi.getTopTracks.mockResolvedValue({
      success: true,
      data: defaultMockData.topTracks,
    });
    mockStatsApi.getTopLabels.mockResolvedValue({
      success: true,
      data: [
        {
          label: 'Sub Pop',
          labelKey: 'sub pop',
          playCount: 90,
          ownedPlayCount: 90,
          albumCount: 7,
          lastPlayed: 1,
        },
      ],
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
    mockStatsApi.getRankingsOverTime.mockResolvedValue({
      success: true,
      data: defaultMockData.rankingsOverTime,
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
    // Loading state now shows skeleton components instead of text
    const skeletons = document.querySelectorAll(
      '.skeleton-stat-card, .skeleton-chart-card'
    );
    expect(skeletons.length).toBeGreaterThan(0);
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
      // The streak card is rendered
      const streakCard = document.querySelector('.streak-card');
      expect(streakCard).toBeInTheDocument();
      // And shows the current streak value
      expect(streakCard).toHaveTextContent('5');
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

    // All-time plays are in the summary line under the cards
    expect(await screen.findByTestId('stats-summary')).toHaveTextContent(
      '10,000 plays all time'
    );
  });

  it('should display new artists count', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      const newArtistsCard = screen
        .getByText('New Artists')
        .closest('.stat-card');
      expect(newArtistsCard).toBeInTheDocument();
      expect(newArtistsCard).toHaveTextContent('15');
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
      // Top lists section is rendered
      const topListsRow = document.querySelector('.stats-rankings-grid');
      expect(topListsRow).toBeInTheDocument();
      // Check for Top Artists within the top lists section
      expect(topListsRow).toHaveTextContent('Top Artists');
    });
  });

  it('should display top albums', async () => {
    render(<StatsPage />);

    await waitFor(() => {
      const topListsRow = document.querySelector('.stats-rankings-grid');
      expect(topListsRow).toHaveTextContent('Top Albums');
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
      expect(mockStatsApi.getTopTracks).toHaveBeenCalled();
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
      // Top lists section still renders
      const topListsRow = document.querySelector('.stats-rankings-grid');
      expect(topListsRow).toHaveTextContent('Top Artists');
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

  describe('layout', () => {
    it('leads with four cards and a summary line instead of more cards', async () => {
      mockStatsApi.getSourceBreakdown.mockResolvedValue({
        success: true,
        data: [
          { source: 'RecordScrobbles', count: 50, percentage: 5 },
          { source: 'Other', count: 950, percentage: 95 },
        ],
      });
      render(<StatsPage />);

      const summary = await screen.findByTestId('stats-summary');
      expect(summary).toHaveTextContent('10,000 plays all time');
      expect(summary).toHaveTextContent('2,000 this year');
      expect(summary).toHaveTextContent('500 to 11K');
      expect(summary).toHaveTextContent('62.8h this month (estimated)');
      expect(summary).toHaveTextContent('5% scrobbled through this app');
      const cards = document.querySelectorAll('.stats-cards-row > *');
      expect(cards).toHaveLength(4);
      expect(
        screen.queryByText('Listening This Month')
      ).not.toBeInTheDocument();
      expect(screen.queryByText('Milestone Progress')).not.toBeInTheDocument();
      expect(screen.queryByText('Scrobble Sources')).not.toBeInTheDocument();
    });

    it('puts the rankings right after the overview', async () => {
      render(<StatsPage />);

      const rankings = await screen.findByRole('heading', {
        name: 'Rankings',
      });
      const activity = screen.getByText('Listening Activity');
      expect(
        rankings.compareDocumentPosition(activity) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it('leaves plays per dollar to Collection Analytics', async () => {
      render(<StatsPage />);
      await screen.findByRole('heading', { name: 'Rankings' });

      expect(
        screen.queryByLabelText('Collection ROI leaderboard')
      ).not.toBeInTheDocument();
      expect(mockStatsApi.getCollectionROI).not.toHaveBeenCalled();
    });

    it('asks for a four-record Dusty Corners teaser', async () => {
      render(<StatsPage />);

      expect(
        await screen.findByRole('button', { name: 'See all in What to Play' })
      ).toBeInTheDocument();
      expect(mockStatsApi.getDustyCorners).toHaveBeenCalledWith(4);
    });
  });

  it('loads On This Day covers after the page has its text', async () => {
    const originalObserver = global.IntersectionObserver;
    global.IntersectionObserver = jest.fn(
      (
        cb: (
          entries: IntersectionObserverEntry[],
          observer: IntersectionObserver
        ) => void
      ) =>
        ({
          observe: () =>
            cb(
              [{ isIntersecting: true } as IntersectionObserverEntry],
              {} as IntersectionObserver
            ),
          disconnect: jest.fn(),
          unobserve: jest.fn(),
        }) as unknown as IntersectionObserver
    ) as unknown as typeof IntersectionObserver;
    mockStatsApi.getHourlyDistribution.mockResolvedValue({
      success: true,
      data: { distribution: [], peakHour: 0, insight: '' },
    } as never);
    mockStatsApi.getDayOfWeekDistribution.mockResolvedValue({
      success: true,
      data: {
        distribution: [],
        peakDay: 0,
        weekdayAvg: 0,
        weekendAvg: 0,
        insight: '',
      },
    } as never);
    mockStatsApi.getGenreDistribution.mockResolvedValue({
      success: true,
      data: { genres: [], totalArtistsAnalyzed: 0, lastUpdated: 1 },
    } as never);
    mockStatsApi.getOnThisDay.mockResolvedValue({
      success: true,
      data: {
        date: { month: 11, day: 13 },
        years: [
          {
            year: 2020,
            yearsAgo: 6,
            totalScrobbles: 3,
            albums: [
              {
                artist: 'Spoon',
                album: 'Kill the Moonlight',
                playCount: 3,
                coverUrl: null,
              },
            ],
          },
        ],
      },
    });
    mockImagesApi.batchGetAlbumCovers.mockImplementation(async albums => {
      const data: Record<string, string | null> = {};
      if (albums.some(a => a.album === 'Kill the Moonlight')) {
        data['spoon|kill the moonlight'] = 'https://example.com/ktm.jpg';
      }
      return { success: true, data };
    });

    try {
      render(<StatsPage />);

      expect(
        await screen.findByAltText('Spoon - Kill the Moonlight')
      ).toHaveAttribute('src', 'https://example.com/ktm.jpg');
    } finally {
      global.IntersectionObserver = originalObserver;
    }
  });

  it('should handle empty data gracefully', async () => {
    mockStatsApi.getTopArtists.mockResolvedValue({ success: true, data: [] });
    mockStatsApi.getTopAlbums.mockResolvedValue({ success: true, data: [] });
    mockStatsApi.getTopTracks.mockResolvedValue({ success: true, data: [] });

    render(<StatsPage />);

    await waitFor(() => {
      expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();
    });
  });

  describe('plays without album info note', () => {
    afterEach(() => {
      window.location.hash = '';
    });

    it('shows the note and links to the Unresolved history tab', async () => {
      mockGetUnresolvedHistorySummary.mockResolvedValue({
        unresolvedCount: 1234,
      });

      render(<StatsPage />);

      expect(
        await screen.findByText(
          /1,234 plays without album info are excluded from album stats/
        )
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Review them' }));
      expect(window.location.hash).toBe('#history?tab=unresolved');
    });

    it('hides the note when every play has album info', async () => {
      render(<StatsPage />);

      await waitFor(() => {
        expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();
      });
      expect(mockGetUnresolvedHistorySummary).toHaveBeenCalled();
      expect(screen.queryByText(/without album info/)).not.toBeInTheDocument();
    });

    it('ignores summary failures', async () => {
      mockGetUnresolvedHistorySummary.mockRejectedValue(new Error('down'));

      render(<StatsPage />);

      await waitFor(() => {
        expect(screen.getByText('Stats Dashboard')).toBeInTheDocument();
      });
      expect(screen.queryByText(/without album info/)).not.toBeInTheDocument();
    });
  });
});
