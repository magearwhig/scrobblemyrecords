import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';

// Mock dependencies
jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
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
});
