import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

import createWrappedRouter from '../../../src/backend/routes/wrapped';
import { DiscogsService } from '../../../src/backend/services/discogsService';
import { ImageService } from '../../../src/backend/services/imageService';
import { ScrobbleHistoryStorage } from '../../../src/backend/services/scrobbleHistoryStorage';
import { StatsService } from '../../../src/backend/services/statsService';
import { WrappedService } from '../../../src/backend/services/wrappedService';
import { FileStorage } from '../../../src/backend/utils/fileStorage';
import { WrappedData } from '../../../src/shared/types';

// Mock dependencies
jest.mock('../../../src/backend/services/wrappedService');
jest.mock('../../../src/backend/services/statsService');
jest.mock('../../../src/backend/services/scrobbleHistoryStorage');
jest.mock('../../../src/backend/services/discogsService');
jest.mock('../../../src/backend/services/imageService');
jest.mock('../../../src/backend/utils/fileStorage');

const MockedWrappedService = WrappedService as jest.MockedClass<
  typeof WrappedService
>;
const MockedStatsService = StatsService as jest.MockedClass<
  typeof StatsService
>;
const MockedHistoryStorage = ScrobbleHistoryStorage as jest.MockedClass<
  typeof ScrobbleHistoryStorage
>;
const MockedDiscogsService = DiscogsService as jest.MockedClass<
  typeof DiscogsService
>;
const MockedImageService = ImageService as jest.MockedClass<
  typeof ImageService
>;
const MockedFileStorage = FileStorage as jest.MockedClass<typeof FileStorage>;

describe('Wrapped Routes', () => {
  let app: express.Application;
  let mockWrappedService: jest.Mocked<WrappedService>;

  const mockWrappedData: WrappedData = {
    startDate: 1704067200000, // 2024-01-01
    endDate: 1735689600000, // 2024-12-31
    generatedAt: Date.now(),
    listening: {
      totalScrobbles: 2847,
      estimatedListeningHours: 166,
      uniqueArtists: 145,
      uniqueAlbums: 312,
      topArtists: [{ name: 'Radiohead', artist: 'Radiohead', playCount: 142 }],
      topAlbums: [
        {
          name: 'Radiohead - OK Computer',
          artist: 'Radiohead',
          album: 'OK Computer',
          playCount: 47,
        },
      ],
      topTracks: [
        {
          name: 'Paranoid Android',
          artist: 'Radiohead',
          album: 'OK Computer',
          playCount: 23,
        },
      ],
      newArtistsDiscovered: 12,
      newArtistsList: [],
      peakListeningDay: { date: '2024-06-15', scrobbleCount: 85 },
      peakListeningHour: { hour: 20, scrobbleCount: 342 },
      longestStreak: {
        days: 23,
        startDate: '2024-03-01',
        endDate: '2024-03-23',
      },
      heatmapData: [{ date: '2024-01-01', count: 15 }],
    },
    collection: {
      recordsAdded: 23,
      recordsList: [],
      mostPlayedNewAddition: {
        artist: 'Radiohead',
        title: 'In Rainbows',
        playCount: 47,
        dateAdded: 1705363200000,
      },
    },
    crossSource: {
      collectionCoverage: 67,
      totalCollectionSize: 450,
      albumsPlayed: 301,
      vinylScrobbles: 1200,
      otherScrobbles: 1647,
      vinylPercentage: 42,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    const mockFileStorage = new MockedFileStorage(
      'test'
    ) as jest.Mocked<FileStorage>;
    const mockStatsService = new MockedStatsService(
      mockFileStorage,
      new MockedHistoryStorage(mockFileStorage)
    ) as jest.Mocked<StatsService>;
    const mockHistoryStorage = new MockedHistoryStorage(
      mockFileStorage
    ) as jest.Mocked<ScrobbleHistoryStorage>;
    const mockDiscogsService = new MockedDiscogsService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<DiscogsService>;
    const mockImageService = new MockedImageService(
      mockFileStorage,
      {} as any
    ) as jest.Mocked<ImageService>;

    mockWrappedService = new MockedWrappedService(
      mockStatsService,
      mockHistoryStorage,
      mockDiscogsService,
      mockImageService,
      mockFileStorage
    ) as jest.Mocked<WrappedService>;

    mockWrappedService.generateWrapped = jest
      .fn()
      .mockResolvedValue(mockWrappedData);

    // Create Express app
    app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json());
    app.use((_req, res, next) => {
      res.set('Connection', 'close');
      next();
    });
    app.use('/api/v1/wrapped', createWrappedRouter(mockWrappedService));
  });

  describe('GET /api/v1/wrapped', () => {
    it('should return wrapped data for valid date range', async () => {
      // Arrange
      const startDate = 1704067200000;
      const endDate = 1735689600000;

      // Act
      const response = await request(app)
        .get(`/api/v1/wrapped?startDate=${startDate}&endDate=${endDate}`)
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.listening.totalScrobbles).toBe(2847);
      expect(mockWrappedService.generateWrapped).toHaveBeenCalledWith(
        startDate,
        endDate
      );
    });

    it('should reject missing startDate', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/wrapped?endDate=1735689600000')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should reject missing endDate', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/wrapped?startDate=1704067200000')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });

    it('should reject non-numeric parameters', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/wrapped?startDate=abc&endDate=def')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('valid numbers');
    });

    it('should reject startDate >= endDate', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/wrapped?startDate=1735689600000&endDate=1704067200000')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('before');
    });

    it('should reject future endDate', async () => {
      // Arrange
      const futureDate = Date.now() + 86400000; // Tomorrow

      // Act
      const response = await request(app)
        .get(`/api/v1/wrapped?startDate=1704067200000&endDate=${futureDate}`)
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('future');
    });

    it('should reject Infinity values', async () => {
      // Act
      const response = await request(app)
        .get('/api/v1/wrapped?startDate=Infinity&endDate=1735689600000')
        .expect(400);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('valid numbers');
    });

    it('should handle service errors gracefully', async () => {
      // Arrange
      mockWrappedService.generateWrapped = jest
        .fn()
        .mockRejectedValue(new Error('Service error'));

      // Act
      const response = await request(app)
        .get('/api/v1/wrapped?startDate=1704067200000&endDate=1735689600000')
        .expect(500);

      // Assert
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to generate');
    });
  });
});
