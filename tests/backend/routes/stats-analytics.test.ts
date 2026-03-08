import request from 'supertest';

import createStatsRouter from '../../../src/backend/routes/stats';
import { AuthService } from '../../../src/backend/services/authService';
import { GenreAnalysisService } from '../../../src/backend/services/genreAnalysisService';
import { StatsService } from '../../../src/backend/services/statsService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { createTestApp } from '../../utils/testHelpers';

jest.mock('../../../src/backend/services/authService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/services/genreAnalysisService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedAuthService = AuthService as jest.MockedClass<typeof AuthService>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedGenreAnalysisService = GenreAnalysisService as jest.MockedClass<
  typeof GenreAnalysisService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Stats Analytics Routes', () => {
  let mockFileStorage: jest.Mocked<FileStorage>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockStatsService: jest.Mocked<StatsService>;
  let mockGenreAnalysisService: jest.Mocked<GenreAnalysisService>;

  // Use createTestApp to get Connection: close and avoid handle leaks
  const buildApp = () =>
    createTestApp({
      mountPath: '/api/v1/stats',
      routerFactory: () =>
        createStatsRouter(
          mockFileStorage,
          mockAuthService,
          mockStatsService,
          undefined, // historyStorage
          undefined, // wishlistService
          undefined, // sellerMonitoringService
          undefined, // analyticsService
          undefined, // rankingsService
          undefined, // mappingService
          undefined, // historyIndexMergeService
          undefined, // imageService
          mockGenreAnalysisService
        ),
      mocks: {},
    });

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileStorage = new MockedFileStorage('test') as jest.Mocked<FileStorage>;
    mockAuthService = new MockedAuthService(
      mockFileStorage
    ) as jest.Mocked<AuthService>;
    mockStatsService = new MockedStatsService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<StatsService>;
    mockGenreAnalysisService = new MockedGenreAnalysisService(
      {} as any,
      {} as any,
      mockFileStorage
    ) as jest.Mocked<GenreAnalysisService>;
  });

  // ============================================
  // GET /api/v1/stats/collection-roi
  // ============================================

  describe('GET /api/v1/stats/collection-roi', () => {
    const mockRoiData = [
      {
        artist: 'Radiohead',
        album: 'OK Computer',
        playCount: 50,
        medianPrice: 25,
        currency: 'USD',
        roiScore: 2.0,
        releaseId: 1,
        coverUrl: 'https://example.com/cover.jpg',
      },
      {
        artist: 'Pink Floyd',
        album: 'The Wall',
        playCount: 20,
        medianPrice: 40,
        currency: 'USD',
        roiScore: 0.5,
        releaseId: 2,
      },
    ];

    it('should return 200 with ROI data when no limit is specified', async () => {
      // Arrange
      mockStatsService.getCollectionROI = jest
        .fn()
        .mockResolvedValue(mockRoiData);
      const { app } = buildApp();

      // Act
      const response = await request(app).get('/api/v1/stats/collection-roi');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockRoiData);
      expect(mockStatsService.getCollectionROI).toHaveBeenCalledWith(undefined);
    });

    it('should pass limit parameter to service', async () => {
      // Arrange
      mockStatsService.getCollectionROI = jest
        .fn()
        .mockResolvedValue([mockRoiData[0]]);
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/collection-roi?limit=1'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockStatsService.getCollectionROI).toHaveBeenCalledWith(1);
    });

    it('should return 400 for invalid limit', async () => {
      // Arrange
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/collection-roi?limit=0'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('limit');
    });

    it('should return 400 for non-numeric limit', async () => {
      // Arrange
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/collection-roi?limit=abc'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 500 when service throws', async () => {
      // Arrange
      mockStatsService.getCollectionROI = jest
        .fn()
        .mockRejectedValue(new Error('Internal error'));
      const { app } = buildApp();

      // Act
      const response = await request(app).get('/api/v1/stats/collection-roi');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal error');
    });

    it('should return empty array when no collection ROI data', async () => {
      // Arrange
      mockStatsService.getCollectionROI = jest.fn().mockResolvedValue([]);
      const { app } = buildApp();

      // Act
      const response = await request(app).get('/api/v1/stats/collection-roi');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  // ============================================
  // GET /api/v1/stats/album-arc
  // ============================================

  describe('GET /api/v1/stats/album-arc', () => {
    const mockArcData = [
      { period: '2022-01', playCount: 5, trackCount: 3 },
      { period: '2022-06', playCount: 2, trackCount: 2 },
      { period: '2023-01', playCount: 8, trackCount: 4 },
    ];

    it('should return 200 with arc data for valid artist and album', async () => {
      // Arrange
      mockStatsService.getAlbumListeningArc = jest
        .fn()
        .mockResolvedValue(mockArcData);
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-arc?artist=Radiohead&album=OK+Computer'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockArcData);
      expect(mockStatsService.getAlbumListeningArc).toHaveBeenCalledWith(
        'Radiohead',
        'OK Computer'
      );
    });

    it('should return 400 when artist is missing', async () => {
      // Arrange
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-arc?album=OK+Computer'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('artist');
    });

    it('should return 400 when album is missing', async () => {
      // Arrange
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-arc?artist=Radiohead'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('album');
    });

    it('should return 400 when both params are missing', async () => {
      // Arrange
      const { app } = buildApp();

      // Act
      const response = await request(app).get('/api/v1/stats/album-arc');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 200 with empty array for unknown album', async () => {
      // Arrange
      mockStatsService.getAlbumListeningArc = jest.fn().mockResolvedValue([]);
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-arc?artist=Unknown&album=Album'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual([]);
    });

    it('should return 500 when service throws', async () => {
      // Arrange
      mockStatsService.getAlbumListeningArc = jest
        .fn()
        .mockRejectedValue(new Error('Storage error'));
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/album-arc?artist=Radiohead&album=OK+Computer'
      );

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Storage error');
    });
  });

  // ============================================
  // GET /api/v1/stats/taste-drift
  // ============================================

  describe('GET /api/v1/stats/taste-drift', () => {
    const mockDriftData = {
      snapshots: [
        {
          period: '2024-Q1',
          genres: [
            { name: 'alternative rock', weight: 0.6, playCount: 30 },
            { name: 'indie', weight: 0.4, playCount: 20 },
          ],
        },
        {
          period: '2024-Q2',
          genres: [
            { name: 'electronic', weight: 0.7, playCount: 35 },
            { name: 'ambient', weight: 0.3, playCount: 15 },
          ],
        },
      ],
      totalQuarters: 2,
      topGenresOverall: ['alternative rock', 'electronic', 'indie', 'ambient'],
    };

    it('should return 200 with drift data using default 24 months', async () => {
      // Arrange
      mockGenreAnalysisService.getTasteDrift = jest
        .fn()
        .mockResolvedValue(mockDriftData);
      const { app } = buildApp();

      // Act
      const response = await request(app).get('/api/v1/stats/taste-drift');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockDriftData);
      expect(mockGenreAnalysisService.getTasteDrift).toHaveBeenCalledWith(24);
    });

    it('should pass months parameter to service', async () => {
      // Arrange
      mockGenreAnalysisService.getTasteDrift = jest
        .fn()
        .mockResolvedValue(mockDriftData);
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/taste-drift?months=12'
      );

      // Assert
      expect(response.status).toBe(200);
      expect(mockGenreAnalysisService.getTasteDrift).toHaveBeenCalledWith(12);
    });

    it('should return 400 for invalid months value (zero)', async () => {
      // Arrange
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/taste-drift?months=0'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('months');
    });

    it('should return 400 for non-numeric months', async () => {
      // Arrange
      const { app } = buildApp();

      // Act
      const response = await request(app).get(
        '/api/v1/stats/taste-drift?months=abc'
      );

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 503 when genre analysis service is not available', async () => {
      // Arrange — create app without genreAnalysisService (pass undefined explicitly)
      const appWithoutGenre = createTestApp({
        mountPath: '/api/v1/stats',
        routerFactory: () =>
          createStatsRouter(
            mockFileStorage,
            mockAuthService,
            mockStatsService,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined // no genreAnalysisService
          ),
        mocks: {},
      });

      // Act
      const response = await request(appWithoutGenre.app).get(
        '/api/v1/stats/taste-drift'
      );

      // Assert
      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });

    it('should return 500 when service throws', async () => {
      // Arrange
      mockGenreAnalysisService.getTasteDrift = jest
        .fn()
        .mockRejectedValue(new Error('Analysis failed'));
      const { app } = buildApp();

      // Act
      const response = await request(app).get('/api/v1/stats/taste-drift');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Analysis failed');
    });

    it('should return empty result when no data is available', async () => {
      // Arrange
      mockGenreAnalysisService.getTasteDrift = jest.fn().mockResolvedValue({
        snapshots: [],
        totalQuarters: 0,
        topGenresOverall: [],
      });
      const { app } = buildApp();

      // Act
      const response = await request(app).get('/api/v1/stats/taste-drift');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.snapshots).toEqual([]);
      expect(response.body.data.totalQuarters).toBe(0);
    });
  });
});
