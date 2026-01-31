import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { RankingsService } from '../../../src/backend/services/rankingsService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/services/rankingsService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedRankingsService = RankingsService as jest.MockedClass<
  typeof RankingsService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Stats Routes', () => {
  let app: express.Application;
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockStatsService: jest.Mocked<StatsService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockStatsService = new MockedStatsService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<StatsService>;

    // Setup default mocks
    mockAuthService.getUserSettings = jest.fn().mockResolvedValue({
      discogs: { username: 'testuser' },
      lastfm: {},
      preferences: {
        defaultTimestamp: 'now' as const,
        batchSize: 50,
        autoScrobble: false,
      },
    });

    mockFileStorage.readJSON = jest.fn().mockResolvedValue(null);

    // Stats service mocks
    mockStatsService.getStatsOverview = jest.fn().mockResolvedValue({
      streaks: { currentStreak: 5, longestStreak: 10 },
      counts: {
        today: 10,
        thisWeek: 50,
        thisMonth: 200,
        thisYear: 1000,
        allTime: 5000,
      },
      listeningHours: { today: 0.5, thisWeek: 3, thisMonth: 12 },
      newArtistsThisMonth: 5,
      collectionCoverage: {
        thisMonth: 25,
        thisYear: 60,
        albumsPlayedThisMonth: 50,
        albumsPlayedThisYear: 120,
        totalAlbums: 200,
      },
      milestones: {
        total: 5000,
        nextMilestone: 10000,
        scrobblesToNext: 5000,
        progressPercent: 50,
        history: [],
      },
    });

    mockStatsService.calculateStreaks = jest.fn().mockResolvedValue({
      currentStreak: 5,
      longestStreak: 10,
    });

    mockStatsService.getScrobbleCounts = jest.fn().mockResolvedValue({
      today: 10,
      thisWeek: 50,
      thisMonth: 200,
      thisYear: 1000,
      allTime: 5000,
    });

    mockStatsService.getListeningHours = jest.fn().mockResolvedValue({
      today: 0.5,
      thisWeek: 3,
      thisMonth: 12,
    });

    mockStatsService.getTopArtists = jest.fn().mockResolvedValue([
      { artist: 'Radiohead', playCount: 100 },
      { artist: 'Pink Floyd', playCount: 80 },
    ]);

    mockStatsService.getTopAlbums = jest.fn().mockResolvedValue([
      {
        artist: 'Radiohead',
        album: 'Kid A',
        playCount: 50,
        lastPlayed: Date.now() / 1000,
      },
    ]);

    mockStatsService.getCollectionCoverage = jest.fn().mockResolvedValue({
      thisMonth: 25,
      thisYear: 60,
      albumsPlayedThisMonth: 50,
      albumsPlayedThisYear: 120,
      totalAlbums: 200,
    });

    mockStatsService.getDustyCorners = jest.fn().mockResolvedValue([
      {
        artist: 'Old Artist',
        album: 'Dusty Album',
        coverUrl: 'https://example.com/cover.jpg',
        lastPlayed: 0,
        daysSincePlay: -1,
        collectionId: 123,
      },
    ]);

    mockStatsService.getHeavyRotation = jest.fn().mockResolvedValue([
      {
        artist: 'Favorite Artist',
        album: 'Heavy Album',
        playCount: 200,
        lastPlayed: Date.now() / 1000,
      },
    ]);

    mockStatsService.getCalendarHeatmap = jest.fn().mockResolvedValue([
      { date: '2024-01-15', count: 10 },
      { date: '2024-01-16', count: 5 },
    ]);

    mockStatsService.getMilestones = jest.fn().mockResolvedValue({
      total: 5000,
      nextMilestone: 10000,
      scrobblesToNext: 5000,
      progressPercent: 50,
      history: [],
    });

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Mount stats routes
    app.use(
      '/api/v1/stats',
      createStatsRouter(mockFileStorage, mockAuthService, mockStatsService)
    );
  });

  describe('GET /api/v1/stats/overview', () => {
    it('should return 401 when not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const response = await request(app).get('/api/v1/stats/overview');

      // Assert
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('authentication required');
    });

    it('should return stats overview when authenticated', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [{ id: 1, release: { artist: 'Test', title: 'Album' } }],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null); // No more pages

      // Act
      const response = await request(app).get('/api/v1/stats/overview');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('streaks');
      expect(response.body.data).toHaveProperty('counts');
      expect(mockStatsService.getStatsOverview).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getStatsOverview.mockRejectedValue(
        new Error('Stats error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/overview');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/stats/streaks', () => {
    it('should return streak information', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/streaks');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.currentStreak).toBe(5);
      expect(response.body.data.longestStreak).toBe(10);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.calculateStreaks.mockRejectedValue(
        new Error('Streak error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/streaks');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/stats/top/artists/:period', () => {
    it('should return top artists for valid period', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/artists/month'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.period).toBe('month');
      expect(mockStatsService.getTopArtists).toHaveBeenCalledWith(
        'month',
        10,
        undefined,
        undefined
      );
    });

    it('should accept limit query parameter', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/artists/all?limit=5'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(mockStatsService.getTopArtists).toHaveBeenCalledWith(
        'all',
        5,
        undefined,
        undefined
      );
    });

    it('should accept custom period with startDate and endDate', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/artists/custom?startDate=1704067200&endDate=1706745600'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.period).toBe('custom');
      expect(response.body.startDate).toBe(1704067200);
      expect(response.body.endDate).toBe(1706745600);
      expect(mockStatsService.getTopArtists).toHaveBeenCalledWith(
        'custom',
        10,
        1704067200,
        1706745600
      );
    });

    it('should return 400 for custom period without dates', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/artists/custom'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Custom period requires startDate and endDate'
      );
    });

    it('should return 400 for invalid period', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/artists/invalid'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid period');
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getTopArtists.mockRejectedValue(
        new Error('Artists error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/top/artists/week');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/stats/top/albums/:period', () => {
    it('should return top albums for valid period', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/top/albums/year');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.period).toBe('year');
    });

    it('should accept custom period with startDate and endDate', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/albums/custom?startDate=1704067200&endDate=1706745600'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.period).toBe('custom');
      expect(response.body.startDate).toBe(1704067200);
      expect(response.body.endDate).toBe(1706745600);
      expect(mockStatsService.getTopAlbums).toHaveBeenCalledWith(
        'custom',
        10,
        1704067200,
        1706745600
      );
    });

    it('should return 400 for custom period without dates', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/albums/custom'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain(
        'Custom period requires startDate and endDate'
      );
    });

    it('should return 400 for invalid period', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/top/albums/invalid'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getTopAlbums.mockRejectedValue(
        new Error('Albums error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/top/albums/month');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/stats/collection/coverage', () => {
    it('should return 401 when not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const response = await request(app).get(
        '/api/v1/stats/collection/coverage'
      );

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return collection coverage when authenticated', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [{ id: 1, release: { artist: 'Test', title: 'Album' } }],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/collection/coverage'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.thisMonth).toBe(25);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getCollectionCoverage.mockRejectedValue(
        new Error('Coverage error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/stats/collection/coverage'
      );

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/stats/dusty-corners', () => {
    it('should return 401 when not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const response = await request(app).get('/api/v1/stats/dusty-corners');

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return dusty corners with default limit', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [{ id: 1, release: { artist: 'Test', title: 'Album' } }],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null);

      // Act
      const response = await request(app).get('/api/v1/stats/dusty-corners');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(mockStatsService.getDustyCorners).toHaveBeenCalledWith(
        expect.any(Array),
        20
      );
    });

    it('should accept custom limit', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null);

      // Act
      const response = await request(app).get(
        '/api/v1/stats/dusty-corners?limit=10'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(mockStatsService.getDustyCorners).toHaveBeenCalledWith(
        expect.any(Array),
        10
      );
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getDustyCorners.mockRejectedValue(
        new Error('Dusty error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/dusty-corners');

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/stats/heavy-rotation', () => {
    it('should return 401 when not authenticated', async () => {
      // Arrange
      mockAuthService.getUserSettings.mockResolvedValue({
        discogs: { username: '' },
        lastfm: {},
        preferences: {
          defaultTimestamp: 'now' as const,
          batchSize: 50,
          autoScrobble: false,
        },
      });

      // Act
      const response = await request(app).get('/api/v1/stats/heavy-rotation');

      // Assert
      expect(response.status).toBe(401);
    });

    it('should return heavy rotation albums', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [{ id: 1, release: { artist: 'Test', title: 'Album' } }],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null);

      // Act
      const response = await request(app).get('/api/v1/stats/heavy-rotation');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getHeavyRotation.mockRejectedValue(
        new Error('Heavy error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/heavy-rotation');

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/stats/heatmap', () => {
    it('should return heatmap data for current year', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/heatmap');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.year).toBe(new Date().getFullYear());
    });

    it('should accept year query parameter', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/heatmap?year=2023'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.year).toBe(2023);
      expect(mockStatsService.getCalendarHeatmap).toHaveBeenCalledWith(2023);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getCalendarHeatmap.mockRejectedValue(
        new Error('Heatmap error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/heatmap');

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/stats/milestones', () => {
    it('should return milestone progress', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/milestones');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.total).toBe(5000);
      expect(response.body.data.nextMilestone).toBe(10000);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getMilestones.mockRejectedValue(
        new Error('Milestone error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/milestones');

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/stats/counts', () => {
    it('should return scrobble counts', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/counts');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.today).toBe(10);
      expect(response.body.data.allTime).toBe(5000);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getScrobbleCounts.mockRejectedValue(
        new Error('Counts error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/counts');

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/v1/stats/listening-hours', () => {
    it('should return listening hours', async () => {
      // Act
      const response = await request(app).get('/api/v1/stats/listening-hours');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.today).toBe(0.5);
      expect(response.body.data.thisMonth).toBe(12);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getListeningHours.mockRejectedValue(
        new Error('Hours error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/listening-hours');

      // Assert
      expect(response.status).toBe(500);
    });
  });

  describe('Collection loading', () => {
    it('should load multiple collection pages', async () => {
      // Arrange
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [{ id: 1, release: { artist: 'Artist1', title: 'Album1' } }],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce({
          data: [{ id: 2, release: { artist: 'Artist2', title: 'Album2' } }],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null); // End of pages

      // Act
      const response = await request(app).get('/api/v1/stats/overview');

      // Assert
      expect(response.status).toBe(200);
      // StatsService should have been called with 2 collection items
      expect(mockStatsService.getStatsOverview).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: 1 }),
          expect.objectContaining({ id: 2 }),
        ])
      );
    });

    it('should handle empty collection', async () => {
      // Arrange
      mockFileStorage.readJSON.mockResolvedValue(null);

      // Act
      const response = await request(app).get('/api/v1/stats/overview');

      // Assert
      expect(response.status).toBe(200);
      expect(mockStatsService.getStatsOverview).toHaveBeenCalledWith([]);
    });
  });

  describe('GET /api/v1/stats/forgotten-favorites', () => {
    beforeEach(() => {
      mockStatsService.getForgottenFavorites = jest.fn().mockResolvedValue({
        tracks: [
          {
            artist: 'Radiohead',
            album: 'OK Computer',
            track: 'Paranoid Android',
            allTimePlayCount: 50,
            lastPlayed: 1577836800, // Jan 1, 2020
            daysSincePlay: 1847,
          },
          {
            artist: 'Pink Floyd',
            album: 'The Wall',
            track: 'Comfortably Numb',
            allTimePlayCount: 35,
            lastPlayed: 1590969600, // June 1, 2020
            daysSincePlay: 1693,
          },
        ],
        totalMatching: 25,
      });
    });

    it('should return forgotten favorites with default parameters', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.dormantDays).toBe(90);
      expect(response.body.meta.minPlays).toBe(10);
      expect(response.body.meta.limit).toBe(100);
      expect(response.body.meta.returned).toBe(2);
      expect(response.body.meta.totalMatching).toBe(25);
      expect(mockStatsService.getForgottenFavorites).toHaveBeenCalledWith(
        90,
        10,
        100
      );
    });

    it('should accept dormantDays query parameter', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites?dormantDays=180'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.meta.dormantDays).toBe(180);
      expect(mockStatsService.getForgottenFavorites).toHaveBeenCalledWith(
        180,
        10,
        100
      );
    });

    it('should accept minPlays query parameter', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites?minPlays=20'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.meta.minPlays).toBe(20);
      expect(mockStatsService.getForgottenFavorites).toHaveBeenCalledWith(
        90,
        20,
        100
      );
    });

    it('should accept limit query parameter', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites?limit=50'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.meta.limit).toBe(50);
      expect(mockStatsService.getForgottenFavorites).toHaveBeenCalledWith(
        90,
        10,
        50
      );
    });

    it('should accept all query parameters together', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites?dormantDays=365&minPlays=5&limit=25'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.meta.dormantDays).toBe(365);
      expect(response.body.meta.minPlays).toBe(5);
      expect(response.body.meta.limit).toBe(25);
      expect(mockStatsService.getForgottenFavorites).toHaveBeenCalledWith(
        365,
        5,
        25
      );
    });

    it('should cap limit at 100', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites?limit=500'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.meta.limit).toBe(100);
      expect(mockStatsService.getForgottenFavorites).toHaveBeenCalledWith(
        90,
        10,
        100
      );
    });

    it('should enforce minimum values for parameters', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites?dormantDays=-5&minPlays=-10&limit=-20'
      );

      // Assert
      expect(response.status).toBe(200);
      // Should be clamped to minimum of 1
      expect(response.body.meta.dormantDays).toBe(1);
      expect(response.body.meta.minPlays).toBe(1);
      expect(response.body.meta.limit).toBe(1);
    });

    it('should return track data with expected fields', async () => {
      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites'
      );

      // Assert
      expect(response.status).toBe(200);
      const firstTrack = response.body.data[0];
      expect(firstTrack).toHaveProperty('artist', 'Radiohead');
      expect(firstTrack).toHaveProperty('album', 'OK Computer');
      expect(firstTrack).toHaveProperty('track', 'Paranoid Android');
      expect(firstTrack).toHaveProperty('allTimePlayCount', 50);
      expect(firstTrack).toHaveProperty('lastPlayed');
      expect(firstTrack).toHaveProperty('daysSincePlay');
    });

    it('should handle empty results', async () => {
      // Arrange
      mockStatsService.getForgottenFavorites.mockResolvedValue({
        tracks: [],
        totalMatching: 0,
      });

      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta.returned).toBe(0);
      expect(response.body.meta.totalMatching).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockStatsService.getForgottenFavorites.mockRejectedValue(
        new Error('Forgotten favorites error')
      );

      // Act
      const response = await request(app).get(
        '/api/v1/stats/forgotten-favorites'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Forgotten favorites error');
    });
  });

  describe('POST /api/v1/stats/album-play-counts', () => {
    let appWithHistory: express.Application;
    let mockHistoryStorage: {
      getAlbumHistoryFuzzy: jest.Mock;
    };

    beforeEach(() => {
      // Create a mock history storage
      mockHistoryStorage = {
        getAlbumHistoryFuzzy: jest.fn(),
      };

      // Create Express app with history storage
      appWithHistory = express();
      appWithHistory.use(helmet());
      appWithHistory.use(cors());
      appWithHistory.use(express.json());

      // Mount stats routes with history storage
      appWithHistory.use(
        '/api/v1/stats',
        createStatsRouter(
          mockFileStorage,
          mockAuthService,
          mockStatsService,
          mockHistoryStorage as any
        )
      );
    });

    it('should return 400 when albums array is missing', async () => {
      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({});

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('albums array');
    });

    it('should return 400 when albums is not an array', async () => {
      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: 'not-an-array' });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('albums array');
    });

    it('should return 400 when album is missing artist', async () => {
      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ title: 'Kid A' }] });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('artist and title');
    });

    it('should return 400 when album is missing title', async () => {
      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ artist: 'Radiohead' }] });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('artist and title');
    });

    it('should return 503 when history storage is not available', async () => {
      // Act - use the app without history storage
      const response = await request(app)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [{ artist: 'Radiohead', title: 'Kid A' }] });

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Scrobble history not available');
    });

    it('should return play counts for albums with exact matches', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          artist: 'Radiohead',
          album: 'Kid A',
          playCount: 42,
          lastPlayed: 1704067200,
        },
        matchType: 'exact',
      });

      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Radiohead', title: 'Kid A' }],
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0]).toEqual({
        artist: 'Radiohead',
        title: 'Kid A',
        playCount: 42,
        lastPlayed: 1704067200,
        matchType: 'exact',
      });
    });

    it('should return play counts for albums with fuzzy matches', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: {
          artist: 'Pink Floyd',
          album: 'The Dark Side of the Moon',
          playCount: 100,
          lastPlayed: 1706745600,
        },
        matchType: 'fuzzy',
      });

      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Pink Floyd', title: 'Dark Side Of The Moon' }],
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.results[0]).toMatchObject({
        artist: 'Pink Floyd',
        title: 'Dark Side Of The Moon',
        playCount: 100,
        matchType: 'fuzzy',
      });
    });

    it('should return zero play count for albums with no match', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockResolvedValue({
        entry: null,
        matchType: 'none',
      });

      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Unknown Artist', title: 'Unknown Album' }],
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.results[0]).toEqual({
        artist: 'Unknown Artist',
        title: 'Unknown Album',
        playCount: 0,
        lastPlayed: null,
        matchType: 'none',
      });
    });

    it('should handle multiple albums in a single request', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy
        .mockResolvedValueOnce({
          entry: { playCount: 50, lastPlayed: 1704067200 },
          matchType: 'exact',
        })
        .mockResolvedValueOnce({
          entry: { playCount: 30, lastPlayed: 1705276800 },
          matchType: 'fuzzy',
        })
        .mockResolvedValueOnce({
          entry: null,
          matchType: 'none',
        });

      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [
            { artist: 'Artist 1', title: 'Album 1' },
            { artist: 'Artist 2', title: 'Album 2' },
            { artist: 'Artist 3', title: 'Album 3' },
          ],
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data.results).toHaveLength(3);
      expect(response.body.data.results[0].playCount).toBe(50);
      expect(response.body.data.results[1].playCount).toBe(30);
      expect(response.body.data.results[2].playCount).toBe(0);
    });

    it('should handle empty albums array', async () => {
      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({ albums: [] });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.results).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockHistoryStorage.getAlbumHistoryFuzzy.mockRejectedValue(
        new Error('Database error')
      );

      // Act
      const response = await request(appWithHistory)
        .post('/api/v1/stats/album-play-counts')
        .send({
          albums: [{ artist: 'Radiohead', title: 'Kid A' }],
        });

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Database error');
    });
  });

  describe('GET /api/v1/stats/dashboard', () => {
    it('should return dashboard data with quick stats', async () => {
      // Arrange - mock collection page
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              release: {
                id: 123,
                artist: 'Test Artist',
                title: 'Test Album',
                cover_image: 'https://example.com/cover.jpg',
              },
            },
          ],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null); // No more pages

      mockStatsService.getNewArtistsThisMonth = jest.fn().mockResolvedValue(3);

      // Act
      const response = await request(app).get('/api/v1/stats/dashboard');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('quickStats');
      expect(response.body.data).toHaveProperty('quickActions');
      expect(response.body.data).toHaveProperty('recentAlbums');
      expect(response.body.data).toHaveProperty('monthlyTopArtists');
      expect(response.body.data).toHaveProperty('monthlyTopAlbums');
    });

    it('should return quick stats with correct values', async () => {
      // Arrange - mock collection page
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              release: {
                id: 123,
                artist: 'Test Artist',
                title: 'Test Album',
                cover_image: 'https://example.com/cover.jpg',
              },
            },
          ],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null); // No more pages

      mockStatsService.getNewArtistsThisMonth = jest.fn().mockResolvedValue(7);
      mockStatsService.getCollectionCoverage = jest.fn().mockResolvedValue({
        thisMonth: 30,
        thisYear: 60,
        allTime: 80,
        days30: 35,
        days90: 50,
        days365: 70,
        albumsPlayedThisMonth: 15,
        albumsPlayedThisYear: 30,
        albumsPlayedAllTime: 40,
        albumsPlayedDays30: 18,
        albumsPlayedDays90: 25,
        albumsPlayedDays365: 35,
        totalAlbums: 50,
      });

      // Act
      const response = await request(app).get('/api/v1/stats/dashboard');

      // Assert
      expect(response.status).toBe(200);
      const quickStats = response.body.data.quickStats;
      expect(quickStats).toBeDefined();
      expect(quickStats.currentStreak).toBe(5);
      expect(quickStats.longestStreak).toBe(10);
      expect(quickStats.scrobblesThisMonth).toBe(200);
      expect(quickStats.newArtistsThisMonth).toBe(7);
      expect(quickStats.collectionCoverageThisMonth).toBe(30);
    });

    it('should return monthly top artists and albums', async () => {
      // Arrange - mock collection page
      mockFileStorage.readJSON
        .mockResolvedValueOnce({
          data: [
            {
              id: 1,
              release: {
                id: 123,
                artist: 'radiohead',
                title: 'kid a',
                cover_image: 'https://example.com/cover.jpg',
              },
            },
          ],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce(null); // No more pages

      mockStatsService.getNewArtistsThisMonth = jest.fn().mockResolvedValue(2);
      mockStatsService.getTopArtists = jest.fn().mockResolvedValue([
        { artist: 'Radiohead', playCount: 100 },
        { artist: 'Pink Floyd', playCount: 80 },
      ]);
      mockStatsService.getTopAlbums = jest.fn().mockResolvedValue([
        {
          artist: 'Radiohead',
          album: 'Kid A',
          playCount: 50,
          lastPlayed: Date.now() / 1000,
        },
      ]);

      // Act
      const response = await request(app).get('/api/v1/stats/dashboard');

      // Assert
      expect(response.status).toBe(200);
      const { monthlyTopArtists, monthlyTopAlbums } = response.body.data;
      expect(monthlyTopArtists).toHaveLength(2);
      expect(monthlyTopArtists[0].name).toBe('Radiohead');
      expect(monthlyTopArtists[0].playCount).toBe(100);
      expect(monthlyTopAlbums).toHaveLength(1);
      expect(monthlyTopAlbums[0].album).toBe('Kid A');
      expect(monthlyTopAlbums[0].playCount).toBe(50);
    });

    it('should handle individual section errors gracefully', async () => {
      // Arrange - make one service fail
      mockStatsService.calculateStreaks.mockRejectedValue(
        new Error('Streak error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/dashboard');

      // Assert - should still succeed with error recorded
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.errors.quickStats).toBeDefined();
      // Other sections should still have data or be null
    });

    it('should handle complete failure gracefully', async () => {
      // Arrange - make auth fail
      mockAuthService.getUserSettings.mockRejectedValue(
        new Error('Auth error')
      );

      // Act
      const response = await request(app).get('/api/v1/stats/dashboard');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/stats/rankings-over-time', () => {
    let appWithRankings: express.Application;
    let mockRankingsService: jest.Mocked<RankingsService>;

    beforeEach(() => {
      // Create mock rankings service
      mockRankingsService = new MockedRankingsService(
        {} as any
      ) as jest.Mocked<RankingsService>;

      mockRankingsService.getRankingsOverTime = jest.fn().mockResolvedValue({
        snapshots: [
          {
            period: '2024-01',
            timestamp: 1704067200000,
            rankings: [
              { name: 'Artist 1', count: 10, rank: 1 },
              { name: 'Artist 2', count: 5, rank: 2 },
            ],
          },
        ],
        type: 'artists',
        topN: 10,
      });

      // Create Express app with rankings service
      appWithRankings = express();
      appWithRankings.use(helmet());
      appWithRankings.use(cors());
      appWithRankings.use(express.json());

      appWithRankings.use(
        '/api/v1/stats',
        createStatsRouter(
          mockFileStorage,
          mockAuthService,
          mockStatsService,
          undefined,
          undefined,
          undefined,
          undefined,
          mockRankingsService
        )
      );
    });

    it('should return 501 when rankings service is not available', async () => {
      // Use app without rankings service
      const response = await request(app).get(
        '/api/v1/stats/rankings-over-time'
      );

      expect(response.status).toBe(501);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Rankings service not available');
    });

    it('should return rankings over time with default parameters', async () => {
      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.type).toBe('artists');
      expect(response.body.data.topN).toBe(10);
      expect(response.body.data.snapshots).toHaveLength(1);
      expect(mockRankingsService.getRankingsOverTime).toHaveBeenCalledWith(
        'artists',
        10,
        undefined,
        undefined
      );
    });

    it('should accept type query parameter', async () => {
      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?type=tracks'
      );

      expect(response.status).toBe(200);
      expect(mockRankingsService.getRankingsOverTime).toHaveBeenCalledWith(
        'tracks',
        10,
        undefined,
        undefined
      );
    });

    it('should accept topN query parameter', async () => {
      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?topN=20'
      );

      expect(response.status).toBe(200);
      expect(mockRankingsService.getRankingsOverTime).toHaveBeenCalledWith(
        'artists',
        20,
        undefined,
        undefined
      );
    });

    it('should accept startDate and endDate parameters', async () => {
      const startDate = 1704067200000;
      const endDate = 1735689600000;

      const response = await request(appWithRankings).get(
        `/api/v1/stats/rankings-over-time?startDate=${startDate}&endDate=${endDate}`
      );

      expect(response.status).toBe(200);
      expect(mockRankingsService.getRankingsOverTime).toHaveBeenCalledWith(
        'artists',
        10,
        startDate,
        endDate
      );
    });

    it('should return 400 for invalid type', async () => {
      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?type=invalid'
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid type');
    });

    it('should use default topN when given 0', async () => {
      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?topN=0'
      );

      // topN=0 is falsy, so || 10 makes it default to 10
      expect(response.status).toBe(200);
      expect(mockRankingsService.getRankingsOverTime).toHaveBeenCalledWith(
        'artists',
        10,
        undefined,
        undefined
      );
    });

    it('should return 400 for topN greater than 50', async () => {
      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?topN=51'
      );

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid topN');
    });

    it('should use default topN when given non-numeric value', async () => {
      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?topN=abc'
      );

      // parseInt('abc') returns NaN, which is falsy, so || 10 makes it default to 10
      expect(response.status).toBe(200);
      expect(mockRankingsService.getRankingsOverTime).toHaveBeenCalledWith(
        'artists',
        10,
        undefined,
        undefined
      );
    });

    it('should handle errors gracefully', async () => {
      mockRankingsService.getRankingsOverTime.mockRejectedValue(
        new Error('Rankings error')
      );

      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time'
      );

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Rankings error');
    });

    it('should return albums rankings', async () => {
      mockRankingsService.getRankingsOverTime.mockResolvedValue({
        snapshots: [
          {
            period: '2024-01',
            timestamp: 1704067200000,
            rankings: [
              { name: 'Album 1', artist: 'Artist 1', count: 10, rank: 1 },
              { name: 'Album 2', artist: 'Artist 2', count: 5, rank: 2 },
            ],
          },
        ],
        type: 'albums',
        topN: 10,
      });

      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?type=albums'
      );

      expect(response.status).toBe(200);
      expect(response.body.data.type).toBe('albums');
      expect(response.body.data.snapshots[0].rankings[0].artist).toBe(
        'Artist 1'
      );
    });

    it('should return tracks rankings', async () => {
      mockRankingsService.getRankingsOverTime.mockResolvedValue({
        snapshots: [
          {
            period: '2024-01',
            timestamp: 1704067200000,
            rankings: [
              { name: 'Track 1', artist: 'Artist 1', count: 10, rank: 1 },
              { name: 'Track 2', artist: 'Artist 2', count: 5, rank: 2 },
            ],
          },
        ],
        type: 'tracks',
        topN: 10,
      });

      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time?type=tracks'
      );

      expect(response.status).toBe(200);
      expect(response.body.data.type).toBe('tracks');
      expect(response.body.data.snapshots[0].rankings[0].artist).toBe(
        'Artist 1'
      );
    });

    it('should handle empty snapshots', async () => {
      mockRankingsService.getRankingsOverTime.mockResolvedValue({
        snapshots: [],
        type: 'artists',
        topN: 10,
      });

      const response = await request(appWithRankings).get(
        '/api/v1/stats/rankings-over-time'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.snapshots).toEqual([]);
    });

    it('should accept all query parameters together', async () => {
      const startDate = 1704067200000;
      const endDate = 1735689600000;

      const response = await request(appWithRankings).get(
        `/api/v1/stats/rankings-over-time?type=albums&topN=15&startDate=${startDate}&endDate=${endDate}`
      );

      expect(response.status).toBe(200);
      expect(mockRankingsService.getRankingsOverTime).toHaveBeenCalledWith(
        'albums',
        15,
        startDate,
        endDate
      );
    });
  });
});
